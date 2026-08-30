import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db } from './client.js';
import { guilds, participants } from './schema.js';
import { getGuild, getParticipant } from './helpers.js';

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
