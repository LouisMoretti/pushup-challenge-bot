import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db } from './client.js';
import { entries, guildExerciseGoals, participants } from './schema.js';
import { computeStreak } from '../utils/streaks.js';
import { getActiveParticipant, getGuild, isExerciseType } from './helpers.js';

export async function getLeaderboard(guildId, exerciseType) {
    if (!isExerciseType(exerciseType)) {
        return { ok: false, reason: 'invalid_exercise_type' };
    }

    const total = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);

    const rows = await db
        .select({
            userId: participants.userId,
            total,
        })
        .from(participants)
        .leftJoin(
            entries,
            and(
                eq(entries.participantId, participants.id),
                eq(entries.exerciseType, exerciseType),
            ),
        )
        .where(
            and(
                eq(participants.guildId, guildId),
                eq(participants.active, true),
            ),
        )
        .groupBy(participants.userId)
        .orderBy(desc(total));

    return { ok: true, rows };
}

export async function getGlobalStats(guildId, exerciseType) {
    if (!isExerciseType(exerciseType)) {
        return { ok: false, reason: 'invalid_exercise_type' };
    }

    const total = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);
    const loggedDays = sql`count(distinct ${entries.entryDate})`.mapWith(
        Number,
    );
    const bestDay = sql`coalesce(max(${entries.count}), 0)`.mapWith(Number);
    const activeParticipants = sql`count(distinct ${participants.id})`.mapWith(
        Number,
    );

    const [stats] = await db
        .select({
            total,
            loggedDays,
            bestDay,
            activeParticipants,
        })
        .from(participants)
        .leftJoin(
            entries,
            and(
                eq(entries.participantId, participants.id),
                eq(entries.exerciseType, exerciseType),
            ),
        )
        .where(
            and(
                eq(participants.guildId, guildId),
                eq(participants.active, true),
            ),
        );

    return { ok: true, stats };
}

export async function getUserAllStats(guildId, userId) {
    const total = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);
    const loggedDays = sql`count(${entries.id})`.mapWith(Number);
    const bestDay = sql`coalesce(max(${entries.count}), 0)`.mapWith(Number);

    const rows = await db
        .select({
            exerciseType: entries.exerciseType,
            total,
            loggedDays,
            bestDay,
        })
        .from(participants)
        .leftJoin(entries, eq(entries.participantId, participants.id))
        .where(
            and(
                eq(participants.guildId, guildId),
                eq(participants.userId, userId),
                eq(participants.active, true),
            ),
        )
        .groupBy(entries.exerciseType);

    if (rows.length === 0) {
        return { ok: false, reason: 'not_joined' };
    }

    return {
        ok: true,
        rows: rows.filter((row) => row.exerciseType !== null),
    };
}

export async function getUserStats(guildId, userId, exerciseType) {
    if (!isExerciseType(exerciseType)) {
        return { ok: false, reason: 'invalid_exercise_type' };
    }

    const participant = await getActiveParticipant(guildId, userId);

    if (!participant) {
        return { ok: false, reason: 'not_joined' };
    }

    const total = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);
    const loggedDays = sql`count(${entries.id})`.mapWith(Number);
    const bestDay = sql`coalesce(max(${entries.count}), 0)`.mapWith(Number);

    const [stats] = await db
        .select({
            total,
            loggedDays,
            bestDay,
        })
        .from(entries)
        .where(
            and(
                eq(entries.participantId, participant.id),
                eq(entries.exerciseType, exerciseType),
            ),
        );

    return { ok: true, stats };
}

/**
 * Consecutive successful days ending today (or yesterday when today is
 * not yet successful), bounded by the challenge window. A day is
 * successful iff every configured exercise type reaches its own goal.
 */
export async function getUserStreak(guildId, userId) {
    const participant = await getActiveParticipant(guildId, userId);

    if (!participant) {
        return { ok: false, reason: 'not_joined' };
    }

    const guild = await getGuild(guildId);

    if (!guild) {
        return { ok: false, reason: 'guild_not_configured' };
    }

    const goalRows = await db
        .select({
            exerciseType: guildExerciseGoals.exerciseType,
            dailyGoal: guildExerciseGoals.dailyGoal,
        })
        .from(guildExerciseGoals)
        .where(eq(guildExerciseGoals.guildId, guildId));

    // No goals configured => no successful day is even possible.
    if (goalRows.length === 0) {
        return { ok: true, streak: 0 };
    }

    const goalsByType = Object.fromEntries(
        goalRows.map((row) => [row.exerciseType, row.dailyGoal]),
    );

    const conditions = [eq(entries.participantId, participant.id)];

    if (guild.startDate) {
        conditions.push(gte(entries.entryDate, guild.startDate));
    }

    const rows = await db
        .select({
            entryDate: entries.entryDate,
            exerciseType: entries.exerciseType,
            count: entries.count,
        })
        .from(entries)
        .where(and(...conditions));

    const entriesByDate = {};

    for (const row of rows) {
        entriesByDate[row.entryDate] ??= {};
        entriesByDate[row.entryDate][row.exerciseType] =
            (entriesByDate[row.entryDate][row.exerciseType] ?? 0) + row.count;
    }

    const streak = computeStreak({
        entriesByDate,
        goalsByType,
        startDate: guild.startDate,
        durationDays: guild.durationDays,
        now: DateTime.now().setZone(guild.timezone),
    });

    return { ok: true, streak };
}

export async function getGuildStreaks(guildId) {
    const activeParticipants = await db
        .select({ userId: participants.userId })
        .from(participants)
        .where(
            and(
                eq(participants.guildId, guildId),
                eq(participants.active, true),
            ),
        );

    const streaksByUser = new Map();

    for (const { userId } of activeParticipants) {
        const result = await getUserStreak(guildId, userId);

        if (result.ok) {
            streaksByUser.set(userId, result.streak);
        }
    }

    return streaksByUser;
}
