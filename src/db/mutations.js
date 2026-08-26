import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { entries, entryEvents } from './schema.js';
import {
    dateInGuildTimezone,
    getActiveParticipant,
    getGuild,
    getOrCreateEntry,
    isExerciseType,
} from './helpers.js';

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

    // Lock the row so concurrent commands cannot lose updates.
    const { updatedEntry, beforeCount, afterCount } = await db.transaction(
        async (tx) => {
            const [locked] = await tx
                .select({ count: entries.count })
                .from(entries)
                .where(eq(entries.id, entry.id))
                .for('update');

            const previousCount = locked.count;
            let nextCount;

            if (action === 'add' || action === 'admin_add') {
                nextCount = previousCount + amount;
            } else if (action === 'remove' || action === 'admin_remove') {
                nextCount = Math.max(previousCount - amount, 0);
            } else {
                nextCount = amount;
            }

            const [changedEntry] = await tx
                .update(entries)
                .set({
                    count: nextCount,
                    updatedAt: new Date(),
                })
                .where(eq(entries.id, entry.id))
                .returning();

            await tx.insert(entryEvents).values({
                entryId: entry.id,
                actorUserId,
                action,
                amount,
                beforeCount: previousCount,
                afterCount: nextCount,
            });

            return {
                updatedEntry: changedEntry,
                beforeCount: previousCount,
                afterCount: nextCount,
            };
        },
    );

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
