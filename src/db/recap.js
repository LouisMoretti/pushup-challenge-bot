import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './client.js';
import { entries, guilds, participants } from './schema.js';
import { dateInGuildTimezone } from './helpers.js';
import { getGuildGoals } from './participation.js';
import { isRecapDue } from '../utils/recap-time.js';

export { isRecapDue };

export async function getDueRecapGuilds() {
    const configuredGuilds = await db
        .select()
        .from(guilds)
        .where(isNotNull(guilds.trackedChannelId));

    // filter passes (element, index, array): a bare isRecapDue reference
    // would receive the index as `now` and crash on now.setZone.
    return configuredGuilds.filter((guild) => isRecapDue(guild));
}

export async function getDailyProgressByType(guild) {
    const entryDate = dateInGuildTimezone(guild);
    const total = sql`coalesce(sum(${entries.count}), 0)`.mapWith(Number);

    const [goals, rows] = await Promise.all([
        getGuildGoals(guild.guildId),
        db
            .select({
                userId: participants.userId,
                exerciseType: entries.exerciseType,
                total,
            })
            .from(participants)
            .leftJoin(
                entries,
                and(
                    eq(entries.participantId, participants.id),
                    eq(entries.entryDate, entryDate),
                ),
            )
            .where(
                and(
                    eq(participants.guildId, guild.guildId),
                    eq(participants.active, true),
                ),
            )
            .groupBy(participants.userId, entries.exerciseType)
            .orderBy(participants.userId),
    ]);

    return { entryDate, goals, rows };
}

export async function markRecapSent(guildId, recapDate) {
    await db
        .update(guilds)
        .set({ lastRecapDate: recapDate })
        .where(eq(guilds.guildId, guildId));
}
