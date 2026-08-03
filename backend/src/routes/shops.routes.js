const express = require('express');
const router = express.Router();
const db = require('../../db');

// Generar un código alfanumérico único para la tienda
function generateShopCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres ambiguos (I, O, 0, 1)
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// --- TIENDAS ---

// Obtener todas las tiendas a las que el usuario pertenece
router.get('/', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(400).json({ error: 'x-user-id requerido.' });

    try {
        const rows = await db.query(
            `SELECT s.id, s.code, s.name, s.owner_user_id,
                    (s.owner_user_id = ?) AS is_owner,
                    sm.role AS member_role,
                    (SELECT COUNT(*) FROM shop_members sm2 WHERE sm2.shop_id = s.id) AS member_count,
                    (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.active = 1) AS product_count
             FROM shops s
             JOIN shop_members sm ON sm.shop_id = s.id
             WHERE sm.user_id = ? AND s.active = 1
             ORDER BY s.created_at ASC`,
            [userId, userId]
        );
        const formatted = rows.map(r => ({
            ...r,
            is_owner: r.is_owner === 1 || r.is_owner === true,
            member_count: parseInt(r.member_count, 10),
            product_count: parseInt(r.product_count, 10)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear una nueva tienda
router.post('/', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { name } = req.body;
    if (!userId) return res.status(400).json({ error: 'x-user-id requerido.' });
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la tienda es obligatorio.' });
    }

    try {
        // Generar un código único
        let code = generateShopCode();
        let exists = await db.query('SELECT id FROM shops WHERE code = ?', [code]);
        while (exists.length > 0) {
            code = generateShopCode();
            exists = await db.query('SELECT id FROM shops WHERE code = ?', [code]);
        }

        // Crear la tienda
        const result = await db.query(
            'INSERT INTO shops (code, name, owner_user_id) VALUES (?, ?, ?)',
            [code, name.trim(), userId]
        );
        const shopId = result.insertId;

        // Agregar al creador como owner en shop_members
        await db.query(
            'INSERT INTO shop_members (shop_id, user_id, role) VALUES (?, ?, ?)',
            [shopId, userId, 'owner']
        );

        // Migrar datos existentes del usuario a la nueva tienda
        // (productos, ventas y pedidos sin tienda asignada)
        // NOTA: Los deudores/deudas/ahorros son personales del usuario y NO se migran a tiendas.
        const tablesToMigrate = ['products', 'sales', 'orders'];
        for (const table of tablesToMigrate) {
            await db.query(
                `UPDATE \`${table}\` SET shop_id = ? WHERE user_id = ? AND shop_id IS NULL`,
                [shopId, userId]
            );
        }

        res.json({
            id: shopId,
            code,
            name: name.trim(),
            owner_user_id: userId,
            is_owner: true,
            member_role: 'owner',
            member_count: 1,
            product_count: 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vincularse a una tienda existente mediante código
router.post('/join', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { code } = req.body;
    if (!userId) return res.status(400).json({ error: 'x-user-id requerido.' });
    if (!code || !code.trim()) {
        return res.status(400).json({ error: 'El código de tienda es obligatorio.' });
    }

    try {
        const shopCode = code.trim().toUpperCase();
        const shopRows = await db.query('SELECT * FROM shops WHERE code = ? AND active = 1', [shopCode]);
        if (shopRows.length === 0) {
            return res.status(404).json({ error: 'No existe una tienda con ese código.' });
        }
        const shop = shopRows[0];

        // Verificar si ya es miembro
        const existing = await db.query(
            'SELECT * FROM shop_members WHERE shop_id = ? AND user_id = ?',
            [shop.id, userId]
        );
        if (existing.length > 0) {
            return res.json({ id: shop.id, code: shop.code, name: shop.name, already_member: true });
        }

        // Agregar usuario como miembro
        await db.query(
            'INSERT INTO shop_members (shop_id, user_id, role) VALUES (?, ?, ?)',
            [shop.id, userId, 'member']
        );

        res.json({
            id: shop.id,
            code: shop.code,
            name: shop.name,
            owner_user_id: shop.owner_user_id,
            is_owner: false,
            member_role: 'member',
            already_member: false
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener el código de una tienda (para compartirlo)
router.get('/:id/code', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const shopId = req.params.id;
    if (!userId) return res.status(400).json({ error: 'x-user-id requerido.' });

    try {
        const member = await db.query(
            'SELECT * FROM shop_members WHERE shop_id = ? AND user_id = ?',
            [shopId, userId]
        );
        if (member.length === 0) {
            return res.status(403).json({ error: 'No tienes acceso a esta tienda.' });
        }

        const shopRows = await db.query('SELECT code, name FROM shops WHERE id = ?', [shopId]);
        if (shopRows.length === 0) {
            return res.status(404).json({ error: 'Tienda no encontrada.' });
        }

        res.json({ code: shopRows[0].code, name: shopRows[0].name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;