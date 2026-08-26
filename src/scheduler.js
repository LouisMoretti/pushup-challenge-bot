import cron from 'node-cron';
import {
    EXERCISE_TYPES,
    getChallengeResults,
    getDailyProgressByType,
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

const exerciseLabels = {
    [EXERCISE_TYPES.PUSHUP]: 'POMPES',
    [EXERCISE_TYPES.SQUAT]: 'SQUATS',
    [EXERCISE_TYPES.CRUNCH]: 'CRUNCH',
    [EXERCISE_TYPES.RUNNING]: 'COURSE',
};

function buildRecapMessage(guild, progress) {
    const goalsByType = new Map(
        progress.goals.map((goal) => [goal.exerciseType, goal.dailyGoal]),
    );

    const countsByUser = new Map();

    for (const row of progress.rows) {
        if (!countsByUser.has(row.userId)) {
            countsByUser.set(row.userId, new Map());
        }

        if (row.exerciseType && goalsByType.has(row.exerciseType)) {
            countsByUser.get(row.userId).set(row.exerciseType, row.total);
        }
    }

    const lines = [...countsByUser.entries()].map(([userId, counts]) => {
        const parts = [...goalsByType.entries()].map(([exerciseType, goal]) => {
            const count = counts.get(exerciseType) ?? 0;
            const status = count >= goal ? '✅' : '❌';

            return `${exerciseLabels[exerciseType]} ${count}/${goal} ${status}`;
        });

        return `<@${userId}> — ${parts.join(' · ')}`;
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

            const progress = await getDailyProgressByType(guild);

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
