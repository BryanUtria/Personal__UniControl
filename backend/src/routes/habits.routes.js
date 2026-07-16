const express = require('express');
const router = express.Router();
const db = require('../../db');

// --- HÁBITOS ---

// Middleware para verificar usuario
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    req.userId = userId;
    next();
};

// Obtener hábitos activos y sus registros
router.get('/', requireAuth, async (req, res) => {
    try {
        const habitsSql = `
            SELECT id, name, description, color, type, frequency, repeat_details, start_date, start_time, end_time, reminder_time, created_at
            FROM habits
            WHERE user_id = ? AND active = 1
            ORDER BY created_at ASC
        `;
        const habitsRows = await db.query(habitsSql, [req.userId]);

        if (habitsRows.length === 0) {
            return res.json([]);
        }

        const habitIds = habitsRows.map(h => h.id);
        const placeholders = habitIds.map(() => '?').join(',');

        const logsSql = `
            SELECT habit_id, log_date, completed
            FROM habit_logs
            WHERE habit_id IN (${placeholders})
        `;
        const logsRows = await db.query(logsSql, habitIds);

        // Agrupar logs por habit_id
        const formatted = habitsRows.map(habit => {
            const logs = logsRows
                .filter(l => l.habit_id === habit.id)
                .reduce((acc, log) => {
                    // Formatear fecha a 'YYYY-MM-DD' en la zona local si es posible
                    const dateStr = typeof log.log_date === 'string' 
                        ? log.log_date 
                        : log.log_date.toISOString().split('T')[0];
                    acc[dateStr] = log.completed === 1;
                    return acc;
                }, {});

            return {
                id: habit.id.toString(),
                name: habit.name,
                description: habit.description,
                color: habit.color,
                type: habit.type,
                frequency: habit.frequency,
                repeat_details: habit.repeat_details ? JSON.parse(habit.repeat_details) : null,
                start_date: habit.start_date,
                start_time: habit.start_time,
                end_time: habit.end_time,
                reminder_time: habit.reminder_time,
                logs
            };
        });

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear un hábito
router.post('/', requireAuth, async (req, res) => {
    const { name, description, color, type, frequency, repeat_details, start_date, start_time, end_time, reminder_time } = req.body;
    if (!name || !frequency) {
        return res.status(400).json({ error: 'Nombre y frecuencia son obligatorios.' });
    }

    try {
        const detailsStr = repeat_details ? JSON.stringify(repeat_details) : null;
        const result = await db.query(
            'INSERT INTO habits (user_id, name, description, color, type, frequency, repeat_details, start_date, start_time, end_time, reminder_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.userId, name, description || null, color || '#4caf50', type || 'habit', frequency, detailsStr, start_date || null, start_time || null, end_time || null, reminder_time || null]
        );

        res.json({
            id: result.insertId.toString(),
            name,
            description,
            color: color || '#4caf50',
            type: type || 'habit',
            frequency,
            repeat_details,
            start_date,
            start_time,
            end_time,
            reminder_time,
            logs: {}
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar un hábito
router.put('/:id', requireAuth, async (req, res) => {
    const { name, description, color, type, frequency, repeat_details, start_date, start_time, end_time, reminder_time } = req.body;
    const { id } = req.params;

    try {
        const detailsStr = repeat_details ? JSON.stringify(repeat_details) : null;
        await db.query(
            'UPDATE habits SET name = ?, description = ?, color = ?, type = ?, frequency = ?, repeat_details = ?, start_date = ?, start_time = ?, end_time = ?, reminder_time = ? WHERE id = ? AND user_id = ?',
            [name, description || null, color, type || 'habit', frequency, detailsStr, start_date || null, start_time || null, end_time || null, reminder_time || null, id, req.userId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un hábito (soft delete)
router.delete('/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('UPDATE habits SET active = 0 WHERE id = ? AND user_id = ?', [id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Alternar estado de log para una fecha
router.post('/:id/toggle', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { date, completed } = req.body; // date en formato 'YYYY-MM-DD'

    if (!date) return res.status(400).json({ error: 'Fecha es obligatoria.' });

    try {
        // Verificar que el hábito existe y pertenece al usuario
        const habitCheck = await db.query('SELECT id FROM habits WHERE id = ? AND user_id = ?', [id, req.userId]);
        if (habitCheck.length === 0) {
            return res.status(404).json({ error: 'Hábito no encontrado.' });
        }

        const compVal = completed ? 1 : 0;
        
        await db.query(`
            INSERT INTO habit_logs (habit_id, log_date, completed) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE completed = VALUES(completed)
        `, [id, date, compVal]);

        res.json({ success: true, habit_id: id, date, completed: compVal === 1 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
