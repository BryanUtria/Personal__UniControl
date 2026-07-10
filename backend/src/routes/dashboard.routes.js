const express = require('express');
const router = express.Router();
const db = require('../../db');
const { mapType } = require('../utils/helpers');
// --- DASHBOARD ---

router.get('/custom', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    const { start, end } = req.query;
    if (!start || !end) {
        return res.status(400).json({ error: 'Las fechas de inicio y fin son requeridas.' });
    }

    try {
        const [salesData] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count 
             FROM sales 
             WHERE DATE(created_at) >= ? AND DATE(created_at) <= ? 
             AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [start, end, userId, userId]
        );

        const [profitData] = await db.query(
            `SELECT COALESCE(SUM(si.quantity * (si.price - COALESCE(p.cost_price, 0))), 0) AS profit
             FROM sales s
             JOIN sale_items si ON s.id = si.sale_id
             JOIN products p ON si.product_id = p.id
             WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ? 
             AND (s.user_id = ? OR (s.user_id IS NULL AND ? IS NULL))`,
            [start, end, userId, userId]
        );

        res.json({
            sales_total: parseFloat(salesData.total),
            sales_count: parseInt(salesData.count),
            profit_total: parseFloat(profitData.profit)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    const userId = req.headers['x-user-id'] || null;
    try {
        const userFilter = userId ? 'AND user_id = ?' : 'AND (user_id IS NULL OR 1=1)';
        const userParam = userId ? [userId] : [];

        // Ventas de hoy (total y utilidad)
        const [todaySales] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM sales WHERE DATE(created_at) = CURDATE() AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );
        const [todayProfit] = await db.query(
            `SELECT COALESCE(SUM(si.quantity * (si.price - COALESCE(p.cost_price, 0))), 0) AS profit
             FROM sales s
             JOIN sale_items si ON s.id = si.sale_id
             JOIN products p ON si.product_id = p.id
             WHERE DATE(s.created_at) = CURDATE() AND (s.user_id = ? OR (s.user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );

        // Ventas de esta semana
        const [weekSales] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );
        const [weekProfit] = await db.query(
            `SELECT COALESCE(SUM(si.quantity * (si.price - COALESCE(p.cost_price, 0))), 0) AS profit
             FROM sales s
             JOIN sale_items si ON s.id = si.sale_id
             JOIN products p ON si.product_id = p.id
             WHERE YEARWEEK(s.created_at, 1) = YEARWEEK(CURDATE(), 1) AND (s.user_id = ? OR (s.user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );

        // Ventas del mes
        const [monthSales] = await db.query(
            `SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
            [userId, userId]
        );
        const [monthProfit] = await db.query(
            `SELECT COALESCE(SUM(si.quantity * (si.price - COALESCE(p.cost_price, 0))), 0) AS profit
             FROM sales s
             JOIN sale_items si ON s.id = si.sale_id
             JOIN products p ON si.product_id = p.id
             WHERE MONTH(s.created_at) = MONTH(CURDATE()) AND YEAR(s.created_at) = YEAR(CURDATE()) AND (s.user_id = ? OR (s.user_id IS NULL AND ? IS NULL))`,
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
            today_profit_total: parseFloat(todayProfit.profit),
            week_sales_total: parseFloat(weekSales.total),
            week_profit_total: parseFloat(weekProfit.profit),
            month_sales_total: parseFloat(monthSales.total),
            month_profit_total: parseFloat(monthProfit.profit),
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



module.exports = router;
