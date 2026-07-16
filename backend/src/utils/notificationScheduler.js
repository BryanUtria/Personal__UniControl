const cron = require('node-cron');
const db = require('../../db');
const { notifyUser } = require('./notifications');

// Ejecuta cada minuto
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const todayStr = now.toISOString().split('T')[0];
        const dayOfWeek = now.getDay().toString(); // 0(Dom) a 6(Sab)

        // Obtener todos los hábitos que tienen reminder_time
        const habitsSql = `
            SELECT id, user_id, name, type, frequency, repeat_details, start_date, start_time, reminder_time
            FROM habits
            WHERE active = 1 AND reminder_time IS NOT NULL AND start_time IS NOT NULL
        `;
        const habitsRows = await db.query(habitsSql);

        for (let habit of habitsRows) {
            // Verificar si aplica para el día de hoy
            let appliesToday = false;
            
            if (habit.frequency === 'daily') {
                appliesToday = true;
            } else if (habit.frequency === 'specific_days') {
                if (habit.repeat_details) {
                    try {
                        const details = JSON.parse(habit.repeat_details);
                        if (details.days && details.days.includes(dayOfWeek)) {
                            appliesToday = true;
                        }
                    } catch(e) {}
                }
            } else if (habit.frequency === 'once' || habit.frequency === 'monthly') {
                if (habit.start_date) {
                    const habitDate = typeof habit.start_date === 'string' ? habit.start_date : habit.start_date.toISOString().split('T')[0];
                    if (habitDate === todayStr) {
                        appliesToday = true;
                    }
                }
            }

            if (!appliesToday) continue;

            // Calcular hora de recordatorio
            // habit.start_time es formato 'HH:MM:SS'
            const timeParts = habit.start_time.split(':');
            if (timeParts.length >= 2) {
                let hHour = parseInt(timeParts[0], 10);
                let hMin = parseInt(timeParts[1], 10);
                
                // Restar los minutos de reminder_time
                let totalMinutes = hHour * 60 + hMin - habit.reminder_time;
                if (totalMinutes < 0) {
                    totalMinutes += 24 * 60; // Si pasa al día anterior
                }

                let reminderHour = Math.floor(totalMinutes / 60) % 24;
                let reminderMin = totalMinutes % 60;

                // Verificar si es el minuto exacto
                if (currentHour === reminderHour && currentMinute === reminderMin) {
                    // Enviar la notificación
                    const title = habit.type === 'habit' ? 'Recordatorio de Hábito' : 'Recordatorio de Tarea';
                    const body = `Es hora de: ${habit.name}`;
                    await notifyUser(habit.user_id, title, body, { habitId: habit.id });
                }
            }
        }

    } catch (err) {
        console.error('Error en notificationScheduler:', err);
    }
});

console.log('Notification Scheduler iniciado.');
