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
        const tokensSql = `SELECT token FROM push_tokens WHERE user_id = ?`;
        const tokensRows = await db.query(tokensSql, [userId]);
        const tokens = tokensRows.map(row => row.token);
        
        if (tokens.length > 0) {
            await sendPushNotifications(tokens, { title, body, data });
        }
    } catch (e) {
        console.error('Error in notifyUser:', e);
    }
}

module.exports = {
    sendPushNotifications,
    notifyUser
};
