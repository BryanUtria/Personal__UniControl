const express = require('express');
const router = express.Router();
const db = require('../../db');

// --- PRODUCTOS ---

// Obtener todos los productos activos
router.get('/', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    const shopId = req.headers['x-shop-id'] || null;
    try {
        const rows = await db.query(
            `SELECT p.*, 
                    (SELECT COUNT(*) FROM product_batches b WHERE b.product_id = p.id) AS total_batches,
                    (SELECT COUNT(*) FROM product_batches b WHERE b.product_id = p.id AND b.quantity > 0) AS available_batches
             FROM products p 
             WHERE (p.user_id = ? OR (p.user_id IS NULL AND ? IS NULL)) AND p.active = 1
               AND (p.shop_id = ? OR (p.shop_id IS NULL AND ? IS NULL))`,
            [userId, userId, shopId, shopId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear un producto nuevo
router.post('/', async (req, res) => {
    const { name, description, price, stock, cost_price, profit_margin, code, min_stock } = req.body;
    const userId = req.headers['x-user-id'] || null;
    const shopId = req.headers['x-shop-id'] || null;
    try {
        const result = await db.query(
            'INSERT INTO products (name, description, price, stock, user_id, cost_price, profit_margin, code, min_stock, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, description, price, stock || 0, userId, cost_price || null, profit_margin || null, code || null, min_stock !== undefined ? min_stock : 5, shopId]
        );
        const productId = result.insertId;

        // Si se especificó stock inicial > 0, crear el lote correspondiente
        const qty = parseInt(stock, 10) || 0;
        if (qty > 0) {
            await db.query(
                'INSERT INTO product_batches (product_id, initial_quantity, quantity, cost_price, profit_margin, price) VALUES (?, ?, ?, ?, ?, ?)',
                [productId, qty, qty, cost_price || 0, profit_margin || 0, price]
            );
        }

        res.json({ id: productId, name, description, price, stock: qty, cost_price, profit_margin, code, min_stock });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar un producto
router.put('/:id', async (req, res) => {
    const { name, description, price, stock, cost_price, profit_margin, code, min_stock } = req.body;
    try {
        const result = await db.query(
            'UPDATE products SET name = ?, description = ?, price = ?, stock = ?, cost_price = ?, profit_margin = ?, code = ?, min_stock = ? WHERE id = ?',
            [name, description, price, stock, cost_price || null, profit_margin || null, code || null, min_stock !== undefined ? min_stock : 5, req.params.id]
        );
        res.json({ updated: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener lotes de un producto
router.get('/:id/batches', async (req, res) => {
    const productId = req.params.id;
    try {
        const rows = await db.query(
            'SELECT * FROM product_batches WHERE product_id = ? ORDER BY created_at DESC',
            [productId]
        );
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            product_id: r.product_id,
            initial_quantity: parseInt(r.initial_quantity, 10),
            quantity: parseInt(r.quantity, 10),
            cost_price: parseFloat(r.cost_price),
            profit_margin: r.profit_margin ? parseFloat(r.profit_margin) : null,
            price: parseFloat(r.price),
            created_at: r.created_at
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar nueva recarga de stock (Lote nuevo)
router.post('/:id/recharge', async (req, res) => {
    const productId = req.params.id;
    const { quantity, cost_price, profit_margin, price } = req.body;
    const qtyInt = parseInt(quantity, 10);

    if (!qtyInt || qtyInt <= 0) {
        return res.status(400).json({ error: 'La cantidad a recargar debe ser mayor a 0.' });
    }
    if (cost_price === undefined || price === undefined) {
        return res.status(400).json({ error: 'El precio de costo y precio de venta son obligatorios.' });
    }

    try {
        await db.query('START TRANSACTION');

        // 1. Crear el nuevo lote
        const result = await db.query(
            'INSERT INTO product_batches (product_id, initial_quantity, quantity, cost_price, profit_margin, price) VALUES (?, ?, ?, ?, ?, ?)',
            [productId, qtyInt, qtyInt, cost_price, profit_margin || null, price]
        );

        // 2. Sincronizar el stock total del producto en la tabla products y actualizar su costo/precio referencia
        await db.query(
            `UPDATE products 
             SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ?),
                 cost_price = ?,
                 profit_margin = ?,
                 price = ?
             WHERE id = ?`,
            [productId, cost_price, profit_margin || null, price, productId]
        );

        await db.query('COMMIT');
        res.json({ success: true, batchId: result.insertId });
    } catch (err) {
        try { await db.query('ROLLBACK'); } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un producto (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const result = await db.query('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
        res.json({ deleted: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



module.exports = router;
