const express = require('express');
const router = express.Router();
const db = require('../../db');
const { MercadoPagoConfig, Preference, PreApproval } = require('mercadopago');
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
    const { module_key, frequency = 'monthly' } = req.body;
    if (!userId || !module_key) return res.status(400).json({ error: 'Faltan datos.' });

    try {
        // Verificar si el usuario ya tiene la fila, si no, crearla
        await db.query('INSERT IGNORE INTO user_subscriptions (user_id, module_key, status) VALUES (?, ?, ?)', [userId, module_key, 'pending']);
        
        const modInfo = await db.query('SELECT name, base_price_cop, annual_price_cop FROM app_modules WHERE module_key = ?', [module_key]);
        const subInfo = await db.query('SELECT custom_price_cop FROM user_subscriptions WHERE user_id = ? AND module_key = ?', [userId, module_key]);
        const user = await db.query('SELECT email FROM users WHERE id = ?', [userId]);

        if (modInfo.length === 0) return res.status(404).json({ error: 'Módulo no encontrado.' });
        
        let price = parseFloat(frequency === 'annual' ? modInfo[0].annual_price_cop : modInfo[0].base_price_cop);
        // Descuentos custom solo aplican al plan base por ahora para evitar lio
        if (frequency === 'monthly' && subInfo.length > 0 && subInfo[0].custom_price_cop !== null) {
            price = parseFloat(subInfo[0].custom_price_cop);
        }

        const preApproval = new PreApproval(mpClient);
        const response = await preApproval.create({
            body: {
                back_url: 'https://unicontrol.app/success',
                reason: `Suscripción ${frequency === 'annual' ? 'Anual' : 'Mensual'} - ${modInfo[0].name}`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: frequency === 'annual' ? 'years' : 'months',
                    transaction_amount: price,
                    currency_id: 'COP'
                },
                payer_email: user[0]?.email || 'test@test.com',
                external_reference: `${userId}_${module_key}_${frequency}`,
                status: 'pending'
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
    
    // Webhook para Preapproval (Suscripciones)
    if (type === 'subscription_preapproval' && data && data.id) {
        try {
            const fetch = require('node-fetch');
            const subRes = await fetch(`https://api.mercadopago.com/preapproval/${data.id}`, {
                headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN || 'TEST-12345'}` }
            });
            const subscription = await subRes.json();
            
            if (subscription.status === 'authorized' && subscription.external_reference) {
                const [userId, module_key, frequency] = subscription.external_reference.split('_');
                // Agregar 30 días o 1 año a expires_at
                const interval = frequency === 'annual' ? '1 YEAR' : '30 DAY';
                await db.query(`
                    UPDATE user_subscriptions 
                    SET status = 'active', 
                        expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ${interval})
                    WHERE user_id = ? AND module_key = ?
                `, [userId, module_key]);
                console.log(`Suscripción aprobada para usuario ${userId} módulo ${module_key} (${frequency})`);
            }
        } catch (err) {
            console.error('Webhook error', err);
        }
    }
    res.status(200).send('OK');
});



module.exports = router;
