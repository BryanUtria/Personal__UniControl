const express = require('express');
const router = express.Router();
const db = require('../../db');

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    req.userId = userId;
    next();
};

router.use(authMiddleware);

// Helper function to check admin
const checkAdmin = async (userId) => {
    const rows = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
    if (rows.length > 0 && rows[0].role === 'admin') {
        return true;
    }
    return false;
};

// GET /suggestions
router.get('/', async (req, res) => {
    try {
        const isAdmin = await checkAdmin(req.userId);
        
        if (isAdmin) {
            // Admin sees all suggestions
            const rows = await db.query(`
                SELECT s.*, u.name as user_name, u.username as user_username
                FROM suggestions s
                JOIN users u ON s.user_id = u.id
                ORDER BY s.created_at DESC
            `);
            res.json(rows);
        } else {
            // Client sees their own suggestions
            const rows = await db.query(
                'SELECT * FROM suggestions WHERE user_id = ? ORDER BY created_at DESC', 
                [req.userId]
            );
            res.json(rows);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /suggestions
router.post('/', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'El mensaje es obligatorio' });
    
    try {
        const result = await db.query(
            'INSERT INTO suggestions (user_id, message) VALUES (?, ?)',
            [req.userId, message]
        );
        const newSuggestion = await db.query('SELECT * FROM suggestions WHERE id = ?', [result.insertId]);
        res.status(201).json(newSuggestion[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /suggestions/:id/reply
router.put('/:id/reply', async (req, res) => {
    const { id } = req.params;
    const { admin_reply } = req.body;
    
    if (!admin_reply) return res.status(400).json({ error: 'La respuesta es obligatoria' });
    
    try {
        const isAdmin = await checkAdmin(req.userId);
        if (!isAdmin) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        await db.query(
            'UPDATE suggestions SET admin_reply = ?, status = ? WHERE id = ?',
            [admin_reply, 'replied', id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /suggestions/:id (Opcional, pero util)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const isAdmin = await checkAdmin(req.userId);
        if (isAdmin) {
            await db.query('DELETE FROM suggestions WHERE id = ?', [id]);
        } else {
            await db.query('DELETE FROM suggestions WHERE id = ? AND user_id = ?', [id, req.userId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
