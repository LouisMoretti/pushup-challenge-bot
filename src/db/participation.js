import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db } from './client.js';
import {
    EXERCISE_TYPES,
    guildExerciseGoals,
    guilds,
    participants,
} from './schema.js';
import {
    getGuild,
    getParticipant,
    isExerciseType,
    isGuildConfigured,
} from './helpers.js';

const updatableSettingsFields = [
    'trackedChannelId',
    'durationDays',
    'timezone',
    'reminderTime',
];

export async function setupGuild({
    guildId,
    trackedChannelId,
    durationDays,
    timezone,
    reminderTime,
    goals,
}) {
    return db.transaction(async (tx) => {
        const [guild] = await tx
            .insert(guilds)
            .values({
                guildId,
                trackedChannelId,
                startDate: DateTime.now().setZone(timezone).toISODate(),
                durationDays,
                timezone,
                reminderTime,
            })
            .returning();

        await tx.insert(guildExerciseGoals).values(
            Object.values(EXERCISE_TYPES).map((exerciseType) => ({
                guildId,
                exerciseType,
                dailyGoal: goals[exerciseType],
            })),
        );

        return guild;
    });
}

export async function updateGuildSettings(guildId, fields) {
    const guild = await getGuild(guildId);

    if (!isGuildConfigured(guild)) {
        return { ok: false, reason: 'not_configured' };
    }

    const updates = {};

    for (const field of updatableSettingsFields) {
        if (fields[field] !== undefined) {
            updates[field] = fields[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        return { ok: false, reason: 'no_fields' };
    }

    const [updatedGuild] = await db
        .update(guilds)
        .set(updates)
        .where(eq(guilds.guildId, guildId))
        .returning();

    return { ok: true, guild: updatedGuild };
}

export async function resetGuildConfig(guildId) {
    const guild = await getGuild(guildId);

    if (!isGuildConfigured(guild)) {
        return { ok: false, reason: 'not_configured' };
    }

    await db.transaction(async (tx) => {
        await tx
            .update(guilds)
            .set({
                trackedChannelId: null,
                startDate: null,
                lastRecapDate: null,
            })
            .where(eq(guilds.guildId, guildId));

        await tx
            .delete(guildExerciseGoals)
            .where(eq(guildExerciseGoals.guildId, guildId));
    });

    return { ok: true };
}

export async function getGuildGoals(guildId) {
    const goals = await db
        .select()
        .from(guildExerciseGoals)
        .where(eq(guildExerciseGoals.guildId, guildId))
        .orderBy(guildExerciseGoals.exerciseType);

    return goals;
}

export async function getGuildGoal(guildId, exerciseType) {
    const [goal] = await db
        .select({ dailyGoal: guildExerciseGoals.dailyGoal })
        .from(guildExerciseGoals)
        .where(
            and(
                eq(guildExerciseGoals.guildId, guildId),
                eq(guildExerciseGoals.exerciseType, exerciseType),
            ),
        );

    return goal ? goal.dailyGoal : null;
}

export async function setGuildGoal(guildId, exerciseType, dailyGoal) {
    if (!isExerciseType(exerciseType)) {
        return { ok: false, reason: 'invalid_exercise_type' };
    }

    const guild = await getGuild(guildId);

    if (!isGuildConfigured(guild)) {
        return { ok: false, reason: 'not_configured' };
    }

    const [goal] = await db
        .insert(guildExerciseGoals)
        .values({ guildId, exerciseType, dailyGoal })
        .onConflictDoUpdate({
            target: [
                guildExerciseGoals.guildId,
                guildExerciseGoals.exerciseType,
            ],
            set: { dailyGoal },
        })
        .returning();

    return { ok: true, goal };
}

export async function joinChallenge(guildId, userId) {
    const guild = await getGuild(guildId);

    if (!isGuildConfigured(guild)) {
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
