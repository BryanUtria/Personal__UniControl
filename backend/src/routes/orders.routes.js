const express = require('express');
const router = express.Router();
const db = require('../../db');
const { discountStock, returnStock, returnStockByPrice } = require('../utils/helpers');
// --- PEDIDOS EN COLA (MESAS / CUENTAS PENDIENTES) ---

// Obtener todas las órdenes pendientes (en cola)
router.get('/', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    try {
        const rows = await db.query(
            "SELECT * FROM orders WHERE status = 'pending' AND (user_id = ? OR (user_id IS NULL AND ? IS NULL)) ORDER BY created_at DESC",
            [userId, userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear una nueva orden pendiente (mesa)
router.post('/', async (req, res) => {
    const { reference } = req.body;
    const userId = req.headers['x-user-id'] || null;
    if (!reference || !reference.trim()) {
        return res.status(400).json({ error: 'La referencia o mesa es obligatoria.' });
    }
    try {
        const result = await db.query(
            "INSERT INTO orders (reference, status, user_id) VALUES (?, 'pending', ?)",
            [reference.trim(), userId]
        );
        res.json({ id: result.insertId, reference: reference.trim(), status: 'pending' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancelar/Eliminar una orden completa (Devolviendo stock)
router.delete('/:id', async (req, res) => {
    const orderId = req.params.id;
    try {
        await db.query('START TRANSACTION');
        // Obtener items para regresar el stock al inventario
        const items = await db.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
        for (let item of items) {
            await returnStock(item.product_id, item.quantity);
        }
        // Borrar el pedido (y por cascada sus order_items)
        await db.query('DELETE FROM orders WHERE id = ?', [orderId]);
        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        try { await db.query('ROLLBACK'); } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// Obtener los artículos consumidos en una orden
router.get('/:id/items', async (req, res) => {
    try {
        const rows = await db.query(
            'SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.price, oi.subtotal, p.name, p.code, p.stock FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
            [req.params.id]
        );
        // Formatear numéricos
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            order_id: r.order_id.toString(),
            product_id: r.product_id,
            quantity: parseInt(r.quantity, 10),
            price: parseFloat(r.price),
            subtotal: parseFloat(r.subtotal),
            name: r.name,
            code: r.code,
            stock: parseInt(r.stock, 10)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Agregar/Actualizar un producto en un pedido (Verificando y restando stock en caliente)
router.post('/:id/items', async (req, res) => {
    const { product_id, quantity } = req.body;
    const order_id = req.params.id;
    const qtyInt = parseInt(quantity, 10);
    if (!product_id || !qtyInt) {
        return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    try {
        await db.query('START TRANSACTION');

        // Validar stock disponible en base de datos
        const product = await db.query('SELECT stock FROM products WHERE id = ?', [product_id]);
        if (product.length === 0) {
            throw new Error('Producto no encontrado.');
        }
        if (product[0].stock < qtyInt) {
            throw new Error('Stock insuficiente en el inventario.');
        }

        // Restar el stock en caliente y obtener desglose de lotes (precios y cantidades)
        const discountedDetails = await discountStock(product_id, qtyInt);

        let lastId = null;
        for (let detail of discountedDetails) {
            const { quantity: itemQty, price: itemPrice } = detail;
            const subtotal = itemQty * itemPrice;

            // Verificar si ya existe el producto con ese mismo precio en la orden
            const existing = await db.query(
                'SELECT id, quantity FROM order_items WHERE order_id = ? AND product_id = ? AND price = ?',
                [order_id, product_id, itemPrice]
            );

            if (existing.length > 0) {
                const newQty = existing[0].quantity + itemQty;
                const newSubtotal = newQty * itemPrice;
                await db.query(
                    'UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?',
                    [newQty, newSubtotal, existing[0].id]
                );
                lastId = existing[0].id;
            } else {
                const insertRes = await db.query(
                    'INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                    [order_id, product_id, itemQty, itemPrice, subtotal]
                );
                lastId = insertRes.insertId;
            }
        }

        await db.query('COMMIT');
        res.json({ success: true, id: lastId });
    } catch (err) {
        try { await db.query('ROLLBACK'); } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// Modificar la cantidad de un artículo directamente (Verificando y ajustando stock por lote)
router.put('/:id/items/:itemId', async (req, res) => {
    const { quantity } = req.body;
    const { itemId } = req.params;
    const newQty = parseInt(quantity, 10);
    if (quantity === undefined) return res.status(400).json({ error: 'La cantidad es obligatoria.' });

    try {
        await db.query('START TRANSACTION');

        // Obtener el item existente en la orden
        const existing = await db.query('SELECT product_id, quantity, price FROM order_items WHERE id = ?', [itemId]);
        if (existing.length === 0) {
            throw new Error('Artículo no encontrado en el pedido.');
        }
        const { product_id, quantity: oldQty, price } = existing[0];
        const diff = newQty - oldQty;

        if (newQty <= 0) {
            // Devolver todo el stock del lote correspondiente al precio de esta línea
            await returnStockByPrice(product_id, oldQty, parseFloat(price));
            await db.query('DELETE FROM order_items WHERE id = ?', [itemId]);
        } else {
            if (diff > 0) {
                // Intentar tomar stock del mismo lote (mismo precio) primero
                const samePriceBatch = await db.query(
                    'SELECT id, quantity FROM product_batches WHERE product_id = ? AND price = ? AND quantity > 0 ORDER BY created_at ASC LIMIT 1',
                    [product_id, parseFloat(price)]
                );
                if (samePriceBatch.length > 0 && samePriceBatch[0].quantity >= diff) {
                    // Hay stock en el mismo lote al mismo precio
                    await db.query('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?', [diff, samePriceBatch[0].id]);
                    await db.query(
                        'UPDATE products SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ?) WHERE id = ?',
                        [product_id, product_id]
                    );
                } else {
                    // No hay suficiente del mismo lote: usar FIFO general
                    const product = await db.query('SELECT stock FROM products WHERE id = ?', [product_id]);
                    if (product[0].stock < diff) {
                        throw new Error('Stock insuficiente en el inventario para agregar más.');
                    }
                    await discountStock(product_id, diff);
                }
            } else if (diff < 0) {
                // Devolver stock al lote del mismo precio
                await returnStockByPrice(product_id, -diff, parseFloat(price));
            }

            const subtotal = newQty * parseFloat(price);
            await db.query(
                'UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?',
                [newQty, subtotal, itemId]
            );
        }

        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        try { await db.query('ROLLBACK'); } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un artículo de la orden (Devolviendo stock)
router.delete('/:id/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
        await db.query('START TRANSACTION');
        const existing = await db.query('SELECT product_id, quantity, price FROM order_items WHERE id = ?', [itemId]);
        if (existing.length > 0) {
            const { product_id, quantity, price } = existing[0];
            // Devolver stock al lote del mismo precio
            await returnStockByPrice(product_id, quantity, parseFloat(price));
            await db.query('DELETE FROM order_items WHERE id = ?', [itemId]);
        }
        await db.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        try { await db.query('ROLLBACK'); } catch (e) { }
        res.status(500).json({ error: err.message });
    }
});

// Cobrar/Finalizar pedido (Checkout - El stock ya fue restado, solo se procesa la venta)
router.post('/:id/checkout', async (req, res) => {
    const { debtor_id } = req.body;
    const order_id = req.params.id;
    const userId = req.headers['x-user-id'] || null;

    try {
        await db.query('START TRANSACTION');

        // Obtener la referencia de la orden antes de completarla
        const orderData = await db.query('SELECT reference FROM orders WHERE id = ?', [order_id]);
        const order_reference = orderData.length > 0 ? orderData[0].reference : null;

        // 1. Obtener los items de la orden
        const items = await db.query(
            'SELECT product_id, quantity, price, subtotal FROM order_items WHERE order_id = ?',
            [order_id]
        );

        if (items.length === 0) {
            throw new Error('El pedido no tiene artículos.');
        }

        // 2. Calcular el total
        let total = 0;
        items.forEach(item => {
            total += item.quantity * parseFloat(item.price);
        });

        // 3. Crear el registro oficial en sales incluyendo el id, referencia del pedido y debtor_id
        const saleResult = await db.query(
            'INSERT INTO sales (total, user_id, order_id, order_reference, debtor_id) VALUES (?, ?, ?, ?, ?)',
            [total, userId, order_id, order_reference, debtor_id || null]
        );
        const sale_id = saleResult.insertId;

        // 4. Copiar los items a sale_items (El stock de products ya fue restado en caliente)
        for (let item of items) {
            await db.query(
                'INSERT INTO sale_items (sale_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [sale_id, item.product_id, item.quantity, item.price, item.subtotal]
            );
        }

        // 5. Si es a crédito, registrar la deuda
        if (debtor_id) {
            await db.query(
                'INSERT INTO debts (debtor_id, amount, quantity, description, type) VALUES (?, ?, 1, ?, ?)',
                [debtor_id, total, `Compra POS (Pedido) - Venta #${sale_id}`, 'debt']
            );
        }

        // 6. Marcar la orden como completada
        await db.query("UPDATE orders SET status = 'completed' WHERE id = ?", [order_id]);

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



module.exports = router;
