# UniControl - Frontend Mobile App 📱

Esta es la aplicación móvil e híbrida para **UniControl**, un sistema moderno para la gestión de inventarios, punto de venta y control de deudores. Está desarrollada sobre **React Native** utilizando **Expo (SDK 54)**, diseñada para conectarse a la [UniControl Backend API](file:///c:/Users/braya/OneDrive/Documentos/Trabajo/Apps%20Propias/UniControl/backend/README.md) y optimizada tanto para dispositivos móviles (Android/iOS mediante Expo Go) como para navegadores web.

---

## ✨ Características Principales

1. **📊 Dashboard Interactivo**
   - Resumen visual en tiempo real de las ventas del día, semana y mes.
   - Cantidad de pedidos pendientes y saldo global de cuentas por cobrar vs. saldo a favor.
   - Lista dinámica de productos con stock bajo o agotado.
   - Valor estimado total del inventario y listado de las últimas 5 ventas rápidas.

2. **🛒 Punto de Venta (POS)**
   - Buscador rápido de productos por nombre o código de barras.
   - Carrito de compras interactivo con actualización dinámica de cantidades.
   - Opciones para concretar ventas en efectivo (*Cash*) o cargadas a crédito (*Debt*) seleccionando un cliente deudor registrado.

3. **📋 Cola de Pedidos (Mesas / Cuentas Abiertas)**
   - Creación de pedidos con nombres de referencia personalizados (ej. "Mesa 1", "Pedido Carlos").
   - Modificación de productos y cantidades en caliente en la orden con descuento inmediato de stock del inventario.
   - Cierre de cuenta (*Checkout*) para facturar y procesar el pago directamente convirtiéndolo en venta.
   - Cancelación del pedido con devolución automatizada del stock a sus respectivos lotes.

4. **📦 Gestión de Inventario por Lotes**
   - Creación y edición de productos, especificando códigos de barra, descripción y stock mínimo de seguridad.
   - Consulta de lotes individuales de stock por producto.
   - Recargas de stock inteligentes especificando precio de costo, margen de ganancia y precio de venta final.

5. **👥 Control de Deudores y Crédito**
   - Directorio de clientes con buscador y balance neto de deuda.
   - Historial detallado de movimientos (cargos por compras en el POS y abonos de dinero en efectivo).
   - Registro de abonos rápidos o cargos manuales.

6. **📁 Exportación a Excel (.xlsx) Real**
   - Generación y descarga de archivos `.xlsx` compatibles con Excel, Google Sheets y LibreOffice.
   - Disponible para **Historial de Ventas**, **Catálogo de Inventario** e **Historial de Deudas de Clientes**.
   - En Web se descarga directamente del navegador. En móvil, utiliza `expo-file-system` y `expo-sharing` para abrir el menú nativo de compartir (guardar en archivos, enviar por WhatsApp, correo, etc.).

7. **🔌 Modo Offline y Sincronización Automática**
   - Detección en tiempo real del estado de la red con `@react-native-community/netinfo`.
   - Cuando no hay internet, la aplicación guarda las operaciones en una cola local dentro del almacenamiento persistente (`AsyncStorage`).
   - Un banner no intrusivo en la parte superior notifica el estado offline y la cantidad de cambios locales pendientes.
   - Al recuperar la conexión, el sistema sincroniza automáticamente todos los cambios acumulados en segundo plano o permite forzar una sincronización manual con un toque.

8. **🌓 Tema Oscuro / Claro Global**
   - Soporte nativo para temas adaptables utilizando un contexto de React (`ThemeProvider`), garantizando una experiencia visual cómoda en cualquier entorno de luz.

---

## 🛠️ Tecnologías Utilizadas

- **React Native & Expo (SDK 54)**: Desarrollo multiplataforma nativo.
- **React Navigation**: Gestión de rutas y pantallas mediante Stack Navigator.
- **Async Storage**: Almacenamiento local persistente y gestión de la caché offline.
- **NetInfo**: Monitoreo del estado de la conexión a internet.
- **XLSX (`xlsx`)**: Biblioteca de procesamiento de hojas de cálculo para las exportaciones.
- **Ionicons (Expo Vector Icons)**: Set de iconos premium.

---

## 📂 Estructura del Código

La lógica principal y las pantallas se organizan dentro del directorio `src`:

- `src/context/`: Contextos globales (`AuthContext`, `ToastContext`, `ThemeContext`).
- `src/navigation/`: Enrutador principal (`AppNavigator.js`).
- `src/screens/`:
  - `auth/`: Pantalla de Login, Registro y Verificación de código.
  - `dashboard/`: Vista principal del Dashboard.
  - `inventory/`: Pantallas de catálogo de productos, detalle de lotes y recarga de stock.
  - `pos/`: Terminal de venta y carrito de compras.
  - `sales/`: Historial de ventas y exportaciones.
  - `debtors/`: Listado de clientes deudores y detalle/historial de cuentas individuales.
- `src/theme/`: Definición de colores y estilos para modo claro y oscuro.
- `src/utils/`: Funciones utilitarias como el sincronizador offline (`offlineSync.js`) y exportador de archivos (`excelExport.js`).

---

## 🔧 Instalación y Configuración

### 1. Requisitos Previos
- Tener instalado **Node.js** (v18 o superior recomendado).
- Disponer de la aplicación **Expo Go** en tu celular Android o iOS, o configurar un emulador móvil.

### 2. Configurar Variable de Entorno
Crea un archivo `.env` en la raíz de la carpeta `frontend/` y define la URL base de tu servidor backend:

```env
EXPO_PUBLIC_API_URL=http://<IP_DE_TU_COMPUTADORA>:3001/api
```

> **Nota:** Si estás probando en un celular físico con Expo Go, debes colocar la IP local de tu computadora en lugar de `localhost` (ejemplo: `http://192.168.1.15:3001/api`), y ambos dispositivos deben estar conectados a la misma red Wi-Fi.

### 3. Ejecutar la Aplicación

Navega a la carpeta del frontend en tu terminal, instala los módulos y ejecuta Metro:

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo de Expo
npm start
```

Una vez que cargue el servidor de desarrollo en la consola:
- Escanea el código QR desde la app **Expo Go** (Android) o la cámara nativa (iOS) para abrirla en tu móvil.
- Presiona **`w`** para abrir la versión Web en tu navegador predeterminado.
- Presiona **`a`** para correr en un emulador de Android conectado.
- Presiona **`i`** para correr en el simulador de iOS.


## 📦 Compilación Local del APK (Android) sin EAS en la Nube

Si deseas compilar el archivo `.apk` de manera local en tu propia computadora de forma 100% gratuita y sin usar los servidores de Expo en la nube, sigue estos pasos:

### 1. Requisitos Previos en tu PC
* **Java Development Kit (JDK 17)** instalado.
* **Android Studio** y el **Android SDK** instalados.
* Variable de entorno `ANDROID_HOME` configurada apuntando a tu SDK de Android.

### 2. Configurar la URL de Producción
Antes de compilar, abre el archivo [.env](file:///c:/Users/braya/OneDrive/Documentos/Trabajo/Apps%20Propias/UniControl/frontend/.env) en `frontend/` y asegúrate de dejar activa la URL de tu API de producción en Render (comentando la IP local):

```env
# EXPO_PUBLIC_API_URL=http://192.168.20.22:3001/api
EXPO_PUBLIC_API_URL=https://unicontrol-backend.onrender.com/api
```

### 3. Generar y Compilar el APK
Para hacer todo el proceso automáticamente (limpiar, compilar y extraer el APK con el nombre `Unicontrol.apk`), hemos añadido un comando rápido. 

Ejecuta el siguiente comando desde la carpeta `frontend/`:

```bash
npm run build:apk-prod
```

### 4. Descargar tu APK
Una vez completada la compilación, encontrarás tu archivo instalable ya renombrado en la raíz de tu frontend:
`frontend/Unicontrol.apk`

### 5. Lanzar una nueva versión y subir el APK a GitHub
Para distribuir automáticamente la nueva actualización a los usuarios, subiremos el archivo APK generado a los **Releases** de tu repositorio usando GitHub CLI (`gh`).

**Paso 1: Sube tus últimos cambios a Git**
Primero asegúrate de confirmar y empujar la nueva versión (recuerda subir la versión en el `package.json`):
```bash
git add .
git commit -m "Actualización a nueva versión"
git push
```

**Paso 2: Crea el Release en GitHub**
Asegúrate de estar en la carpeta raíz del proyecto (la carpeta principal, no dentro del frontend) y ejecuta el siguiente comando, ajustando el número de versión (ej. `v1.0.1`):
```bash
gh release create v1.0.8 frontend/private/apk/Unicontrol.apk --title "Versión 1.0.8" --notes "Nueva actualización disponible"
```

**Paso 3: Actualizar Backend**
GitHub te devolverá un enlace directo de descarga. Copia ese enlace (o constrúyelo así: `https://github.com/BryanUtria/Personal__UniControl/releases/download/v1.0.1/Unicontrol.apk`) y ponlo en tu variable `APK_URL` dentro del archivo `.env` de tu **backend** en producción (Render).
