const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- ENDPOINT PARA CONTROL DE VERSIONES ---
app.get('/api/version', (req, res) => {
    res.json({ 
        version: process.env.version || '1.0.0',
        apkUrl: process.env.APK_URL || 'https://tu-servidor.com/Unicontrol.apk'
    });
});

const mapType = (t) => {
    if (t === 'supplier' || t === 'deuda') return 'deuda';
    if (t === 'saving' || t === 'ahorro') return 'ahorro';
    return 'deudor';
};

// Transporter dinámico para nodemailer
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
        });
    }
    return null;
};

// --- HELPERS PARA MANEJO DE LOTES Y STOCK (FIFO) ---

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

    // Intentar devolver al lote del mismo precio que tenga espacio
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

    // Si aún sobra, devolver a cualquier lote disponible (FIFO inverso)
    if (remaining > 0) {
        await returnStock(productId, remaining);
        return; // returnStock ya actualiza el stock total
    }

    await db.query(
        'UPDATE products SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ?) WHERE id = ?',
        [productId, productId]
    );
}

// --- AUTENTICACIÓN ---

// Enviar código de verificación por correo
app.post('/api/auth/send-code', async (req, res) => {
    const { email, username } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    }

    try {
        // 1. Verificar si el usuario ya está tomado
        if (username) {
            const existingUsers = await db.query('SELECT * FROM users WHERE username = ?', [username]);
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'El nombre de usuario ya está registrado.' });
            }
        }

        // 2. Verificar si el correo ya está en uso
        const existingEmails = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingEmails.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado con otra cuenta.' });
        }

        // Generar un código aleatorio de 6 dígitos
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Guardar código en la BD con expiración en 10 minutos
        await db.query(
            'INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
            [email, code]
        );

        let emailSent = false;
        let sandboxMode = true;
        const transporter = createTransporter();

        if (transporter) {
            try {
                await transporter.sendMail({
                    from: `"UniControl Admin" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: 'Código de Verificación - UniControl',
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px;">
                            <h2 style="color: #2563EB; text-align: center;">Verificación de Correo - UniControl</h2>
                            <p>¡Hola!</p>
                            <p>Has solicitado registrarte en UniControl. Usa el siguiente código de seguridad de un solo uso para verificar tu correo:</p>
                            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #111827; margin: 20px 0;">
                                ${code}
                            </div>
                            <p style="font-size: 12px; color: #6b7280; text-align: center;">Este código expirará en 10 minutos. Si no has solicitado esto, puedes ignorar este mensaje.</p>
                        </div>
                    `
                });
                emailSent = true;
                sandboxMode = false;
            } catch (mailErr) {
                console.error('Error enviando correo SMTP, recurriendo a modo sandbox:', mailErr);
            }
        }

        // Imprimir de forma llamativa en la consola
        console.log('\n┌────────────────────────────────────────────────────────┐');
        console.log(`│  [UNICONTROL VERIFICACIÓN DE CORREO]                   │`);
        console.log(`│  Destinatario: ${email.padEnd(40)} │`);
        console.log(`│  Código:       \x1b[32m\x1b[1m${code}\x1b[0m                      │`);
        console.log(`│  Estado:       ${(emailSent ? 'ENVIADO POR SMTP' : 'SANDBOX / CONSOLA').padEnd(39)} │`);
        console.log('└────────────────────────────────────────────────────────┘\n');

        res.json({
            success: true,
            sandboxMode,
            // Retornamos el código en la respuesta si estamos en sandbox para que sea 100% testable de inmediato sin SMTP
            sandboxCode: sandboxMode ? code : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar un nuevo usuario con verificación
app.post('/api/auth/register', async (req, res) => {
    const { name, username, password, email, code } = req.body;
    if (!name || !username || !password || !email || !code) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios (Nombre, Usuario, Contraseña, Correo y Código).' });
    }

    try {
        // 1. Verificar si el usuario ya está tomado
        const existingUsers = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya está registrado.' });
        }

        // 2. Verificar si el correo ya está en uso
        const existingEmails = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingEmails.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
        }

        // 3. Validar código de verificación
        const codes = await db.query(
            'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
            [email, code]
        );

        if (codes.length === 0) {
            return res.status(400).json({ error: 'El código de verificación es incorrecto o ha expirado.' });
        }

        // 4. Limpiar códigos usados para este correo
        await db.query('DELETE FROM verification_codes WHERE email = ?', [email]);

        // 5. Encriptar contraseña y crear el usuario
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (name, username, password, email) VALUES (?, ?, ?, ?)',
            [name, username, hashedPassword, email]
        );

        res.json({ id: result.insertId, name, username, email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Iniciar sesión
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    }
    try {
        const rows = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
        }
        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
        }
        res.json({ id: user.id, name: user.name, username: user.username, email: user.email });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DASHBOARD ---

app.get('/api/dashboard', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    try {
        const userFilter = userId ? 'AND user_id = ?' : 'AND (user_id IS NULL OR 1=1)';
        const userParam = userId ? [userId] : [];

        // Ventas de hoy (total)
        const [todaySales] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM sales WHERE DATE(created_at) = CURDATE() AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );

        // Ventas de esta semana
        const [weekSales] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );

        // Ventas del mes
        const [monthSales] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );

        // Pedidos en curso (pending)
        const [pendingOrders] = await db.query(
            `SELECT COUNT(*) AS count FROM orders WHERE status = 'pending' AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );

        // Total deuda pendiente y saldo a favor (deudores)
        const debtRows = await db.query(
            `SELECT d.debtor_id, d.type, d.amount, d.quantity, dr.type AS debtor_type FROM debts d JOIN debtors dr ON d.debtor_id = dr.id WHERE (dr.user_id = ? OR (dr.user_id IS NULL AND ? IS NULL)) AND dr.active = 1`,
            [userId, userId]
        );

        // Agrupar por deudor para calcular saldo individual
        const debtorBalances = {};
        for (const row of debtRows) {
            const debtorId = row.debtor_id;
            const val = parseFloat(row.amount) * (parseInt(row.quantity) || 1);
            const change = row.type === 'debt' ? val : -val;

            if (!debtorBalances[debtorId]) {
                debtorBalances[debtorId] = {
                    balance: 0,
                    type: mapType(row.debtor_type)
                };
            }
            debtorBalances[debtorId].balance += change;
        }

        let totalDebt = 0;   // Suma de saldos pendientes a cobrar (Clientes)
        let totalCredit = 0; // Suma de saldos a favor de clientes (Clientes)
        let totalPayable = 0; // Suma de cuentas por pagar (Proveedores)

        for (const debtorId in debtorBalances) {
            const item = debtorBalances[debtorId];
            const type = mapType(item.type);
            if (type === 'deuda') {
                if (item.balance > 0) {
                    totalPayable += item.balance;
                }
            } else if (type === 'ahorro') {
                if (item.balance < 0) {
                    totalCredit += Math.abs(item.balance);
                }
            } else {
                // deudor
                if (item.balance > 0) {
                    totalDebt += item.balance;
                } else if (item.balance < 0) {
                    totalCredit += Math.abs(item.balance);
                }
            }
        }

        // Productos con stock bajo o agotado
        const lowStockProducts = await db.query(
            `SELECT id, name, stock, min_stock FROM products WHERE (user_id = ? OR (user_id IS NULL AND ? IS NULL)) AND active = 1 AND stock <= COALESCE(min_stock, 5) ORDER BY stock ASC LIMIT 5`,
            [userId, userId]
        );

        // Total de productos únicos
        const [totalProducts] = await db.query(
            `SELECT COUNT(*) AS count FROM products WHERE (user_id = ? OR (user_id IS NULL AND ? IS NULL)) AND active = 1`,
            [userId, userId]
        );

        // Valor estimado total del inventario (suma stock * precio)
        const [inventoryValue] = await db.query(
            `SELECT COALESCE(SUM(stock * price), 0) AS total FROM products WHERE (user_id = ? OR (user_id IS NULL AND ? IS NULL)) AND active = 1`,
            [userId, userId]
        );

        // Últimas 5 ventas
        const recentSales = await db.query(
            `SELECT id, total, debtor_id, created_at FROM sales WHERE (user_id = ? OR (user_id IS NULL AND ? IS NULL)) ORDER BY created_at DESC LIMIT 5`,
            [userId, userId]
        );

        res.json({
            today_sales_total: parseFloat(todaySales.total),
            today_sales_count: parseInt(todaySales.count),
            week_sales_total: parseFloat(weekSales.total),
            month_sales_total: parseFloat(monthSales.total),
            pending_orders_count: parseInt(pendingOrders.count),
            total_debt: totalDebt,
            total_credit: totalCredit,
            total_payable: totalPayable,
            low_stock_products: lowStockProducts,
            total_products: parseInt(totalProducts.count),
            inventory_value: parseFloat(inventoryValue.total),
            recent_sales: recentSales.map(s => ({
                id: s.id,
                total: parseFloat(s.total),
                payment_type: s.debtor_id ? 'debt' : 'cash',
                created_at: s.created_at
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PRODUCTOS ---

// Obtener todos los productos activos
app.get('/api/products', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    try {
        const rows = await db.query(
            `SELECT p.*, 
                    (SELECT COUNT(*) FROM product_batches b WHERE b.product_id = p.id) AS total_batches,
                    (SELECT COUNT(*) FROM product_batches b WHERE b.product_id = p.id AND b.quantity > 0) AS available_batches
             FROM products p 
             WHERE (p.user_id = ? OR (p.user_id IS NULL AND ? IS NULL)) AND p.active = 1`,
            [userId, userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear un producto nuevo
app.post('/api/products', async (req, res) => {
    const { name, description, price, stock, cost_price, profit_margin, code, min_stock } = req.body;
    const userId = req.headers['x-user-id'] || null;
    try {
        const result = await db.query(
            'INSERT INTO products (name, description, price, stock, user_id, cost_price, profit_margin, code, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, description, price, stock || 0, userId, cost_price || null, profit_margin || null, code || null, min_stock !== undefined ? min_stock : 5]
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
app.put('/api/products/:id', async (req, res) => {
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
app.get('/api/products/:id/batches', async (req, res) => {
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
app.post('/api/products/:id/recharge', async (req, res) => {
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
app.delete('/api/products/:id', async (req, res) => {
    try {
        const result = await db.query('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
        res.json({ deleted: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- VENTAS ---

// Registrar una nueva venta
app.post('/api/sales', async (req, res) => {
    const { items, debtor_id } = req.body; // items es un array de { product_id, quantity, price }, debtor_id es opcional
    const userId = req.headers['x-user-id'] || null;

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
            'INSERT INTO sales (total, user_id, debtor_id) VALUES (?, ?, ?)',
            [total, userId, debtor_id || null]
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
app.get('/api/sales', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    const sql = `
        SELECT s.*, d.name as debtor_name 
        FROM sales s 
        LEFT JOIN debtors d ON s.debtor_id = d.id 
        WHERE s.user_id = ? OR (s.user_id IS NULL AND ? IS NULL) 
        ORDER BY s.created_at DESC
    `;
    try {
        const rows = await db.query(sql, [userId, userId]);
        // Formatear tipos DECIMAL de MySQL a número
        const formatted = rows.map(r => ({
            id: r.id.toString(),
            total: parseFloat(r.total),
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
app.get('/api/sales/:id/items', async (req, res) => {
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


// --- PEDIDOS EN COLA (MESAS / CUENTAS PENDIENTES) ---

// Obtener todas las órdenes pendientes (en cola)
app.get('/api/orders', async (req, res) => {
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
app.post('/api/orders', async (req, res) => {
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
app.delete('/api/orders/:id', async (req, res) => {
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
app.get('/api/orders/:id/items', async (req, res) => {
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
app.post('/api/orders/:id/items', async (req, res) => {
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
app.put('/api/orders/:id/items/:itemId', async (req, res) => {
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
app.delete('/api/orders/:id/items/:itemId', async (req, res) => {
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
app.post('/api/orders/:id/checkout', async (req, res) => {
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

// --- DEUDORES (CLIENTES) ---

app.get('/api/debtors', async (req, res) => {
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
app.post('/api/debtors', async (req, res) => {
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
app.put('/api/debtors/:id', async (req, res) => {
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
app.delete('/api/debtors/:id', async (req, res) => {
    try {
        await db.query('UPDATE debtors SET active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- DEUDAS Y ABONOS (ITEMS) ---

// Obtener todas las deudas y abonos de un cliente específico
app.get('/api/debtors/:id/debts', async (req, res) => {
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
            date: r.date ? new Date(r.date).toISOString() : new Date().toISOString()
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Agregar una deuda o abono a un cliente
app.post('/api/debtors/:id/debts', async (req, res) => {
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

// Actualizar un movimiento
app.put('/api/debts/:id', async (req, res) => {
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
app.delete('/api/debts/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM debts WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- INICIAR SERVIDOR ---
const server = http.createServer(app);

server.on('error', (err) => {
    console.error('Error del servidor:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});