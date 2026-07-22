const db = require('../../db');
const nodemailer = require('nodemailer');

const mapType = (t) => {
    if (t === 'supplier' || t === 'deuda') return 'deuda';
    if (t === 'saving' || t === 'ahorro') return 'ahorro';
    return 'deudor';
};

const createTransporter = () => {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: false
            },
            family: 4 // Fuerza a usar IPv4 para evitar el error ENETUNREACH de IPv6
        });
    }
    return null;
};

async function discountStock(productId, qtyToDiscount) {
    if (qtyToDiscount <= 0) return [];

    const batches = await db.query(
        'SELECT id, quantity, price FROM product_batches WHERE product_id = ? AND quantity > 0 ORDER BY created_at ASC',
        [productId]
    );

    let remaining = qtyToDiscount;
    const discountedDetails = [];

    for (let batch of batches) {
        if (remaining <= 0) break;

        if (batch.quantity >= remaining) {
            await db.query(
                'UPDATE product_batches SET quantity = quantity - ? WHERE id = ?',
                [remaining, batch.id]
            );
            discountedDetails.push({
                batch_id: batch.id,
                quantity: remaining,
                price: parseFloat(batch.price)
            });
            remaining = 0;
        } else {
            const qtyUsed = batch.quantity;
            remaining -= qtyUsed;
            await db.query(
                'UPDATE product_batches SET quantity = 0 WHERE id = ?',
                [batch.id]
            );
            discountedDetails.push({
                batch_id: batch.id,
                quantity: qtyUsed,
                price: parseFloat(batch.price)
            });
        }
    }

    if (remaining > 0) {
        throw new Error('Stock insuficiente en los lotes del producto.');
    }

    await db.query(
        'UPDATE products SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ?) WHERE id = ?',
        [productId, productId]
    );

    return discountedDetails;
}

async function returnStock(productId, qtyToReturn) {
    if (qtyToReturn <= 0) return;

    const batches = await db.query(
        'SELECT id, initial_quantity, quantity FROM product_batches WHERE product_id = ? AND quantity < initial_quantity ORDER BY created_at DESC',
        [productId]
    );

    let remaining = qtyToReturn;
    for (let batch of batches) {
        if (remaining <= 0) break;
        const availableSpace = batch.initial_quantity - batch.quantity;

        if (availableSpace >= remaining) {
            await db.query(
                'UPDATE product_batches SET quantity = quantity + ? WHERE id = ?',
                [remaining, batch.id]
            );
            remaining = 0;
        } else {
            remaining -= availableSpace;
            await db.query(
                'UPDATE product_batches SET quantity = initial_quantity WHERE id = ?',
                [batch.id]
            );
        }
    }

    if (remaining > 0) {
        const lastBatch = await db.query(
            'SELECT id FROM product_batches WHERE product_id = ? ORDER BY created_at DESC LIMIT 1',
            [productId]
        );
        if (lastBatch.length > 0) {
            await db.query(
                'UPDATE product_batches SET quantity = quantity + ? WHERE id = ?',
                [remaining, lastBatch[0].id]
            );
        } else {
            const prod = await db.query('SELECT price, cost_price, profit_margin FROM products WHERE id = ?', [productId]);
            const price = prod.length > 0 ? prod[0].price : 0;
            const cost = prod.length > 0 ? prod[0].cost_price || 0 : 0;
            const margin = prod.length > 0 ? prod[0].profit_margin || 0 : 0;

            await db.query(
                'INSERT INTO product_batches (product_id, initial_quantity, quantity, cost_price, profit_margin, price) VALUES (?, ?, ?, ?, ?, ?)',
                [productId, remaining, remaining, cost, margin, price]
            );
        }
    }

    await db.query(
        'UPDATE products SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ?) WHERE id = ?',
        [productId, productId]
    );
}

async function returnStockByPrice(productId, qtyToReturn, priceTarget) {
    if (qtyToReturn <= 0) return;

    const samePriceBatches = await db.query(
        'SELECT id, initial_quantity, quantity FROM product_batches WHERE product_id = ? AND price = ? AND quantity < initial_quantity ORDER BY created_at DESC',
        [productId, priceTarget]
    );

    let remaining = qtyToReturn;
    for (let batch of samePriceBatches) {
        if (remaining <= 0) break;
        const space = batch.initial_quantity - batch.quantity;
        const toRestore = Math.min(space, remaining);
        await db.query('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?', [toRestore, batch.id]);
        remaining -= toRestore;
    }

    if (remaining > 0) {
        await returnStock(productId, remaining);
        return; 
    }

    await db.query(
        'UPDATE products SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ?) WHERE id = ?',
        [productId, productId]
    );
}

module.exports = {
    mapType,
    createTransporter,
    discountStock,
    returnStock,
    returnStockByPrice
};
