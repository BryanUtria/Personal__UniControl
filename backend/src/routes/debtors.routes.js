const express = require('express');
const router = express.Router();
const db = require('../../db');
const { mapType } = require('../utils/helpers');
// --- DEUDORES (CLIENTES) ---

router.get('/', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    const sql = `
        SELECT d.id, d.name, d.phone, d.email, d.identification, d.address, d.notes, d.type, d.created_at as createdAt,
               COALESCE(SUM(CASE WHEN t.type = 'debt' THEN t.amount * t.quantity ELSE -(t.amount * t.quantity) END), 0) as totalDebt
        FROM debtors d
        LEFT JOIN debts t ON d.id = t.debtor_id
        WHERE (d.user_id = ? OR (d.user_id IS NULL AND ? IS NULL)) AND d.active = 1
        GROUP BY d.id
        ORDER BY d.id DESC
    `;
    try {
        const rows = await db.query(sql, [userId, userId]);
        // Formatear tipos DECIMAL de MySQL a número
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            name: r.name,
            phone: r.phone,
            email: r.email,
            identification: r.identification,
            address: r.address,
            notes: r.notes,
            type: mapType(r.type),
            createdAt: r.createdAt,
            totalDebt: parseFloat(r.totalDebt)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear un cliente
router.post('/', async (req, res) => {
    const { name, phone, email, identification, address, notes, type } = req.body;
    const userId = req.headers['x-user-id'] || null;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    try {
        const result = await db.query(
            'INSERT INTO debtors (name, phone, email, identification, address, notes, type, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, phone || null, email || null, identification || null, address || null, notes || null, mapType(type), userId]
        );
        res.json({
            id: result.insertId.toString(),
            name,
            phone,
            email,
            identification,
            address,
            notes,
            type: mapType(type),
            totalDebt: 0,
            createdAt: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar un cliente
router.put('/:id', async (req, res) => {
    const { name, phone, email, identification, address, notes, type } = req.body;
    try {
        await db.query(
            'UPDATE debtors SET name = ?, phone = ?, email = ?, identification = ?, address = ?, notes = ?, type = ? WHERE id = ?',
            [name, phone || null, email || null, identification || null, address || null, notes || null, mapType(type), req.params.id]
        );
        res.json({ id: req.params.id, name, phone, email, identification, address, notes, type: mapType(type) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un cliente (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        await db.query('UPDATE debtors SET active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DEUDAS Y ABONOS (ITEMS) NESTED ---

// Obtener todas las deudas y abonos de un cliente específico
router.get('/:id/debts', async (req, res) => {
    const sql = `
        SELECT id, amount, quantity, description, type, created_at as date 
        FROM debts 
        WHERE debtor_id = ? 
        ORDER BY id DESC
    `;
    try {
        const rows = await db.query(sql, [req.params.id]);
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            amount: parseFloat(r.amount),
            quantity: r.quantity,
            description: r.description,
            type: r.type,
            date: r.date
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Agregar una deuda o abono a un cliente
router.post('/:id/debts', async (req, res) => {
    const { amount, quantity, description, type } = req.body;
    if (!amount || !type) return res.status(400).json({ error: 'Monto y tipo obligatorios.' });

    try {
        const result = await db.query(
            'INSERT INTO debts (debtor_id, amount, quantity, description, type) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, amount, quantity || 1, description, type]
        );
        res.json({
            id: result.insertId.toString(),
            amount,
            quantity: quantity || 1,
            description,
            type,
            date: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




module.exports = router;
