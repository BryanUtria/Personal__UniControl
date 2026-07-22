const express = require('express');
const router = express.Router();
const db = require('../../db');
const bcrypt = require('bcryptjs');
const { createTransporter } = require('../utils/helpers');
// --- AUTENTICACIÓN ---

// Enviar código de verificación por correo
router.post('/send-code', async (req, res) => {
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
        console.log('\n┌────────────────────────────────────────────────────────');
        console.log(`│  [UNICONTROL VERIFICACIÓN DE CORREO]                     `);
        console.log(`│  Destinatario: ${email.padEnd(40)}                       `);
        console.log(`│  Código:       \x1b[32m\x1b[1m${code}\x1b[0m             `);
        console.log(`│  Estado:       ${(emailSent ? 'ENVIADO POR SMTP' : 'SANDBOX / CONSOLA').padEnd(39)} `);
        console.log('└────────────────────────────────────────────────────────\n');

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
router.post('/register', async (req, res) => {
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

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

// Inicio de sesión y Registro con Google
router.post('/google', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Token de Google requerido.' });

    try {
        // Verificar el token con Google
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_WEB_CLIENT_ID, 
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name } = payload;

        // 1. Buscar si el usuario ya existe (por google_id o correo)
        let usersRows = await db.query('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email]);
        let user = usersRows[0];

        if (!user) {
            // El usuario no existe, registrar automáticamente
            const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
            const randomPassword = await bcrypt.hash(Math.random().toString(36).slice(-10), 10); // Contraseña inutilizable

            const insertResult = await db.query(
                'INSERT INTO users (name, username, password, email, google_id) VALUES (?, ?, ?, ?, ?)',
                [name, username, randomPassword, email, googleId]
            );

            user = { id: insertResult.insertId, name, username, email, google_id: googleId };
        } else {
            // Si el usuario existe por correo pero no tiene google_id, lo vinculamos
            if (!user.google_id) {
                await db.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
            }
        }

        // Fetch subscriptions igual que en /login
        const subs = await db.query('SELECT module_key, status, trial_ends_at, expires_at FROM user_subscriptions WHERE user_id = ?', [user.id]);

        res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, subscriptions: subs });
    } catch (err) {
        console.error('Error verificando Google Token:', err);
        res.status(401).json({ error: 'Token de Google inválido o expirado.' });
    }
});

// Iniciar sesión
router.post('/login', async (req, res) => {
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

        // Fetch subscriptions
        const subs = await db.query('SELECT module_key, status, trial_ends_at, expires_at FROM user_subscriptions WHERE user_id = ?', [user.id]);

        res.json({ id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, subscriptions: subs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Recuperación de Contraseña - Enviar Código
router.post('/recover-password/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'El correo es obligatorio.' });

    try {
        const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            // Retornar error genérico por seguridad o específico
            return res.status(404).json({ error: 'No existe una cuenta con este correo.' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
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
                    subject: 'Recuperación de Contraseña - UniControl',
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px;">
                            <h2 style="color: #2563EB; text-align: center;">Recuperación de Contraseña</h2>
                            <p>¡Hola!</p>
                            <p>Has solicitado restablecer tu contraseña en UniControl. Usa el siguiente código para crear una nueva:</p>
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
                console.error('Error enviando correo SMTP de recuperación:', mailErr);
            }
        }

        console.log('\n┌────────────────────────────────────────────────────────');
        console.log(`│  [UNICONTROL RECUPERACIÓN DE CONTRASEÑA]                 `);
        console.log(`│  Destinatario: ${email.padEnd(40)}                       `);
        console.log(`│  Código:       \x1b[32m\x1b[1m${code}\x1b[0m             `);
        console.log(`│  Estado:       ${(emailSent ? 'ENVIADO POR SMTP' : 'SANDBOX / CONSOLA').padEnd(39)} `);
        console.log('└────────────────────────────────────────────────────────\n');

        res.json({ success: true, sandboxMode, sandboxCode: sandboxMode ? code : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Recuperación de Contraseña - Cambiar Contraseña
router.post('/recover-password/reset', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Faltan datos obligatorios.' });
    }

    try {
        const codes = await db.query(
            'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
            [email, code]
        );

        if (codes.length === 0) {
            return res.status(400).json({ error: 'El código es incorrecto o ha expirado.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        await db.query('DELETE FROM verification_codes WHERE email = ?', [email]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
