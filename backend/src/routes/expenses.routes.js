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

// --- CATEGORÍAS ---

router.get('/categories', async (req, res) => {
    try {
        const rows = await db.query('SELECT * FROM expense_categories WHERE user_id = ? ORDER BY name ASC', [req.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/categories', async (req, res) => {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    try {
        const result = await db.query(
            'INSERT INTO expense_categories (user_id, name, icon, color) VALUES (?, ?, ?, ?)',
            [req.userId, name, icon || 'wallet-outline', color || '#4caf50']
        );
        const newCategory = await db.query('SELECT * FROM expense_categories WHERE id = ?', [result.insertId]);
        res.status(201).json(newCategory[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.put('/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
    try {
        await db.query(
            'UPDATE expense_categories SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?',
            [name, icon || 'wallet-outline', color || '#4caf50', id, req.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/categories/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Verificar si la categoría tiene gastos
        const expenses = await db.query('SELECT id FROM expenses WHERE category_id = ?', [id]);
        if (expenses.length > 0) {
            return res.status(400).json({ error: 'No puedes eliminar una categoría que tiene gastos asociados.' });
        }
        await db.query('DELETE FROM expense_categories WHERE id = ? AND user_id = ?', [id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- INGRESOS ---

router.get('/incomes', async (req, res) => {
    const { month_year } = req.query; // ej: 2026-07
    if (!month_year) return res.status(400).json({ error: 'Falta el parámetro month_year' });
    
    try {
        const rows = await db.query(
            'SELECT * FROM incomes WHERE user_id = ? AND month_year = ? ORDER BY created_at DESC', 
            [req.userId, month_year]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/incomes', async (req, res) => {
    const { month_year, description, amount } = req.body;
    if (!month_year || !description || !amount) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    
    try {
        const result = await db.query(
            'INSERT INTO incomes (user_id, month_year, description, amount) VALUES (?, ?, ?, ?)',
            [req.userId, month_year, description, amount]
        );
        const newIncome = await db.query('SELECT * FROM incomes WHERE id = ?', [result.insertId]);
        res.status(201).json(newIncome[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/incomes/:id', async (req, res) => {
    const { id } = req.params;
    const { description, amount } = req.body;
    if (!description || !amount) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    
    try {
        await db.query(
            'UPDATE incomes SET description = ?, amount = ? WHERE id = ? AND user_id = ?',
            [description, amount, id, req.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/incomes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM incomes WHERE id = ? AND user_id = ?', [id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GASTOS ---

router.get('/', async (req, res) => {
    const { month_year } = req.query; // ej: 2026-07
    if (!month_year) return res.status(400).json({ error: 'Falta el parámetro month_year' });
    
    try {
        const query = `
            SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
            FROM expenses e 
            JOIN expense_categories c ON e.category_id = c.id 
            WHERE e.user_id = ? AND e.month_year = ?
            ORDER BY e.created_at DESC
        `;
        const rows = await db.query(query, [req.userId, month_year]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    const { category_id, month_year, description, amount, is_paid, is_recurring, is_reserved, reminder_date, amount_paid, payment_date, payment_history } = req.body;
    if (!category_id || !month_year || !description || !amount) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    try {
        const result = await db.query(
            `INSERT INTO expenses (user_id, category_id, month_year, description, amount, is_paid, is_recurring, is_reserved, reminder_date, amount_paid, payment_date, payment_history) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.userId, category_id, month_year, description, amount, is_paid ? 1 : 0, is_recurring ? 1 : 0, is_reserved ? 1 : 0, reminder_date || null, amount_paid !== undefined ? amount_paid : (is_paid ? amount : 0), payment_date || null, payment_history || null]
        );
        const newExpense = await db.query(`
            SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
            FROM expenses e 
            JOIN expense_categories c ON e.category_id = c.id 
            WHERE e.id = ?`, [result.insertId]);
        res.status(201).json(newExpense[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { category_id, description, amount, is_paid, is_recurring, is_reserved, reminder_date, amount_paid, payment_date, payment_history } = req.body;
    try {
        await db.query(
            `UPDATE expenses SET category_id = ?, description = ?, amount = ?, is_paid = ?, is_recurring = ?, is_reserved = ?, reminder_date = ?, amount_paid = COALESCE(?, amount_paid), payment_date = ?, payment_history = ? 
             WHERE id = ? AND user_id = ?`,
            [category_id, description, amount, is_paid ? 1 : 0, is_recurring ? 1 : 0, is_reserved ? 1 : 0, reminder_date || null, amount_paid !== undefined ? amount_paid : null, payment_date || null, payment_history || null, id, req.userId]
        );
        const updatedExpense = await db.query(`
            SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
            FROM expenses e 
            JOIN expense_categories c ON e.category_id = c.id 
            WHERE e.id = ?`, [id]);
        res.json(updatedExpense[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GENERAR MES ---
router.post('/generate-month', async (req, res) => {
    const { previous_month, target_month, expense_ids, income_ids } = req.body;
    if (!previous_month || !target_month) return res.status(400).json({ error: 'Faltan parámetros de mes' });
    
    try {
        let expensesCount = 0;
        let incomesCount = 0;

        // Si pasan expense_ids explícitos, los usamos, sino buscamos los recurrentes (comportamiento legacy)
        let expensesToImport = [];
        if (expense_ids && Array.isArray(expense_ids) && expense_ids.length > 0) {
            const placeholders = expense_ids.map(() => '?').join(',');
            expensesToImport = await db.query(
                `SELECT * FROM expenses WHERE user_id = ? AND month_year = ? AND id IN (${placeholders})`,
                [req.userId, previous_month, ...expense_ids]
            );
        } else if (!expense_ids) {
            // Comportamiento por defecto (legacy)
            expensesToImport = await db.query(
                'SELECT * FROM expenses WHERE user_id = ? AND month_year = ? AND is_recurring = 1',
                [req.userId, previous_month]
            );
        }

        const formatToMySQL = (date) => {
            if (!date) return null;
            const pad = (n) => n < 10 ? '0' + n : n;
            return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        for (const exp of expensesToImport) {
            let newReminder = null;
            if (exp.reminder_date) {
                const date = new Date(exp.reminder_date);
                const [tyear, tmonth] = target_month.split('-');
                date.setFullYear(parseInt(tyear));
                date.setMonth(parseInt(tmonth) - 1);
                newReminder = formatToMySQL(date);
            }

            await db.query(
                `INSERT INTO expenses (user_id, category_id, month_year, description, amount, is_paid, is_recurring, reminder_date) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.userId, exp.category_id, target_month, exp.description, exp.amount, 0, exp.is_recurring, newReminder]
            );
            expensesCount++;
        }

        // Importar ingresos seleccionados
        if (income_ids && Array.isArray(income_ids) && income_ids.length > 0) {
            const placeholders = income_ids.map(() => '?').join(',');
            const incomesToImport = await db.query(
                `SELECT * FROM incomes WHERE user_id = ? AND month_year = ? AND id IN (${placeholders})`,
                [req.userId, previous_month, ...income_ids]
            );

            for (const inc of incomesToImport) {
                await db.query(
                    `INSERT INTO incomes (user_id, month_year, description, amount) 
                     VALUES (?, ?, ?, ?)`,
                    [req.userId, target_month, inc.description, inc.amount]
                );
                incomesCount++;
            }
        }
        
        res.json({ success: true, generated: expensesCount, generated_incomes: incomesCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
