const express = require('express');
const router = express.Router();
const db = require('../../db');
const { discountStock } = require('../utils/helpers');
// --- VENTAS ---

// Registrar una nueva venta
router.post('/', async (req, res) => {
    const { items, debtor_id } = req.body; // items es un array de { product_id, quantity, price }, debtor_id es opcional
    const userId = req.headers['x-user-id'] || null;
    const shopId = req.headers['x-shop-id'] || null;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'La venta debe tener al menos un producto.' });
    }

    let total = 0;
    items.forEach(item => {
        total += item.quantity * item.price;
    });

    try {
        // Ejecutar la transacción de forma secuencial
        await db.query('START TRANSACTION');

        const saleResult = await db.query(
            'INSERT INTO sales (total, user_id, debtor_id, shop_id) VALUES (?, ?, ?, ?)',
            [total, userId, debtor_id || null, shopId]
        );
        const sale_id = saleResult.insertId;

        for (let item of items) {
            const subtotal = item.quantity * item.price;
            await db.query(
                'INSERT INTO sale_items (sale_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [sale_id, item.product_id, item.quantity, item.price, subtotal]
            );
            await discountStock(item.product_id, item.quantity);
        }

        if (debtor_id) {
            await db.query(
                'INSERT INTO debts (debtor_id, amount, quantity, description, type) VALUES (?, ?, 1, ?, ?)',
                [debtor_id, total, `Compra POS - Venta #${sale_id}`, 'debt']
            );
        }

        await db.query('COMMIT');
        res.json({ success: true, sale_id, total });
    } catch (err) {
        try {
            await db.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Error al hacer ROLLBACK:', rollbackErr);
        }
        res.status(500).json({ error: err.message });
    }
});

// Obtener todas las ventas con nombre de deudor
router.get('/', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    const shopId = req.headers['x-shop-id'] || null;
    const sql = `
        SELECT s.*, d.name as debtor_name,
               (SELECT COALESCE(SUM(si.quantity * (si.price - COALESCE(p.cost_price, 0))), 0) 
                FROM sale_items si 
                JOIN products p ON si.product_id = p.id 
                WHERE si.sale_id = s.id) as profit
        FROM sales s 
        LEFT JOIN debtors d ON s.debtor_id = d.id 
        WHERE (s.user_id = ? OR (s.user_id IS NULL AND ? IS NULL)) 
          AND (s.shop_id = ? OR (s.shop_id IS NULL AND ? IS NULL))
        ORDER BY s.created_at DESC
    `;
    try {
        const rows = await db.query(sql, [userId, userId, shopId, shopId]);
        // Formatear tipos DECIMAL de MySQL a número
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            total: parseFloat(r.total),
            profit: parseFloat(r.profit),
            user_id: r.user_id,
            order_id: r.order_id,
            order_reference: r.order_reference,
            debtor_id: r.debtor_id,
            debtor_name: r.debtor_name,
            created_at: r.created_at
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener los detalles/artículos de una venta específica
router.get('/:id/items', async (req, res) => {
    const saleId = req.params.id;
    const sql = `
        SELECT si.id, si.sale_id, si.product_id, si.quantity, si.price, si.subtotal, p.name, p.code 
        FROM sale_items si 
        JOIN products p ON si.product_id = p.id 
        WHERE si.sale_id = ?
    `;
    try {
        const rows = await db.query(sql, [saleId]);
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            sale_id: r.sale_id.toString(),
            product_id: r.product_id,
            quantity: parseInt(r.quantity, 10),
            price: parseFloat(r.price),
            subtotal: parseFloat(r.subtotal),
            name: r.name,
            code: r.code
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




module.exports = router;
