const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Acceso a la BD para leer/escribir las versiones de backend y frontend
const db = require('./db');

app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Logger HTTP para ver peticiones en consola

// --- VERSIONES DE LA APLICACIÓN ---
// Lee la versión del backend y del frontend desde la tabla app_versions (fuente única de verdad).
app.get('/api/version', async (req, res) => {
    try {
        const rows = await db.query('SELECT app_key, version, apk_url, web_url, updated_at FROM app_versions');
        const byKey = {};
        rows.forEach(r => { byKey[r.app_key] = r; });

        const backend = byKey['backend'] || {};
        const frontend = byKey['frontend'] || {};

        res.json({
            // "version" se mantiene como la versión publicada del frontend
            // para no romper el modal de actualización (VersionCheckModal).
            version: frontend.version || process.env.VERSION || '1.0.0',
            backendVersion: backend.version || process.env.VERSION || '1.0.0',
            frontendVersion: frontend.version || process.env.VERSION || '1.0.0',
            apkUrl: frontend.apk_url || process.env.APK_URL || '',
            webUrl: frontend.web_url || process.env.WEB_URL || '',
            updatedAt: frontend.updated_at || null
        });
    } catch (err) {
        console.error('Error al leer versiones desde la BD:', err);
        // Fallback a variables de entorno si la BD falla
        res.json({
            version: process.env.VERSION || '1.0.0',
            backendVersion: process.env.VERSION || '1.0.0',
            frontendVersion: process.env.VERSION || '1.0.0',
            apkUrl: process.env.APK_URL || '',
            webUrl: process.env.WEB_URL || ''
        });
    }
});

// Actualiza las versiones en la BD (solo administradores).
// Permite publicar una nueva versión sin tocar el .env ni redesplegar.
app.put('/api/version', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    try {
        const userRows = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
        const isAdmin = userRows.length > 0 && userRows[0].role === 'admin';
        if (!isAdmin) return res.status(403).json({ error: 'No autorizado' });

        const { backendVersion, frontendVersion, apkUrl, webUrl } = req.body || {};

        if (backendVersion) {
            await db.query(`
                INSERT INTO app_versions (app_key, version) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE version = VALUES(version)
            `, ['backend', String(backendVersion)]);
        }

        if (frontendVersion) {
            await db.query(`
                INSERT INTO app_versions (app_key, version) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE version = VALUES(version)
            `, ['frontend', String(frontendVersion)]);
        }

        if (apkUrl !== undefined) {
            await db.query(`
                INSERT INTO app_versions (app_key, apk_url) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE apk_url = VALUES(apk_url)
            `, ['frontend', String(apkUrl)]);
        }

        if (webUrl !== undefined) {
            await db.query(`
                INSERT INTO app_versions (app_key, web_url) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE web_url = VALUES(web_url)
            `, ['frontend', String(webUrl)]);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar Rutas
// Ruta de retorno de MercadoPago (sin prefijo /api, apunta a /success)
app.use('/', require('./src/routes/success.routes'));

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/shops', require('./src/routes/shops.routes'));
app.use('/api/dashboard', require('./src/routes/dashboard.routes'));
app.use('/api/products', require('./src/routes/products.routes'));
app.use('/api/sales', require('./src/routes/sales.routes'));
app.use('/api/orders', require('./src/routes/orders.routes'));
app.use('/api/debtors', require('./src/routes/debtors.routes'));
app.use('/api/debts', require('./src/routes/debts.routes'));
app.use('/api', require('./src/routes/modules.routes'));
app.use('/api/users', require('./src/routes/users.routes'));
app.use('/api/habits', require('./src/routes/habits.routes'));
app.use('/api/expenses', require('./src/routes/expenses.routes'));
app.use('/api/push', require('./src/routes/push.routes'));
app.use('/api/suggestions', require('./src/routes/suggestions.routes'));
app.use('/api/boards', require('./src/routes/boards.routes'));

// Inicializar el scheduler de notificaciones
require('./src/utils/notificationScheduler');

const server = http.createServer(app);

server.on('error', (err) => {
    console.error('Error del servidor:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
