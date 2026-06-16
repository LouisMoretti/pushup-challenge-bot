import { and, desc, eq, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db } from './client.js';
import {
    entries,
    entryEvents,
    EXERCISE_TYPES,
    guilds,
    participants,
} from './schema.js';

export { EXERCISE_TYPES };

// --- Helpers ---
async function getGuild(guildId) {
    const [guild] = await db
        .select()
        .from(guilds)
        .where(eq(guilds.guildId, guildId));

    return guild;
}

async function getParticipant(guildId, userId) {
    const [participant] = await db
        .select()
        .from(participants)
        .where(
            and(
                eq(participants.guildId, guildId),
                eq(participants.userId, userId),
            ),
        );

    return participant;
}

function dateInGuildTimezone(guild) {
    return DateTime.now().setZone(guild.timezone).toISODate();
}

async function getActiveParticipant(guildId, userId) {
    const [participant] = await db
        .select()
        .from(participants)
        .where(
            and(
                eq(participants.guildId, guildId),
                eq(participants.userId, userId),
                eq(participants.active, true),
            ),
        );

    return participant;
}

function isExerciseType(exerciseType) {
    return Object.values(EXERCISE_TYPES).includes(exerciseType);
}

async function getOrCreateEntry(participantId, entryDate, exerciseType) {
    const [entry] = await db
        .insert(entries)
        .values({
            participantId,
            entryDate,
            exerciseType,
            count: 0,
        })
        .onConflictDoNothing({
            target: [
                entries.participantId,
                entries.entryDate,
                entries.exerciseType,
            ],
        })
        .returning();

    if (entry) {
        return entry;
    }

    const [existingEntry] = await db
        .select()
        .from(entries)
        .where(
            and(
                eq(entries.participantId, participantId),
                eq(entries.entryDate, entryDate),
                eq(entries.exerciseType, exerciseType),
            ),
        );

    return existingEntry;
}

async function applyExerciseChange({
    guildId,
    actorUserId,
    targetUserId,
    exerciseType,
    amount,
    action,
}) {
    if (!isExerciseType(exerciseType)) {
        return { ok: false, reason: 'invalid_exercise_type' };
    }

    const guild = await getGuild(guildId);

    if (!guild) {
        return { ok: false, reason: 'guild_not_configured' };
    }

    const participant = await getActiveParticipant(guildId, targetUserId);

    if (!participant) {
        return { ok: false, reason: 'not_joined' };
    }

    const entryDate = dateInGuildTimezone(guild);
    const entry = await getOrCreateEntry(
        participant.id,
        entryDate,
        exerciseType,
    );
    const beforeCount = entry.count;
    let afterCount;

    if (action === 'add' || action === 'admin_add') {
        afterCount = beforeCount + amount;
    } else if (action === 'remove' || action === 'admin_remove') {
        afterCount = Math.max(beforeCount - amount, 0);
    } else {
        afterCount = amount;
    }

    const [updatedEntry] = await db
        .update(entries)
        .set({
            count: afterCount,
            updatedAt: new Date(),
        })
        .where(eq(entries.id, entry.id))
        .returning();

    await db.insert(entryEvents).values({
        entryId: entry.id,
        actorUserId,
        action,
        amount,
        beforeCount,
        afterCount,
    });

    return {
        ok: true,
        guild,
        entry: updatedEntry,
        participant,
        entryDate,
        beforeCount,
        afterCount,
        reachedGoal:
            beforeCount < guild.dailyGoal && afterCount >= guild.dailyGoal,
    };
}

// --- Exported functions ---
export async function setupGuild({
    guildId,
    trackedChannelId,
    dailyGoal,
    durationDays,
    timezone,
    reminderTime,
}) {
    const values = {
        guildId,
        trackedChannelId,
        startDate: DateTime.now().setZone(timezone).toISODate(),
        dailyGoal,
        durationDays,
        timezone,
        reminderTime,
    };

    const [guild] = await db
        .insert(guilds)
        .values(values)
        .onConflictDoUpdate({
            target: guilds.guildId,
            set: {
                trackedChannelId,
                dailyGoal,
                durationDays,
                timezone,
                reminderTime,
            },
        })
        .returning();

    return guild;
}

export async function joinChallenge(guildId, userId) {
    const guild = await getGuild(guildId);

    if (!guild) {
        return { ok: false, reason: 'guild_not_configured' };
    }

    const [participant] = await db
        .insert(participants)
        .values({
            guildId,
            userId,
            active: true,
        })
        .onConflictDoUpdate({
            target: [participants.guildId, participants.userId],
            set: { active: true },
        })
        .returning();

    return { ok: true, participant };
}

export async function leaveChallenge(guildId, userId) {
    const participant = await getParticipant(guildId, userId);

    if (!participant || !participant.active) {
        return { ok: false, reason: 'not_joined' };
    }

    const [updatedParticipant] = await db
        .update(participants)
        .set({ active: false })
        .where(eq(participants.id, participant.id))
        .returning();

    return { ok: true, participant: updatedParticipant };
}

export async function addExercise(guildId, userId, exerciseType, amount) {
    return applyExerciseChange({
        guildId,
        actorUserId: userId,
        targetUserId: userId,
        exerciseType,
        amount,
        action: 'add',
    });
}

export async function setExercise(guildId, userId, exerciseType, count) {
    return applyExerciseChange({
        guildId,
        actorUserId: userId,
        targetUserId: userId,
        exerciseType,
        amount: count,
        action: 'set',
    });
}

export async function adminAddExercise(
    guildId,
    actorUserId,
    targetUserId,
    exerciseType,
    amount,
) {
    return applyExerciseChange({
        guildId,
        actorUserId,
        targetUserId,
        exerciseType,
        amount,
        action: 'admin_add',
    });
}

export async function adminRemoveExercise(
    guildId,
    actorUserId,
    targetUserId,
    exerciseType,
    amount,
) {
    return applyExerciseChange({
        guildId,
        actorUserId,
        targetUserId,
        exerciseType,
        amount,
        action: 'admin_remove',
    });
}

export async function adminSetExercise(
    guildId,
    actorUserId,
    targetUserId,
    exerciseType,
    count,
) {
    return applyExerciseChange({
        guildId,
        actorUserId,
        targetUserId,
        exerciseType,
        amount: count,
        action: 'admin_set',
    });
}

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
