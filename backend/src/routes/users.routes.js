const express = require('express');
const router = express.Router();
const db = require('../../db');

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
            showHabits: true
        };

        // Sobrescribir con lo que haya en la base de datos
        rows.forEach(r => {
            let val = r.setting_value;
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else {
                try { val = JSON.parse(val); } catch(e) {}
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



module.exports = router;
