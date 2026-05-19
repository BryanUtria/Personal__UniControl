# UniControl - Backend API ⚙️

Este es el servidor y la API REST para **UniControl**, un sistema moderno para la gestión de inventarios, punto de venta (POS) y control de deudores. Está construido con **Node.js**, **Express**, **MySQL** y soporte para envío de correos mediante **Nodemailer**.

El backend está diseñado con aislamiento multiusuario, permitiendo que cada usuario gestione sus propios productos, ventas, deudores y pedidos a través del header `x-user-id` en las solicitudes.

---

## 🚀 Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución para JavaScript.
- **Express**: Framework minimalista para el manejo de rutas y peticiones HTTP.
- **MySQL (`mysql2`)**: Base de datos relacional para el almacenamiento persistente y escalable de la información.
- **BcryptJS**: Encriptación de contraseñas mediante hashing.
- **Nodemailer**: Envío de correos de verificación para el registro seguro de usuarios.
- **CORS & Dotenv**: Middleware de comunicación segura y gestión de variables de entorno.

---

## 📦 Sistema de Inventario y Control de Stock (FIFO)

Una de las características más importantes de este backend es su motor de inventarios basado en el método **FIFO (First In, First Out / Primero en Entrar, Primero en Salir)**, gestionado mediante lotes:
- **Lotes de Productos (`product_batches`)**: Cada vez que se crea un producto con stock inicial o se recarga stock (`/recharge`), se crea un lote específico que registra:
  - Cantidad inicial y cantidad restante.
  - Precio de costo y margen de ganancia.
  - Precio de venta de ese lote específico.
- **Descuento de Stock**: Al realizar una venta o agregar productos a un pedido activo, el sistema descuenta unidades de los lotes más antiguos que tengan stock disponible.
- **Devolución de Stock**: Si se cancela un pedido o se reduce la cantidad de un artículo, el sistema devuelve las unidades prioritariamente al lote del mismo precio o, en su defecto, al lote más reciente para mantener la consistencia del inventario.

---

## 📂 Estructura de la Base de Datos

Al iniciar el servidor, este crea automáticamente la base de datos (si no existe) y las siguientes tablas relacionales (motor InnoDB):

1. **`users`**: Registro de usuarios del sistema (id, name, username, password, email).
2. **`verification_codes`**: Códigos temporales de 6 dígitos enviados por correo para verificar cuentas. Expiran en 10 minutos.
3. **`products`**: Catálogo de productos activos (con columnas para `user_id`, código de barras, stock mínimo y soft-delete con la columna `active`).
4. **`product_batches`**: Lotes de stock individuales para el control FIFO y de costos.
5. **`sales` y `sale_items`**: Ventas concretadas con desglose de productos y subtotales. Admite asociar un cliente para ventas a crédito.
6. **`orders` y `order_items`**: Cola de pedidos en espera (por ejemplo, cuentas de mesas o apartados) con modificación de stock en caliente.
7. **`debtors`**: Clientes deudores (nombre, teléfono, identificación, dirección, notas y soft-delete).
8. **`debts`**: Historial de movimientos de cuentas (cargos por compras a crédito o abonos de dinero).

---

## 🛠️ Instalación y Configuración

### 1. Requisitos Previos
- **Node.js** instalado (v16 o superior recomendado).
- Servidor **MySQL** en ejecución (localmente o en la nube).

### 2. Configuración de Variables de Entorno
Crea un archivo `.env` en la raíz de la carpeta `backend` basándote en la siguiente plantilla:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu-contrasena
DB_NAME=unicontrol

# --- CONFIGURACIÓN DE CORREO (SMTP) ---
# Completa estos campos para habilitar el envío real de códigos de verificación.
# Si los dejas vacíos, el servidor correrá en "Modo Sandbox" e imprimirá el código en la consola.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=tu-contrasena-de-aplicacion
SMTP_SECURE=false
```

### 3. Instalación e Inicio
Navega a la carpeta `backend` en tu terminal, instala las dependencias y corre el servidor:

```bash
# Instalar dependencias
npm install

# Iniciar servidor en modo desarrollo/producción
npm start
```

> Por defecto, el servidor iniciará en **`http://localhost:3001`**.

---

## 📌 Endpoints de la API REST

Todas las peticiones que requieran datos de un usuario específico deben incluir el header `x-user-id: <ID_DEL_USUARIO>`.

### 🔑 Autenticación (`/api/auth`)
- `POST /api/auth/send-code`: Envía un código de 6 dígitos al correo proporcionado. Si no hay SMTP configurado, activa el *Modo Sandbox* y retorna el código directamente en el JSON de respuesta.
- `POST /api/auth/register`: Registra un nuevo usuario validando el código de verificación enviado.
- `POST /api/auth/login`: Autentica al usuario y devuelve sus datos básicos (ID, nombre, etc.).

### 📊 Dashboard (`/api/dashboard`)
- `GET /api/dashboard`: Obtiene estadísticas clave en tiempo real:
  - Total y conteo de ventas del día, semana y mes.
  - Pedidos pendientes en cola.
  - Balance de deudas activas y saldo a favor de clientes.
  - Alerta de productos con stock bajo (menor o igual a su `min_stock` establecido o 5 por defecto).
  - Valor estimado total del inventario.
  - Últimas 5 ventas registradas.

### 📦 Productos (`/api/products`)
- `GET /api/products`: Obtiene la lista de productos activos asociados al usuario.
- `POST /api/products`: Registra un producto nuevo. Si tiene stock inicial, crea automáticamente su primer lote.
- `PUT /api/products/:id`: Actualiza la información general del producto.
- `DELETE /api/products/:id`: Realiza un soft-delete del producto (marca `active = 0`).
- `GET /api/products/:id/batches`: Obtiene todos los lotes de stock de un producto (con cantidades, costo y precio).
- `POST /api/products/:id/recharge`: Registra una nueva entrada de mercancía creando un nuevo lote con sus costos y precios específicos, actualizando el stock total del producto.

### 🛒 Ventas (`/api/sales`)
- `GET /api/sales`: Obtiene el historial de ventas concretadas, incluyendo el nombre del cliente deudor en caso de compras a crédito.
- `POST /api/sales`: Registra una venta directa. Descuenta stock mediante FIFO. Si se proporciona un `debtor_id`, genera automáticamente un cargo en la cuenta del deudor.
- `GET /api/sales/:id/items`: Obtiene los productos detallados incluidos en una venta.

### 📋 Pedidos en Cola (`/api/orders`)
- `GET /api/orders`: Obtiene todos los pedidos con estado `pending` (mesas o cuentas abiertas).
- `POST /api/orders`: Crea una orden nueva especificando una referencia (ej. "Mesa 4", "Pedido Juan").
- `DELETE /api/orders/:id`: Cancela una orden completa y devuelve todo el stock de sus artículos al inventario.
- `GET /api/orders/:id/items`: Lista los productos de una orden.
- `POST /api/orders/:id/items`: Agrega o incrementa un producto en la orden en caliente (descontando stock del inventario de forma inmediata).
- `PUT /api/orders/:id/items/:itemId`: Modifica directamente la cantidad de un artículo de la orden, recalculando y ajustando el stock del inventario (toma o devuelve stock según corresponda).
- `DELETE /api/orders/:id/items/:itemId`: Quita un producto de la orden y devuelve su stock al inventario.
- `POST /api/orders/:id/checkout`: Cobra la orden y la convierte en una venta oficial. Si se asocia un `debtor_id`, lo registra como cuenta por cobrar. Cambia el estado de la orden a `completed`.

### 👥 Deudores y Créditos (`/api/debtors`)
- `GET /api/debtors`: Lista de clientes deudores con su balance neto (deuda acumulada - abonos realizados).
- `POST /api/debtors`: Registra un nuevo deudor.
- `PUT /api/debtors/:id`: Edita la información del cliente.
- `DELETE /api/debtors/:id`: Soft-delete del cliente.
- `GET /api/debtors/:id/debts`: Obtiene el historial completo de cargos (deudas) y abonos (pagos) del cliente.
- `POST /api/debtors/:id/debts`: Agrega un movimiento manual a la cuenta del deudor:
  - `type: 'debt'`: Cargo (aumenta la deuda).
  - `type: 'payment'`: Abono (reduce la deuda).
- `PUT /api/debts/:id`: Edita un movimiento manual existente.
- `DELETE /api/debts/:id`: Elimina un movimiento de deuda o abono.
