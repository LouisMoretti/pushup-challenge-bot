import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { entries, participants } from './schema.js';
import { getActiveParticipant, isExerciseType } from './helpers.js';

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
