const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/version', (req, res) => {
    res.json({ 
        version: process.env.version || '1.0.0',
        apkUrl: process.env.APK_URL || 'https://tu-servidor.com/Unicontrol.apk'
    });
});

// Registrar Rutas
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/dashboard', require('./src/routes/dashboard.routes'));
app.use('/api/products', require('./src/routes/products.routes'));
app.use('/api/sales', require('./src/routes/sales.routes'));
app.use('/api/orders', require('./src/routes/orders.routes'));
app.use('/api/debtors', require('./src/routes/debtors.routes'));
app.use('/api/debts', require('./src/routes/debts.routes'));
app.use('/api', require('./src/routes/modules.routes'));
app.use('/api/users', require('./src/routes/users.routes'));
app.use('/api/habits', require('./src/routes/habits.routes'));

const server = http.createServer(app);

server.on('error', (err) => {
    console.error('Error del servidor:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
