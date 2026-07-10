const express = require('express');
const router = express.Router();
const db = require('../../db');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || 'TEST-12345' });
// --- ENDPOINTS DE SUSCRIPCIONES Y MÓDULOS ---
router.get('/modules', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        // Obtener todos los módulos
        const modules = await db.query('SELECT * FROM app_modules');
        
        if (!userId) return res.json(modules);

        const userRows = await db.query('SELECT role FROM users WHERE id = ?', [userId]);
        const isAdmin = userRows.length > 0 && userRows[0].role === 'admin';

        // Combinar con descuentos y trials del usuario
        const subs = await db.query('SELECT module_key, status, custom_price_cop, trial_ends_at, expires_at FROM user_subscriptions WHERE user_id = ?', [userId]);
        
        const merged = modules.map(m => {
            const sub = subs.find(s => s.module_key === m.module_key);
            // Si es admin, el estado de la suscripción es siempre 'active'
            const currentStatus = isAdmin ? 'active' : (sub ? sub.status : 'none');
            
            return {
                ...m,
                custom_price_cop: sub ? sub.custom_price_cop : null,
                trial_ends_at: sub ? sub.trial_ends_at : null,
                status: currentStatus,
                expires_at: sub ? sub.expires_at : null
            };
        });
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/subscriptions/checkout', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { module_key } = req.body;
    if (!userId || !module_key) return res.status(400).json({ error: 'Faltan datos.' });

    try {
        // Verificar si el usuario ya tiene la fila, si no, crearla
        await db.query('INSERT IGNORE INTO user_subscriptions (user_id, module_key, status) VALUES (?, ?, ?)', [userId, module_key, 'pending']);
        
        const modInfo = await db.query('SELECT name, base_price_cop FROM app_modules WHERE module_key = ?', [module_key]);
        const subInfo = await db.query('SELECT custom_price_cop FROM user_subscriptions WHERE user_id = ? AND module_key = ?', [userId, module_key]);
        const user = await db.query('SELECT email FROM users WHERE id = ?', [userId]);

        if (modInfo.length === 0) return res.status(404).json({ error: 'Módulo no encontrado.' });
        
        let price = parseFloat(modInfo[0].base_price_cop);
        if (subInfo.length > 0 && subInfo[0].custom_price_cop !== null) {
            price = parseFloat(subInfo[0].custom_price_cop);
        }

        const preference = new Preference(mpClient);
        const response = await preference.create({
            body: {
                items: [
                    {
                        id: module_key,
                        title: `Suscripción 1 Mes - ${modInfo[0].name}`,
                        quantity: 1,
                        unit_price: price,
                        currency_id: 'COP'
                    }
                ],
                payer: {
                    email: user[0]?.email || 'test@test.com'
                },
                external_reference: `${userId}_${module_key}`, // Para saber quién pagó en el webhook
                back_urls: {
                    success: 'https://unicontrol.app/success', // placeholder
                    failure: 'https://unicontrol.app/failure',
                    pending: 'https://unicontrol.app/pending'
                },
                auto_return: 'approved'
            }
        });
        
        res.json({ init_point: response.init_point });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/subscriptions/webhook', async (req, res) => {
    const { type, data } = req.body;
    
    // Simplificación de webhook para Preference payments de MP
    if (type === 'payment' && data && data.id) {
        try {
            // Aquí tendrías que consultar el payment API de MP usando el ID para obtener la info
            // Por simplicidad, simularemos que external_reference viene en el pago y activamos
            // En un caso real harías fetch al Payment API usando mpClient
            
            const fetch = require('node-fetch');
            const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
                headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN || 'TEST-12345'}` }
            });
            const payment = await paymentRes.json();
            
            if (payment.status === 'approved' && payment.external_reference) {
                const [userId, module_key] = payment.external_reference.split('_');
                // Agregar 30 días a expires_at
                await db.query(`
                    UPDATE user_subscriptions 
                    SET status = 'active', 
                        expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL 30 DAY)
                    WHERE user_id = ? AND module_key = ?
                `, [userId, module_key]);
                console.log(`Pago aprobado para usuario ${userId} módulo ${module_key}`);
            }
        } catch (err) {
            console.error('Webhook error', err);
        }
    }
    res.status(200).send('OK');
});



module.exports = router;
