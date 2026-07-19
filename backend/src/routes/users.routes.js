const express = require('express');
const router = express.Router();
const db = require('../../db');
const bcrypt = require('bcryptjs');

// --- ENDPOINTS DE AJUSTES DE USUARIO ---
router.get('/settings', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    try {
        const rows = await db.query('SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?', [userId]);

        // Defaults
        const settings = {
            showShop: true,
            showDebtors: true,
            showHabits: true,
            showExpenses: true
        };

        // Sobrescribir con lo que haya en la base de datos
        rows.forEach(r => {
            let val = r.setting_value;
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else {
                try { val = JSON.parse(val); } catch (e) { }
            }
            settings[r.setting_key] = val;
        });

        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/settings', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Formato inválido' });
    }

    try {
        for (const [key, value] of Object.entries(settings)) {
            let strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
            await db.query(`
                INSERT INTO user_settings (user_id, setting_key, setting_value) 
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            `, [userId, key, strVal]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/profile', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const { name, username, email, password, code } = req.body;
    
    try {
        if (username) {
            const existingUser = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
            if (existingUser.length > 0) return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
        }
        
        if (email) {
            const existingEmail = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
            if (existingEmail.length > 0) return res.status(400).json({ error: 'El correo ya está registrado por otro usuario' });

            const currentUser = await db.query('SELECT email FROM users WHERE id = ?', [userId]);
            if (currentUser[0].email !== email) {
                if (!code) return res.status(400).json({ error: 'Se requiere el código de verificación para cambiar el correo.' });
                
                const codes = await db.query(
                    'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
                    [email, code]
                );

                if (codes.length === 0) {
                    return res.status(400).json({ error: 'El código de verificación es incorrecto o ha expirado.' });
                }

                await db.query('DELETE FROM verification_codes WHERE email = ?', [email]);
            }
        }

        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (name) { updates.push('name = ?'); params.push(name); }
        if (username) { updates.push('username = ?'); params.push(username); }
        if (email) { updates.push('email = ?'); params.push(email); }
        if (password && password.trim().length > 0) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        }

        if (updates.length > 0) {
            query += updates.join(', ') + ' WHERE id = ?';
            params.push(userId);
            await db.query(query, params);
        }

        const updatedRows = await db.query('SELECT id, name, username, email, role FROM users WHERE id = ?', [userId]);
        if (updatedRows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        
        res.json({ success: true, user: updatedRows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
