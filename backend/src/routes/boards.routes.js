const express = require('express');
const router = express.Router();
const db = require('../../db');

// Middleware para verificar usuario
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'No autorizado' });
    req.userId = Number(userId);
    next();
};

// Verifica que el usuario tenga acceso al tablero (owner o miembro)
async function canAccessBoard(userId, boardId) {
    const rows = await db.query(
        'SELECT id FROM task_boards WHERE id = ? AND owner_user_id = ? ' +
        'UNION SELECT tbm.board_id FROM task_board_members tbm WHERE tbm.board_id = ? AND tbm.user_id = ?',
        [boardId, userId, boardId, userId]
    );
    return rows.length > 0;
}

// --- TABLEROS ---

// Obtener tableros del usuario (propios o compartidos)
router.get('/', requireAuth, async (req, res) => {
    try {
        const boards = await db.query(`
            SELECT tb.*, u.name AS owner_name, u.username AS owner_username
            FROM task_boards tb
            JOIN users u ON tb.owner_user_id = u.id
            LEFT JOIN task_board_members tbm ON tb.id = tbm.board_id
            WHERE tb.owner_user_id = ? OR tbm.user_id = ?
            GROUP BY tb.id
            ORDER BY tb.created_at DESC
        `, [req.userId, req.userId]);

        // Contar subtableros y cargar miembros por tablero
        const memberRows = await db.query(`
            SELECT tbm.board_id, u.id AS user_id, u.name, u.username, tbm.role
            FROM task_board_members tbm
            JOIN users u ON tbm.user_id = u.id
            WHERE tbm.board_id IN (${boards.map(() => '?').join(',') || 'NULL'})
        `, boards.map(b => b.id));

        const subboardCounts = await db.query(`
            SELECT board_id, COUNT(*) AS total
            FROM task_subboards
            WHERE board_id IN (${boards.map(() => '?').join(',') || 'NULL'})
            GROUP BY board_id
        `, boards.map(b => b.id));

        const formatted = boards.map(b => ({
            id: b.id.toString(),
            name: b.name,
            description: b.description,
            color: b.color,
            owner_user_id: b.owner_user_id.toString(),
            owner_name: b.owner_name,
            owner_username: b.owner_username,
            is_owner: b.owner_user_id === req.userId,
            subboards_count: subboardCounts.find(s => s.board_id === b.id)?.total || 0,
            members: memberRows
                .filter(m => m.board_id === b.id)
                .map(m => ({
                    id: m.user_id.toString(),
                    name: m.name,
                    username: m.username,
                    role: m.role
                })),
            created_at: b.created_at
        }));

        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buscar usuarios para agregar al tablero (DEBE ir antes de GET /:id)
router.get('/search-users', requireAuth, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    try {
        const search = `%${q.trim()}%`;
        const users = await db.query(`
            SELECT id, name, username, email 
            FROM users 
            WHERE username LIKE ? OR name LIKE ? OR email LIKE ?
            LIMIT 10
        `, [search, search, search]);
        res.json(users.map(u => ({
            id: u.id.toString(),
            name: u.name,
            username: u.username,
            email: u.email
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener detalle completo de un tablero (subtableros, columnas, tarjetas)
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const boardId = Number(req.params.id);
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        const boardRows = await db.query(`
            SELECT tb.*, u.name AS owner_name, u.username AS owner_username
            FROM task_boards tb
            JOIN users u ON tb.owner_user_id = u.id
            WHERE tb.id = ?
        `, [boardId]);
        if (boardRows.length === 0) return res.status(404).json({ error: 'Tablero no encontrado.' });
        const board = boardRows[0];

        // Miembros
        const memberRows = await db.query(`
            SELECT tbm.board_id, u.id AS user_id, u.name, u.username, u.email, tbm.role
            FROM task_board_members tbm
            JOIN users u ON tbm.user_id = u.id
            WHERE tbm.board_id = ?
        `, [boardId]);

        const ownerRows = await db.query(`
            SELECT id AS user_id, name, username, email FROM users WHERE id = ?
        `, [board.owner_user_id]);

        const members = [
            { id: ownerRows[0].user_id.toString(), name: ownerRows[0].name, username: ownerRows[0].username, email: ownerRows[0].email, role: 'owner' },
            ...memberRows.map(m => ({ id: m.user_id.toString(), name: m.name, username: m.username, email: m.email, role: m.role }))
        ];

        // Subtableros
        const subboards = await db.query(`
            SELECT * FROM task_subboards WHERE board_id = ? ORDER BY position ASC, created_at ASC
        `, [boardId]);

        // Columnas (de nivel tablero + de nivel subtablero)
        const columns = await db.query(`
            SELECT * FROM task_columns 
            WHERE board_id = ? OR subboard_id IN (${subboards.map(() => '?').join(',') || 'NULL'})
            ORDER BY position ASC, created_at ASC
        `, [boardId, ...subboards.map(s => s.id)]);

        // Tarjetas
        const cards = columns.length > 0 ? await db.query(`
            SELECT * FROM task_cards 
            WHERE column_id IN (${columns.map(() => '?').join(',')})
            ORDER BY position ASC, created_at ASC
        `, columns.map(c => c.id)) : [];

        // Etiquetas del tablero
        const labels = await db.query(`
            SELECT * FROM task_labels WHERE board_id = ? ORDER BY created_at ASC
        `, [boardId]);

        // Relaciones de tarjetas (etiquetas, checklists, miembros)
        let cardLabels = [];
        let checklists = [];
        let checklistItems = [];
        let cardMembers = [];

        if (cards.length > 0) {
            const cardIds = cards.map(c => c.id);
            const placeholders = cardIds.map(() => '?').join(',');

            cardLabels = await db.query(`
                SELECT * FROM task_card_labels WHERE card_id IN (${placeholders})
            `, cardIds);

            checklists = await db.query(`
                SELECT * FROM task_checklists WHERE card_id IN (${placeholders}) ORDER BY position ASC
            `, cardIds);

            if (checklists.length > 0) {
                const checkIds = checklists.map(c => c.id);
                const checkPlaceholders = checkIds.map(() => '?').join(',');
                checklistItems = await db.query(`
                    SELECT * FROM task_checklist_items 
                    WHERE checklist_id IN (${checkPlaceholders}) 
                    ORDER BY position ASC
                `, checkIds);
            }

            cardMembers = await db.query(`
                SELECT tcm.card_id, u.id AS user_id, u.name, u.username
                FROM task_card_members tcm
                JOIN users u ON tcm.user_id = u.id
                WHERE tcm.card_id IN (${placeholders})
            `, cardIds);
        }

        // Construir respuesta agrupada
        const formatCard = (card) => ({
            id: card.id.toString(),
            column_id: card.column_id.toString(),
            title: card.title,
            description: card.description,
            start_date: card.start_date,
            due_date: card.due_date,
            position: card.position,
            created_by: card.created_by ? card.created_by.toString() : null,
            created_at: card.created_at,
            labels: cardLabels.filter(cl => cl.card_id === card.id).map(cl => {
                const label = labels.find(l => l.id === cl.label_id);
                return label ? {
                    id: label.id.toString(),
                    name: label.name,
                    color: label.color
                } : null;
            }).filter(Boolean),
            checklists: checklists.filter(c => c.card_id === card.id).map(c => ({
                id: c.id.toString(),
                title: c.title,
                position: c.position,
                items: checklistItems.filter(i => i.checklist_id === c.id).map(i => ({
                    id: i.id.toString(),
                    text: i.text,
                    checked: i.checked === 1
                }))
            })),
            members: cardMembers.filter(cm => cm.card_id === card.id).map(cm => ({
                id: cm.user_id.toString(),
                name: cm.name,
                username: cm.username
            }))
        });

        res.json({
            id: board.id.toString(),
            name: board.name,
            description: board.description,
            color: board.color,
            owner_user_id: board.owner_user_id.toString(),
            owner_name: board.owner_name,
            owner_username: board.owner_username,
            is_owner: board.owner_user_id === req.userId,
            members,
            created_at: board.created_at,
            subboards: subboards.map(s => ({
                id: s.id.toString(),
                name: s.name,
                description: s.description,
                color: s.color,
                position: s.position,
                created_at: s.created_at
            })),
            columns: columns.map(c => ({
                id: c.id.toString(),
                board_id: c.board_id ? c.board_id.toString() : null,
                subboard_id: c.subboard_id ? c.subboard_id.toString() : null,
                name: c.name,
                position: c.position,
                cards: cards.filter(card => card.column_id === c.id).map(formatCard)
            })),
            labels: labels.map(l => ({
                id: l.id.toString(),
                name: l.name,
                color: l.color
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear tablero
router.post('/', requireAuth, async (req, res) => {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    try {
        const result = await db.query(
            'INSERT INTO task_boards (name, description, color, owner_user_id) VALUES (?, ?, ?, ?)',
            [name, description || null, color || '#6366F1', req.userId]
        );
        const boardId = result.insertId;

        // Crear columnas por defecto
        const defaultCols = ['Pendiente', 'En Proceso', 'Completado'];
        for (let i = 0; i < defaultCols.length; i++) {
            await db.query(
                'INSERT INTO task_columns (board_id, subboard_id, name, position) VALUES (?, NULL, ?, ?)',
                [boardId, defaultCols[i], i]
            );
        }

        res.status(201).json({ id: boardId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar tablero
router.put('/:id', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    const { name, description, color } = req.body;

    try {
        const board = await db.query('SELECT * FROM task_boards WHERE id = ?', [boardId]);
        if (board.length === 0) return res.status(404).json({ error: 'Tablero no encontrado.' });
        if (board[0].owner_user_id !== req.userId) return res.status(403).json({ error: 'Solo el propietario puede editar el tablero.' });

        await db.query(
            'UPDATE task_boards SET name = ?, description = ?, color = ? WHERE id = ?',
            [name || board[0].name, description !== undefined ? description : board[0].description, color || board[0].color, boardId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar tablero
router.delete('/:id', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    try {
        const board = await db.query('SELECT * FROM task_boards WHERE id = ?', [boardId]);
        if (board.length === 0) return res.status(404).json({ error: 'Tablero no encontrado.' });
        if (board[0].owner_user_id !== req.userId) return res.status(403).json({ error: 'Solo el propietario puede eliminar el tablero.' });

        await db.query('DELETE FROM task_boards WHERE id = ?', [boardId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MIEMBROS DEL TABLERO ---

// Agregar miembro al tablero
router.post('/:id/members', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    const { user_id } = req.body;

    try {
        const board = await db.query('SELECT * FROM task_boards WHERE id = ?', [boardId]);
        if (board.length === 0) return res.status(404).json({ error: 'Tablero no encontrado.' });
        if (board[0].owner_user_id !== req.userId) return res.status(403).json({ error: 'Solo el propietario puede agregar miembros.' });
        if (!user_id) return res.status(400).json({ error: 'user_id es obligatorio.' });
        if (Number(user_id) === req.userId) return res.status(400).json({ error: 'Ya eres el propietario del tablero.' });

        await db.query(
            'INSERT IGNORE INTO task_board_members (board_id, user_id, role) VALUES (?, ?, ?)',
            [boardId, Number(user_id), 'member']
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Quitar miembro del tablero
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    const memberId = Number(req.params.userId);

    try {
        const board = await db.query('SELECT * FROM task_boards WHERE id = ?', [boardId]);
        if (board.length === 0) return res.status(404).json({ error: 'Tablero no encontrado.' });
        if (board[0].owner_user_id !== req.userId) return res.status(403).json({ error: 'Solo el propietario puede quitar miembros.' });

        await db.query('DELETE FROM task_board_members WHERE board_id = ? AND user_id = ?', [boardId, memberId]);
        // También quitar de tarjetas donde esté asignado
        await db.query(
            'DELETE tcm FROM task_card_members tcm JOIN task_cards tc ON tcm.card_id = tc.id JOIN task_columns tcol ON tc.column_id = tcol.id WHERE (tcol.board_id = ? OR tcol.subboard_id IN (SELECT id FROM task_subboards WHERE board_id = ?)) AND tcm.user_id = ?',
            [boardId, boardId, memberId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SUBTABLEROS ---

// Crear subtablero
router.post('/:id/subboards', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    try {
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        const countRows = await db.query('SELECT COUNT(*) AS total FROM task_subboards WHERE board_id = ?', [boardId]);
        const position = countRows[0].total;

        const result = await db.query(
            'INSERT INTO task_subboards (board_id, name, description, color, position) VALUES (?, ?, ?, ?, ?)',
            [boardId, name, description || null, color || '#3B82F6', position]
        );

        // Crear columnas por defecto
        const defaultCols = ['Pendiente', 'En Proceso', 'Completado'];
        for (let i = 0; i < defaultCols.length; i++) {
            await db.query(
                'INSERT INTO task_columns (board_id, subboard_id, name, position) VALUES (NULL, ?, ?, ?)',
                [result.insertId, defaultCols[i], i]
            );
        }

        res.status(201).json({ id: result.insertId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar subtablero
router.put('/subboards/:subId', requireAuth, async (req, res) => {
    const subId = Number(req.params.subId);
    const { name, description, color } = req.body;
    try {
        const sub = await db.query('SELECT * FROM task_subboards WHERE id = ?', [subId]);
        if (sub.length === 0) return res.status(404).json({ error: 'Subtablero no encontrado.' });
        if (!(await canAccessBoard(req.userId, sub[0].board_id))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query(
            'UPDATE task_subboards SET name = ?, description = ?, color = ? WHERE id = ?',
            [name || sub[0].name, description !== undefined ? description : sub[0].description, color || sub[0].color, subId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar subtablero
router.delete('/subboards/:subId', requireAuth, async (req, res) => {
    const subId = Number(req.params.subId);
    try {
        const sub = await db.query('SELECT * FROM task_subboards WHERE id = ?', [subId]);
        if (sub.length === 0) return res.status(404).json({ error: 'Subtablero no encontrado.' });
        if (!(await canAccessBoard(req.userId, sub[0].board_id))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query('DELETE FROM task_subboards WHERE id = ?', [subId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- COLUMNAS ---

// Crear columna (board_id o subboard_id)
router.post('/:id/columns', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    const { name, subboard_id } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    try {
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        let targetBoardId = boardId;
        let targetSubId = null;

        if (subboard_id) {
            const sub = await db.query('SELECT * FROM task_subboards WHERE id = ? AND board_id = ?', [Number(subboard_id), boardId]);
            if (sub.length === 0) return res.status(404).json({ error: 'Subtablero no encontrado.' });
            targetSubId = Number(subboard_id);
            targetBoardId = null;
        }

        // Contar columnas existentes en el nivel objetivo (tablero o subtablero)
        const countSql = subboard_id
            ? 'SELECT COUNT(*) AS total FROM task_columns WHERE board_id IS NULL AND subboard_id = ?'
            : 'SELECT COUNT(*) AS total FROM task_columns WHERE board_id = ? AND subboard_id IS NULL';
        const countParams = subboard_id ? [targetSubId] : [boardId];
        const countRows = await db.query(countSql, countParams);
        const position = countRows[0]?.total || 0;

        const result = await db.query(
            'INSERT INTO task_columns (board_id, subboard_id, name, position) VALUES (?, ?, ?, ?)',
            [targetBoardId, targetSubId, name, position]
        );
        res.status(201).json({ id: result.insertId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar columna
router.put('/columns/:colId', requireAuth, async (req, res) => {
    const colId = Number(req.params.colId);
    const { name } = req.body;
    try {
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [colId]);
        if (col.length === 0) return res.status(404).json({ error: 'Columna no encontrada.' });

        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query('UPDATE task_columns SET name = ? WHERE id = ?', [name || col[0].name, colId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar columna
router.delete('/columns/:colId', requireAuth, async (req, res) => {
    const colId = Number(req.params.colId);
    try {
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [colId]);
        if (col.length === 0) return res.status(404).json({ error: 'Columna no encontrada.' });

        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query('DELETE FROM task_columns WHERE id = ?', [colId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TARJETAS ---

// Crear tarjeta
router.post('/columns/:colId/cards', requireAuth, async (req, res) => {
    const colId = Number(req.params.colId);
    const { title, description, start_date, due_date, label_ids, member_ids } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es obligatorio.' });

    try {
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [colId]);
        if (col.length === 0) return res.status(404).json({ error: 'Columna no encontrada.' });

        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        const countRows = await db.query('SELECT COUNT(*) AS total FROM task_cards WHERE column_id = ?', [colId]);
        const position = countRows[0].total;

        const result = await db.query(
            'INSERT INTO task_cards (column_id, title, description, start_date, due_date, position, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [colId, title, description || null, start_date || null, due_date || null, position, req.userId]
        );
        const cardId = result.insertId;

        // Asignar etiquetas
        if (Array.isArray(label_ids)) {
            for (const labelId of label_ids) {
                await db.query('INSERT IGNORE INTO task_card_labels (card_id, label_id) VALUES (?, ?)', [cardId, Number(labelId)]);
            }
        }

        // Asignar miembros
        if (Array.isArray(member_ids)) {
            for (const memberId of member_ids) {
                await db.query('INSERT IGNORE INTO task_card_members (card_id, user_id) VALUES (?, ?)', [cardId, Number(memberId)]);
            }
        }

        res.status(201).json({ id: cardId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener tarjeta (detalle)
router.get('/cards/:cardId', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    try {
        const cardRows = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (cardRows.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
        const card = cardRows[0];

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card.column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        // Etiquetas
        const labels = await db.query('SELECT * FROM task_labels WHERE board_id = ?', [boardId]);
        const cardLabels = await db.query('SELECT * FROM task_card_labels WHERE card_id = ?', [cardId]);

        // Checklists
        const checklists = await db.query('SELECT * FROM task_checklists WHERE card_id = ? ORDER BY position ASC', [cardId]);
        let checklistItems = [];
        if (checklists.length > 0) {
            const checkIds = checklists.map(c => c.id);
            const ph = checkIds.map(() => '?').join(',');
            checklistItems = await db.query(`SELECT * FROM task_checklist_items WHERE checklist_id IN (${ph}) ORDER BY position ASC`, checkIds);
        }

        // Miembros
        const cardMembers = await db.query(`
            SELECT u.id AS user_id, u.name, u.username
            FROM task_card_members tcm
            JOIN users u ON tcm.user_id = u.id
            WHERE tcm.card_id = ?
        `, [cardId]);

        res.json({
            id: card.id.toString(),
            column_id: card.column_id.toString(),
            title: card.title,
            description: card.description,
            start_date: card.start_date,
            due_date: card.due_date,
            position: card.position,
            created_by: card.created_by ? card.created_by.toString() : null,
            created_at: card.created_at,
            labels: cardLabels.map(cl => {
                const label = labels.find(l => l.id === cl.label_id);
                return label ? { id: label.id.toString(), name: label.name, color: label.color } : null;
            }).filter(Boolean),
            checklists: checklists.map(c => ({
                id: c.id.toString(),
                title: c.title,
                position: c.position,
                items: checklistItems.filter(i => i.checklist_id === c.id).map(i => ({
                    id: i.id.toString(),
                    text: i.text,
                    checked: i.checked === 1
                }))
            })),
            members: cardMembers.map(m => ({
                id: m.user_id.toString(),
                name: m.name,
                username: m.username
            })),
            board_id: boardId.toString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar tarjeta
router.put('/cards/:cardId', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    const { title, description, start_date, due_date, column_id } = req.body;
    try {
        const cardRows = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (cardRows.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
        const card = cardRows[0];

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card.column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        // Si se está moviendo de columna, reordenar posiciones
        let newColumnId = card.column_id;
        if (column_id && Number(column_id) !== card.column_id) {
            newColumnId = Number(column_id);
            const countRows = await db.query('SELECT COUNT(*) AS total FROM task_cards WHERE column_id = ?', [newColumnId]);
            await db.query('UPDATE task_cards SET column_id = ?, position = ? WHERE id = ?', [newColumnId, countRows[0].total, cardId]);
        }

        await db.query(
            'UPDATE task_cards SET title = ?, description = ?, start_date = ?, due_date = ? WHERE id = ?',
            [
                title || card.title,
                description !== undefined ? description : card.description,
                start_date !== undefined ? start_date : card.start_date,
                due_date !== undefined ? due_date : card.due_date,
                cardId
            ]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar tarjeta
router.delete('/cards/:cardId', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    try {
        const cardRows = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (cardRows.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [cardRows[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query('DELETE FROM task_cards WHERE id = ?', [cardId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ETIQUETAS ---

// Crear etiqueta
router.post('/:id/labels', requireAuth, async (req, res) => {
    const boardId = Number(req.params.id);
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    try {
        if (!(await canAccessBoard(req.userId, boardId))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }
        const result = await db.query(
            'INSERT INTO task_labels (board_id, name, color) VALUES (?, ?, ?)',
            [boardId, name, color || '#EF4444']
        );
        res.status(201).json({ id: result.insertId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar etiqueta
router.put('/labels/:labelId', requireAuth, async (req, res) => {
    const labelId = Number(req.params.labelId);
    const { name, color } = req.body;
    try {
        const label = await db.query('SELECT * FROM task_labels WHERE id = ?', [labelId]);
        if (label.length === 0) return res.status(404).json({ error: 'Etiqueta no encontrada.' });
        if (!(await canAccessBoard(req.userId, label[0].board_id))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query('UPDATE task_labels SET name = ?, color = ? WHERE id = ?', [name || label[0].name, color || label[0].color, labelId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar etiqueta
router.delete('/labels/:labelId', requireAuth, async (req, res) => {
    const labelId = Number(req.params.labelId);
    try {
        const label = await db.query('SELECT * FROM task_labels WHERE id = ?', [labelId]);
        if (label.length === 0) return res.status(404).json({ error: 'Etiqueta no encontrada.' });
        if (!(await canAccessBoard(req.userId, label[0].board_id))) {
            return res.status(403).json({ error: 'No tienes acceso a este tablero.' });
        }

        await db.query('DELETE FROM task_labels WHERE id = ?', [labelId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ETIQUETAS DE TARJETA ---

router.post('/cards/:cardId/labels', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    const { label_id } = req.body;
    try {
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (card.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        await db.query('INSERT IGNORE INTO task_card_labels (card_id, label_id) VALUES (?, ?)', [cardId, Number(label_id)]);
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/cards/:cardId/labels/:labelId', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    const labelId = Number(req.params.labelId);
    try {
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (card.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        await db.query('DELETE FROM task_card_labels WHERE card_id = ? AND label_id = ?', [cardId, labelId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CHECKLISTS ---

// Crear checklist
router.post('/cards/:cardId/checklists', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es obligatorio.' });

    try {
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (card.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        const countRows = await db.query('SELECT COUNT(*) AS total FROM task_checklists WHERE card_id = ?', [cardId]);
        const result = await db.query(
            'INSERT INTO task_checklists (card_id, title, position) VALUES (?, ?, ?)',
            [cardId, title, countRows[0].total]
        );
        res.status(201).json({ id: result.insertId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Agregar ítem a checklist
router.post('/checklists/:checkId/items', requireAuth, async (req, res) => {
    const checkId = Number(req.params.checkId);
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'El texto es obligatorio.' });

    try {
        const check = await db.query('SELECT * FROM task_checklists WHERE id = ?', [checkId]);
        if (check.length === 0) return res.status(404).json({ error: 'Checklist no encontrado.' });

        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [check[0].card_id]);
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        const countRows = await db.query('SELECT COUNT(*) AS total FROM task_checklist_items WHERE checklist_id = ?', [checkId]);
        const result = await db.query(
            'INSERT INTO task_checklist_items (checklist_id, text, checked, position) VALUES (?, ?, 0, ?)',
            [checkId, text, countRows[0].total]
        );
        res.status(201).json({ id: result.insertId.toString(), success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar ítem de checklist
router.put('/checklist-items/:itemId', requireAuth, async (req, res) => {
    const itemId = Number(req.params.itemId);
    const { text, checked } = req.body;
    try {
        const item = await db.query('SELECT * FROM task_checklist_items WHERE id = ?', [itemId]);
        if (item.length === 0) return res.status(404).json({ error: 'Ítem no encontrado.' });

        const check = await db.query('SELECT * FROM task_checklists WHERE id = ?', [item[0].checklist_id]);
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [check[0].card_id]);
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        await db.query(
            'UPDATE task_checklist_items SET text = ?, checked = ? WHERE id = ?',
            [text !== undefined ? text : item[0].text, checked !== undefined ? (checked ? 1 : 0) : item[0].checked, itemId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar ítem de checklist
router.delete('/checklist-items/:itemId', requireAuth, async (req, res) => {
    const itemId = Number(req.params.itemId);
    try {
        const item = await db.query('SELECT * FROM task_checklist_items WHERE id = ?', [itemId]);
        if (item.length === 0) return res.status(404).json({ error: 'Ítem no encontrado.' });

        const check = await db.query('SELECT * FROM task_checklists WHERE id = ?', [item[0].checklist_id]);
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [check[0].card_id]);
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        await db.query('DELETE FROM task_checklist_items WHERE id = ?', [itemId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar checklist
router.delete('/checklists/:checkId', requireAuth, async (req, res) => {
    const checkId = Number(req.params.checkId);
    try {
        const check = await db.query('SELECT * FROM task_checklists WHERE id = ?', [checkId]);
        if (check.length === 0) return res.status(404).json({ error: 'Checklist no encontrado.' });

        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [check[0].card_id]);
        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        await db.query('DELETE FROM task_checklists WHERE id = ?', [checkId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MIEMBROS DE TARJETA ---

router.post('/cards/:cardId/members', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    const { user_id } = req.body;
    try {
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (card.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        // Verificar que el usuario sea miembro del tablero
        if (!(await canAccessBoard(Number(user_id), boardId))) {
            return res.status(400).json({ error: 'El usuario no es miembro de este tablero.' });
        }

        await db.query('INSERT IGNORE INTO task_card_members (card_id, user_id) VALUES (?, ?)', [cardId, Number(user_id)]);
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/cards/:cardId/members/:userId', requireAuth, async (req, res) => {
    const cardId = Number(req.params.cardId);
    const userId = Number(req.params.userId);
    try {
        const card = await db.query('SELECT * FROM task_cards WHERE id = ?', [cardId]);
        if (card.length === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

        const col = await db.query('SELECT * FROM task_columns WHERE id = ?', [card[0].column_id]);
        const boardId = col[0].board_id || (await db.query('SELECT board_id FROM task_subboards WHERE id = ?', [col[0].subboard_id]))[0]?.board_id;
        if (!(await canAccessBoard(req.userId, boardId))) return res.status(403).json({ error: 'Sin acceso.' });

        await db.query('DELETE FROM task_card_members WHERE card_id = ? AND user_id = ?', [cardId, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;