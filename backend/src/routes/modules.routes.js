const express = require('express');
const router = express.Router();
const db = require('../../db');
const crypto = require('crypto');
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
        const subs = await db.query('SELECT module_key, status, custom_price_cop, trial_ends_at, expires_at, mp_subscription_id, mp_reference FROM user_subscriptions WHERE user_id = ?', [userId]);
        
        const merged = modules.map(m => {
            const sub = subs.find(s => s.module_key === m.module_key);
            // Si es admin, el estado de la suscripción es siempre 'active'
            const currentStatus = isAdmin ? 'active' : (sub ? sub.status : 'none');
            
            return {
                ...m,
                custom_price_cop: sub ? sub.custom_price_cop : null,
                trial_ends_at: sub ? sub.trial_ends_at : null,
                status: currentStatus,
                expires_at: sub ? sub.expires_at : null,
                mp_subscription_id: sub ? sub.mp_subscription_id : null,
                mp_reference: sub ? sub.mp_reference : null,
                trial_available: sub ? (sub.trial_ends_at === null) : true
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
        const userEmailRows = await db.query('SELECT email FROM users WHERE id = ?', [userId]);

        if (modInfo.length === 0) return res.status(404).json({ error: 'Módulo no encontrado.' });
        
        let price = parseFloat(frequency === 'annual' ? modInfo[0].annual_price_cop : modInfo[0].base_price_cop);
        // Descuentos custom solo aplican al plan base por ahora para evitar lio
        if (frequency === 'monthly' && subInfo.length > 0 && subInfo[0].custom_price_cop !== null) {
            price = parseFloat(subInfo[0].custom_price_cop);
        }

        // Construir auto_recurring según la frecuencia
        let auto_recurring;
        if (frequency === 'annual') {
            // Mercado Pago NO acepta 'years' como frequency_type.
            // Para anual: cobrar cada 12 meses
            auto_recurring = {
                frequency: 12,
                frequency_type: 'months',
                transaction_amount: price,
                currency_id: 'COP'
            };
        } else {
            auto_recurring = {
                frequency: 1,
                frequency_type: 'months',
                transaction_amount: price,
                currency_id: 'COP'
            };
        }

        // Obtener el email del usuario para payer_email
        const userEmail = userEmailRows[0]?.email;
        if (!userEmail) {
            return res.status(400).json({ error: 'El usuario debe tener un email registrado para realizar el pago.' });
        }

        // --- Llamada DIRECTA a la API de Mercado Pago usando https nativo ---
        const https = require('https');
        const payerEmail = userEmail;

        const mpPayloadObj = {
            reason: `UniControl - Suscripción ${frequency === 'annual' ? 'Anual' : 'Mensual'} - ${modInfo[0].name}`,
            auto_recurring,
            external_reference: `${userId}_${module_key}_${frequency}`,
            back_url: 'https://unicontrol-backend.onrender.com/success',
            payer_email: payerEmail
        };

        const mpPayload = JSON.stringify(mpPayloadObj);

        const mpResponse = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.mercadopago.com',
                path: '/preapproval',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(mpPayload)
                }
            };

            const mpReq = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode, body: { raw: data } });
                    }
                });
            });

            mpReq.on('error', reject);
            mpReq.write(mpPayload);
            mpReq.end();
        });

        if (mpResponse.status !== 201) {
            console.error('[MP API ERROR]', JSON.stringify(mpResponse.body, null, 2));
            return res.status(400).json({ 
                error: 'Error de Mercado Pago',
                mp_error: mpResponse.body?.message || mpResponse.body?.error || mpResponse.body?.cause || 'Error desconocido',
                mp_detail: mpResponse.body,
                mp_status: mpResponse.status
            });
        }

        // Guardar el ID de la suscripción de MercadoPago y la referencia
        try {
            await db.query(`
                UPDATE user_subscriptions 
                SET mp_subscription_id = ?, mp_reference = ?
                WHERE user_id = ? AND module_key = ?
            `, [mpResponse.body.id, mpResponse.body.external_reference, userId, module_key]);
            console.log(`MP subscription guardado: ${mpResponse.body.id} (${mpResponse.body.external_reference})`);
        } catch (e) {
            console.error('Error guardando mp_subscription_id:', e.message);
        }

        res.json({ init_point: mpResponse.body.init_point });
    } catch (err) {
        console.error('[CHECKOUT ERROR]', err);
        res.status(500).json({ error: err.message, detail: err.stack });
    }
});

// Endpoint para activar período de prueba (trial) de un módulo
router.post('/subscriptions/trial', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { module_key } = req.body;
    if (!userId || !module_key) return res.status(400).json({ error: 'Faltan datos.' });

    try {
        // Verificar si el usuario ya tiene fila, si no, crearla
        await db.query('INSERT IGNORE INTO user_subscriptions (user_id, module_key, status) VALUES (?, ?, ?)', [userId, module_key, 'pending']);

        const subRows = await db.query(
            'SELECT status, trial_ends_at, expires_at FROM user_subscriptions WHERE user_id = ? AND module_key = ?',
            [userId, module_key]
        );

        const sub = subRows[0];

        // Si ya tiene trial usado (trial_ends_at no es NULL), rechazar
        if (sub && sub.trial_ends_at !== null) {
            return res.status(400).json({ error: 'Ya has utilizado tu prueba gratuita para este módulo.' });
        }

        // Si ya tiene suscripción activa vigente, no necesita trial
        if (sub && sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
            return res.status(400).json({ error: 'Ya tienes una suscripción activa para este módulo.' });
        }

        // Activar trial por 1 mes (30 días)
        await db.query(`
            UPDATE user_subscriptions 
            SET status = 'active', 
                trial_ends_at = DATE_ADD(NOW(), INTERVAL 1 MONTH),
                expires_at = DATE_ADD(NOW(), INTERVAL 1 MONTH)
            WHERE user_id = ? AND module_key = ?
        `, [userId, module_key]);

        console.log(`Trial activado para usuario ${userId} módulo ${module_key} (1 mes)`);
        res.json({
            success: true,
            message: 'Prueba gratuita activada por 1 mes.',
            trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
    } catch (err) {
        console.error('[TRIAL ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

function validateMpSignature(req, dataId) {
    const clientSecret = process.env.MP_WEBHOOK_SECRET || '';
    if (!clientSecret) return true; // Si no hay secreto configurado, saltar validación

    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    if (!signatureHeader || !requestId || !dataId) return false;

    // Parsear el header "ts=...v1=..."
    const parts = {};
    signatureHeader.split(',').forEach(pair => {
        const [key, value] = pair.trim().split('=');
        if (key && value) parts[key.trim()] = value.trim();
    });

    if (!parts.ts || !parts.v1) return false;

    // Generar el string a firmar según documentación de MercadoPago:
    // dataToSign = "id:{data.id};request-id:{x-request-id};ts:{ts};"
    const dataToSign = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
    const hmac = crypto.createHmac('sha256', clientSecret).update(dataToSign).digest('hex');

    // Comparar usando timing-safe comparison
    try {
        return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(parts.v1, 'hex'));
    } catch {
        return false;
    }
}

router.post('/subscriptions/webhook', async (req, res) => {
    const { type, data, action } = req.body;
    
    // Responder rápido para evitar timeouts de MP
    res.status(200).send('OK');

    // --- VERIFICACIÓN DE FIRMA (X-Signature) ---
    // Se pasa data.id (el ID real del recurso) para firmar correctamente
    if (!validateMpSignature(req, data?.id)) {
        console.error('[Webhook] Firma inválida - posible solicitud falsa');
        return;
    }

    // Webhook para Preapproval (Suscripciones)
    if ((type === 'subscription_preapproval' || type === 'subscription_authorized_payment') && data && data.id) {
        try {
            const https = require('https');
            
            // Determinar la URL correcta según el tipo de notificación
            const apiPath = type === 'subscription_preapproval' 
                ? `/preapproval/${data.id}` 
                : `/authorized_payments/${data.id}`;

            const subscription = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.mercadopago.com',
                    path: apiPath,
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
                    }
                };

                const req = https.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                console.error(`Error fetching MP data: ${res.statusCode}`);
                                reject(new Error(`HTTP ${res.statusCode}`));
                            } else {
                                resolve(JSON.parse(body));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                req.on('error', reject);
                req.end();
            });
            console.log('[Webhook MP] Tipo:', type, 'Status:', subscription.status, 'Ref:', subscription.external_reference);

            // Suscripción autorizada / aprobada
            if ((subscription.status === 'authorized' || subscription.status === 'approved') && subscription.external_reference) {
                const parts = subscription.external_reference.split('_');
                if (parts.length >= 2) {
                    const userId = parts[0];
                    const module_key = parts[1];
                    const frequency = parts[2] || 'monthly';
                    
                    // Agregar 30 días o 1 año a expires_at
                    const interval = frequency === 'annual' ? '1 YEAR' : '30 DAY';
                    await db.query(`
                        UPDATE user_subscriptions 
                        SET status = 'active', 
                            expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ${interval}),
                            mp_subscription_id = ?,
                            mp_reference = ?
                        WHERE user_id = ? AND module_key = ?
                    `, [data.id, subscription.external_reference, userId, module_key]);
                    console.log(`Suscripción activada para usuario ${userId} módulo ${module_key} (${frequency})`);
                }
            }

            // Suscripción cancelada
            if (subscription.status === 'cancelled' && subscription.external_reference) {
                const parts = subscription.external_reference.split('_');
                if (parts.length >= 2) {
                    await db.query(`
                        UPDATE user_subscriptions 
                        SET status = 'cancelled' 
                        WHERE user_id = ? AND module_key = ?
                    `, [parts[0], parts[1]]);
                    console.log(`Suscripción cancelada para usuario ${parts[0]} módulo ${parts[1]}`);
                }
            }
        } catch (err) {
            console.error('Webhook error:', err);
        }
    }
});

// Endpoint para consultar el estado de suscripción de un usuario
router.get('/subscriptions/my', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(400).json({ error: 'x-user-id requerido' });
    
    try {
        const subs = await db.query(`
            SELECT us.*, am.name, am.base_price_cop, am.annual_price_cop
            FROM user_subscriptions us
            JOIN app_modules am ON us.module_key = am.module_key
            WHERE us.user_id = ?
        `, [userId]);
        
        // Verificar si alguna suscripción expiró
        for (let sub of subs) {
            if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) < new Date()) {
                await db.query('UPDATE user_subscriptions SET status = ? WHERE id = ?', ['expired', sub.id]);
                sub.status = 'expired';
            }
        }
        
        res.json(subs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



module.exports = router;