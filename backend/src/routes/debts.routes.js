const express = require('express');
const router = express.Router();
const db = require('../../db');

// --- DEUDAS Y ABONOS (ITEMS) ---


// Actualizar un movimiento
router.put('/:id', async (req, res) => {
    const { amount, quantity, description, type } = req.body;
    try {
        await db.query(
            'UPDATE debts SET amount = ?, quantity = ?, description = ?, type = ? WHERE id = ?',
            [amount, quantity, description, type, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un movimiento
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM debts WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




module.exports = router;
