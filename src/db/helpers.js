import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db } from './client.js';
import { entries, EXERCISE_TYPES, guilds, participants } from './schema.js';

// --- Shared helpers ---

export async function getGuild(guildId) {
    const [guild] = await db
        .select()
        .from(guilds)
        .where(eq(guilds.guildId, guildId));

    return guild;
}

export async function getParticipant(guildId, userId) {
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

export function dateInGuildTimezone(guild) {
    return DateTime.now().setZone(guild.timezone).toISODate();
}

export async function getActiveParticipant(guildId, userId) {
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

export function isExerciseType(exerciseType) {
    return Object.values(EXERCISE_TYPES).includes(exerciseType);
}

export async function getOrCreateEntry(participantId, entryDate, exerciseType) {
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
