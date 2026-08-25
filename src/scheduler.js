import cron from 'node-cron';
import {
    getDailyProgress,
    getDueRecapGuilds,
    markRecapSent,
} from './db/queries.js';

function buildRecapMessage(guild, progress) {
    const lines = progress.rows.map((row) => {
        const status =
            row.total >= guild.dailyGoal
                ? 'objectif atteint !'
                : 'objectif non atteint';

        return `<@${row.userId}> : ${row.total}/${guild.dailyGoal} — ${status}`;
    });

    return [`Récap du jour (${progress.entryDate}) :`, ...lines].join('\n');
}

async function sendDueRecaps(client) {
    const dueGuilds = await getDueRecapGuilds();

    for (const guild of dueGuilds) {
        try {
            const channel = await client.channels.fetch(guild.trackedChannelId);

            const progress = await getDailyProgress(guild);

            if (progress.rows.length > 0) {
                await channel.send(buildRecapMessage(guild, progress));
            }

            await markRecapSent(guild.guildId, progress.entryDate);
        } catch (error) {
            console.error(
                `Échec du récap pour le serveur ${guild.guildId} :`,
                error.message,
            );
        }
    }
}

export function startScheduler(client) {
    cron.schedule('* * * * *', () => {
        sendDueRecaps(client).catch((error) => console.error(error));
    });
}
