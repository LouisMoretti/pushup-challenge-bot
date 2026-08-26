import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from './client.js';
import { entries, guildExerciseGoals, guilds, participants } from './schema.js';
import {
    getChallengeWindow,
    isChallengeEnded,
} from '../utils/challenge-end.js';

export async function getGuildsForChallengeEnd() {
    const configuredGuilds = await db
        .select()
        .from(guilds)
        .where(
            and(
                isNotNull(guilds.trackedChannelId),
                isNull(guilds.challengeEndedAt),
                isNotNull(guilds.startDate),
            ),
        );

    return configuredGuilds.filter((guild) => isChallengeEnded(guild));
}

export async function getDailyGoalTarget(guild) {
    const [row] = await db
        .select({
            total: sql`coalesce(sum(${guildExerciseGoals.dailyGoal}), 0)`.mapWith(
                Number,
            ),
        })
        .from(guildExerciseGoals)
        .where(eq(guildExerciseGoals.guildId, guild.guildId));

    const perExerciseSum = row?.total ?? 0;

    return perExerciseSum > 0 ? perExerciseSum : guild.dailyGoal;
}

export async function getChallengeResults(guild) {
    const window = getChallengeWindow(guild);

    if (!window) {
        return { ok: false, reason: 'missing_start_date' };
    }

    const total = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);
    const dayTotal = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);
    const windowFilter = and(
        eq(entries.participantId, participants.id),
        gte(entries.entryDate, window.startDate),
        lte(entries.entryDate, window.lastDay),
    );

    const totals = await db
        .select({ userId: participants.userId, total })
        .from(participants)
        .leftJoin(entries, windowFilter)
        .where(
            and(
                eq(participants.guildId, guild.guildId),
                eq(participants.active, true),
            ),
        )
        .groupBy(participants.userId)
        .orderBy(desc(total));

    const goalRows = await db
        .select({
            userId: participants.userId,
            entryDate: entries.entryDate,
            dayTotal,
        })
        .from(participants)
        .innerJoin(entries, windowFilter)
        .where(
            and(
                eq(participants.guildId, guild.guildId),
                eq(participants.active, true),
            ),
        )
        .groupBy(participants.userId, entries.entryDate);

    const dailyGoalTotal = await getDailyGoalTarget(guild);

    return { ok: true, totals, goalRows, dailyGoalTotal };
}

export async function markChallengeEnded(guildId) {
    await db
        .update(guilds)
        .set({ challengeEndedAt: new Date() })
        .where(eq(guilds.guildId, guildId));
}
