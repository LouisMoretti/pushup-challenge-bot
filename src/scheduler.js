import cron from 'node-cron';
import {
    getChallengeResults,
    getDailyProgress,
    getDueRecapGuilds,
    getGuildsForChallengeEnd,
    markChallengeEnded,
    markRecapSent,
} from './db/queries.js';
import {
    buildChallengeEndMessage,
    buildGoalLines,
    buildPodiumLine,
    getChallengeWindow,
} from './utils/challenge-end.js';
import { isRecapLate } from './utils/recap-time.js';

function buildRecapMessage(guild, progress) {
    const lines = progress.rows.map((row) => {
        const status =
            row.total >= guild.dailyGoal
                ? 'objectif atteint !'
                : 'objectif non atteint';

        return `<@${row.userId}> : ${row.total}/${guild.dailyGoal} — ${status}`;
    });

    const lateTag = isRecapLate(guild) ? '(en retard) ' : '';

    return [`Récap du jour ${lateTag}(${progress.entryDate}) :`, ...lines].join(
        '\n',
    );
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

function groupGoalRowsByUser(goalRows) {
    const goalRowsByUser = {};

    for (const row of goalRows) {
        (goalRowsByUser[row.userId] ??= []).push(row);
    }

    return goalRowsByUser;
}

async function sendChallengeEndMessages(client) {
    const dueGuilds = await getGuildsForChallengeEnd();

    for (const guild of dueGuilds) {
        try {
            const channel = await client.channels.fetch(guild.trackedChannelId);

            const results = await getChallengeResults(guild);

            if (!results.ok) {
                continue;
            }

            const podiumRows = results.totals
                .filter((row) => row.total > 0)
                .slice(0, 3)
                .map((row, index) =>
                    buildPodiumLine(index + 1, row.userId, row.total),
                );

            const goalLines = buildGoalLines(
                groupGoalRowsByUser(results.goalRows),
                results.dailyGoalTotal,
            );

            await channel.send(
                buildChallengeEndMessage({
                    window: getChallengeWindow(guild),
                    podiumRows,
                    goalLines,
                }),
            );

            await markChallengeEnded(guild.guildId);
        } catch (error) {
            console.error(
                `Échec du message de fin pour le serveur ${guild.guildId} :`,
                error.message,
            );
        }
    }
}

export function startScheduler(client) {
    cron.schedule('* * * * *', () => {
        sendDueRecaps(client)
            .catch((error) => console.error(error))
            .then(() => sendChallengeEndMessages(client))
            .catch((error) => console.error(error));
    });
}
