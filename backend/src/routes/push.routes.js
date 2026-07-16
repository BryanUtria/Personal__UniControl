const express = require('express');
const router = express.Router();
const db = require('../../db');

// Middleware para verificar usuario
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    req.userId = userId;
    next();
};

// Registrar un push token
router.post('/token', requireAuth, async (req, res) => {
    const { token, device_type } = req.body;
    if (!token) return res.status(400).json({ error: 'Token es obligatorio' });

    try {
        await db.query(`
            INSERT INTO push_tokens (user_id, token, device_type) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE device_type = VALUES(device_type), created_at = CURRENT_TIMESTAMP
        `, [req.userId, token, device_type || 'unknown']);
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un push token (al cerrar sesión)
router.delete('/token', requireAuth, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token es obligatorio' });

    try {
        await db.query(`DELETE FROM push_tokens WHERE user_id = ? AND token = ?`, [req.userId, token]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
