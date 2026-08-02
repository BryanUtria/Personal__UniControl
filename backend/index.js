const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Logger HTTP para ver peticiones en consola

app.get('/api/version', (req, res) => {
    res.json({
        version: process.env.VERSION || '1.0.0',
        apkUrl: process.env.APK_URL || 'https://github.com/BryanUtria/Personal__UniControl/releases/download/v1.0.3/Unicontrol.apk',
        webUrl: process.env.WEB_URL || 'https://unicontrol.onrender.com/'
    });
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

// Inicializar el scheduler de notificaciones
require('./src/utils/notificationScheduler');

const server = http.createServer(app);

server.on('error', (err) => {
    console.error('Error del servidor:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
