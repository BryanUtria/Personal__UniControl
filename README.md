# 📊 UniControl

UniControl es una solución integral y moderna de administración comercial diseñada para el control de deudores, historial de ventas, inventario por lotes y punto de venta (POS) con **capacidades avanzadas de sincronización offline**. 

Desarrollada bajo una arquitectura desacoplada con un Frontend en **React Native (Expo)** y un Backend en **Node.js (Express) con MySQL**.

---

## 🚀 Características Principales

* **Sincronización Offline Avanzada**: Toda la lógica crítica de creación, edición, recarga de stock y cobros en el Punto de Venta se puede operar completamente sin conexión. Los cambios pendientes se almacenan en una cola local (`AsyncStorage`) y se mezclan dinámicamente con los GET cacheados antes de ser sincronizados al recuperar internet.
* **Punto de Venta (POS)**: Creación de pedidos, carrito interactivo, cálculo automático de totales offline y cobros asignando el pago en efectivo o cargándolo como deuda a clientes.
* **Inventario & Control de Lotes**: Administración inteligente de stock a través de lotes de compra con costo, márgenes de ganancia y precios de venta individuales. Indicador de sincronización en tiempo real para lotes y productos modificados offline.
* **Control de Cuentas y Deudores**: Registro detallado de deudas y abonos por cliente, cálculo en tiempo real de saldos totales a cobrar y a favor.
* **Dashboard y Métricas**: Indicadores visuales en tiempo real sobre ventas diarias, transacciones, montos totales de deudas y alertas de stock bajo.
* **Interfaz de Usuario Premium**: Soporte nativo para modo oscuro y claro con una paleta de colores moderna y limpia basada en principios de diseño móvil actuales.

---

## 📁 Estructura del Proyecto

El proyecto está organizado en dos carpetas principales:

```text
UniControl/
├── backend/            # API REST construida en Node.js + Express + MySQL
│   ├── index.js        # Servidor principal y endpoints de la API
│   ├── db.js           # Inicialización y queries a la Base de Datos
│   ├── .env.example    # Plantilla de variables de entorno para el servidor
│   └── package.json
└── frontend/           # Aplicación móvil y web construida en Expo (React Native)
    ├── App.js          # Raíz del flujo de navegación y contextos
    ├── app.json        # Configuración global de Expo (Iconos, Assets, Compilación)
    ├── assets/         # Recursos de imágenes (Iconos, Splash, Favicon)
    ├── src/
    │   ├── context/    # Contexto de Autenticación y Notificaciones (Toast)
    │   ├── theme/      # Contexto de Temas y variables de color (Claro/Oscuro)
    │   ├── screens/    # Pantallas de la aplicación (Auth, POS, Inventario, Deudores)
    │   └── utils/      # Utilidades, fetch HTTP y lógica de cola offline (offlineSync)
    └── package.json
```

---

## 🛠️ Instalación y Configuración Local

### Prerrequisitos
* **Node.js** (versión 18 o superior recomendada).
* Servidor de Base de Datos **MySQL** activo.

---

### 1. Configuración del Backend

1. Entra a la carpeta del backend:
   ```bash
   cd backend
   ```
2. Instala las dependencias necesarias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` en la raíz de `backend` basándote en `.env.example`:
   ```env
   PORT=3001
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=tu_usuario_mysql
   DB_PASSWORD=tu_contraseña_mysql
   DB_NAME=unicontrol
   ```
4. Inicia el servidor de desarrollo:
   ```bash
   npm start
   ```
   *Nota: La primera vez que el servidor se ejecuta, creará automáticamente la base de datos `unicontrol` y todas las tablas necesarias.*

---

### 2. Configuración del Frontend

1. Entra a la carpeta del frontend:
   ```bash
   cd ../frontend
   ```
2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` en la raíz de `frontend`:
   ```env
   EXPO_PUBLIC_API_URL=http://localhost:3001/api
   ```
   *Nota: Si estás probando la aplicación en un celular físico en la misma red local, reemplaza `localhost` por la dirección IP privada de tu computadora (ej: `http://192.168.1.15:3001/api`).*

4. Ejecuta el servidor de desarrollo de Expo:
   ```bash
   npx expo start -c
   ```
   *Desde la terminal interactiva de Expo, presiona **`a`** para abrir en Android, **`i`** para iOS, o **`w`** para la versión Web en tu navegador.*

---

## 🛜 Lógica de Sincronización Offline

UniControl utiliza una arquitectura robusta para la resiliencia de datos cuando no hay conexión:

1. **Intercepción de Peticiones (`apiFetch`)**: Detecta si el dispositivo tiene internet. Si no tiene conexión, las peticiones que mutan datos (`POST`, `PUT`, `DELETE`) se registran en una cola local en `AsyncStorage`.
2. **Mezcla Local (`applyOfflineQueueToData`)**: Los endpoints de lectura (`GET`) consumen información de la caché de almacenamiento. Si hay cambios en la cola local que aún no se envían al servidor, el frontend los mezcla en memoria para que el usuario vea los productos, abonos, deudores o cobros actualizados al instante en la interfaz.
3. **Indicadores de Sincronización Visuales**: Los elementos pendientes de subir al servidor (productos editados, deudores nuevos, lotes agregados) muestran un icono naranja de "nube offline" (`cloud-offline-outline`), mientras que los sincronizados muestran el icono verde (`cloud-done-outline`).
4. **Notificaciones de Cobro**: Los totales de facturación offline se calculan en base a la sumatoria de artículos cacheados y peticiones locales, permitiendo notificaciones precisas de cobro aun en modo offline.

---

## 🚀 Despliegue en Producción

### Servidor y Base de Datos (Backend)
Se recomienda utilizar plataformas de la nube como **Railway.app** para un despliegue rápido de la API Node.js y MySQL enlazado, o configurar un servidor VPS propio (DigitalOcean, AWS) bajo un Proxy inverso con **Nginx** y certificado SSL (HTTPS).

### Cliente (Frontend)
* **Versión Web**: Ejecuta `npx expo export` y despliega la carpeta generada `dist` a servicios de hosting estático gratuitos como **Vercel** o **Netlify**.
* **Versión Móvil (Android/iOS)**: Configura las credenciales usando **EAS CLI** (`npm install -g eas-cli`) y compila tu APK de pruebas usando:
  ```bash
  eas build -p android --profile preview
  ```
