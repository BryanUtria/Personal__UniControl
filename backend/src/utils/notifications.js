const { Expo } = require('expo-server-sdk');
const db = require('../../db');

let expo = new Expo();

// Send notifications to a list of tokens
async function sendPushNotifications(tokens, message) {
    let messages = [];
    for (let pushToken of tokens) {
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
        }

        messages.push({
            to: pushToken,
            sound: 'default',
            title: message.title,
            body: message.body,
            data: message.data || {},
        });
    }

    let chunks = expo.chunkPushNotifications(messages);
    let tickets = [];
    for (let chunk of chunks) {
        try {
            let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error('Error sending push notification chunk:', error);
        }
    }
    return tickets;
}

// Helper to notify a specific user
async function notifyUser(userId, title, body, data = {}) {
    try {
        console.log(`[NOTIFY] Intentando notificar a usuario ${userId} con título: "${title}"`);
        const tokensSql = `SELECT token FROM push_tokens WHERE user_id = ?`;
        const tokensRows = await db.query(tokensSql, [userId]);
        const tokens = tokensRows.map(row => row.token);

        if (tokens.length > 0) {
            console.log(`[NOTIFY] Se encontraron ${tokens.length} tokens para usuario ${userId}. Enviando...`);
            let tickets = await sendPushNotifications(tokens, { title, body, data });
            console.log(`[NOTIFY] Resultado de envío para usuario ${userId}:`, JSON.stringify(tickets));
        } else {
            console.log(`[NOTIFY] Usuario ${userId} no tiene tokens de push registrados en la DB.`);
        }
    } catch (e) {
        console.error('[NOTIFY] Error in notifyUser:', e);
    }
}

module.exports = {
    sendPushNotifications,
    notifyUser
};
