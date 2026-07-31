const express = require('express');
const router = express.Router();
const db = require('../../db');
const https = require('https');

// Página HTML de respuesta
function htmlResponse(title, message, success, extraInfo = '') {
    const isProcessing = title.includes('proceso');

    // Iconos de Font Awesome según el estado
    const iconClass = success
        ? 'fa-circle-check'
        : (isProcessing ? 'fa-hourglass-half' : 'fa-triangle-exclamation');
    const iconColor = success ? '#10B981' : (isProcessing ? '#F59E0B' : '#EF4444');
    const iconBg = success ? '#10B98115' : (isProcessing ? '#F59E0B15' : '#EF444415');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; }
        .card { background: white; padding: 40px 30px; border-radius: 20px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 420px; width: 100%; }
        .icon-wrap { width: 110px; height: 110px; border-radius: 50%; display: flex; justify-content: center; align-items: center; margin: 0 auto; }
        .icon-wrap i { font-size: 52px; }
        .title { font-size: 24px; font-weight: 800; color: #1F2937; margin: 20px 0 10px; }
        .message { color: #6B7280; font-size: 14px; line-height: 1.6; margin-bottom: 10px; }
        .extra { background: #F3F4F6; border-radius: 10px; padding: 12px; font-size: 12px; color: #4B5563; margin: 15px 0; word-break: break-all; }
        .btn { display: inline-block; margin-top: 20px; padding: 14px 32px; background: #4F46E5; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px; transition: transform 0.2s, box-shadow 0.2s; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(79, 70, 229, 0.4); }
        .spinner { display: inline-block; width: 40px; height: 40px; border: 4px solid #E5E7EB; border-top-color: #4F46E5; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-wrap" style="background: ${iconBg};">
            <i class="fa-solid ${iconClass}" style="color: ${iconColor};"></i>
        </div>
        <div class="title">${title}</div>
        <div class="message">${message}</div>
        ${extraInfo ? `<div class="extra">${extraInfo}</div>` : ''}
        <a class="btn" href="https://unicontrol.onrender.com/">Volver a UniControl</a>
    </div>
</body>
</html>`;
}

// Ruta de retorno después del pago en MercadoPago
router.get('/success', async (req, res) => {
    const preapprovalId = req.query.preapproval_id;

    if (!preapprovalId) {
        return res.status(400).send(htmlResponse(
            'Sin referencia de pago',
            'No se recibió el ID de la preaprobación de MercadoPago.',
            false
        ));
    }

    try {
        // Consultar el estado real de la preaprobación en MercadoPago
        const subscription = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.mercadopago.com',
                path: `/preapproval/${preapprovalId}`,
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
                            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
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

        console.log('[Success MP] Status:', subscription.status, 'Ref:', subscription.external_reference);

        // Suscripción autorizada/aprobada -> activar en la BD
        if ((subscription.status === 'authorized' || subscription.status === 'approved') && subscription.external_reference) {
            const parts = subscription.external_reference.split('_');
            const userId = parts[0];
            const module_key = parts[1];
            const frequency = parts[2] || 'monthly';

            if (userId && module_key) {
                const interval = frequency === 'annual' ? '1 YEAR' : '30 DAY';

                // Activar solo si no está activa con vigencia futura (evita duplicar días)
                // Si ya está activa y vigente, no extendemos fechas nuevamente
                const existing = await db.query(
                    'SELECT status, expires_at FROM user_subscriptions WHERE user_id = ? AND module_key = ?',
                    [userId, module_key]
                );

                const alreadyActive = existing.length > 0 &&
                    existing[0].status === 'active' &&
                    existing[0].expires_at &&
                    new Date(existing[0].expires_at) > new Date();

                if (alreadyActive) {
                    console.log(`[Success] Suscripción ya activa para usuario ${userId} módulo ${module_key} (sin duplicar días)`);
                } else {
                    await db.query(`
                        UPDATE user_subscriptions 
                        SET status = 'active', 
                            expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ${interval}),
                            mp_subscription_id = ?,
                            mp_reference = ?
                        WHERE user_id = ? AND module_key = ?
                    `, [preapprovalId, subscription.external_reference, userId, module_key]);
                    console.log(`[Success] Suscripción activada para usuario ${userId} módulo ${module_key} (${frequency})`);
                }

                return res.send(htmlResponse(
                    '¡Pago exitoso!',
                    'Tu suscripción ha sido activada correctamente. Ya puedes disfrutar de tu módulo premium en UniControl.',
                    true,
                    `Referencia: ${subscription.external_reference}`
                ));
            }
        }

        // Pagos en proceso
        if (subscription.status === 'pending' || subscription.status === 'in_process' || subscription.status === 'paused') {
            return res.send(htmlResponse(
                'Pago en proceso',
                'Estamos confirmando tu pago con MercadoPago. Tu suscripción se activará automáticamente en unos minutos.',
                false
            ));
        }

        // Suscripción cancelada
        if (subscription.status === 'cancelled') {
            return res.send(htmlResponse(
                'Pago cancelado',
                'La suscripción fue cancelada. Si fue un error, intenta nuevamente el pago.',
                false
            ));
        }

        // Cualquier otro estado
        return res.send(htmlResponse(
            'Estado del pago',
            `El estado actual de tu pago es: ${subscription.status}. Si ya realizaste el pago, tu suscripción se activará en breve.`,
            false,
            preapprovalId
        ));

    } catch (err) {
        console.error('[SUCCESS ERROR]', err.message);
        return res.status(500).send(htmlResponse(
            'Error al verificar el pago',
            'Ocurrió un error al verificar tu pago con MercadoPago. Por favor intenta de nuevo o contacta soporte.',
            false,
            preapprovalId
        ));
    }
});

module.exports = router;