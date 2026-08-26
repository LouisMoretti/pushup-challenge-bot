import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './client.js';
import { entries, guilds, participants } from './schema.js';
import { dateInGuildTimezone } from './helpers.js';
import { isRecapDue } from '../utils/recap-time.js';

export { isRecapDue };

export async function getDueRecapGuilds() {
    const configuredGuilds = await db
        .select()
        .from(guilds)
        .where(isNotNull(guilds.trackedChannelId));

    return configuredGuilds.filter(isRecapDue);
}

export async function getDailyProgress(guild) {
    const entryDate = dateInGuildTimezone(guild);
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
                eq(entries.entryDate, entryDate),
            ),
        )
        .where(
            and(
                eq(participants.guildId, guild.guildId),
                eq(participants.active, true),
            ),
        )
        .groupBy(participants.userId)
        .orderBy(desc(total));

    return { entryDate, rows };
}

export async function markRecapSent(guildId, recapDate) {
    await db
        .update(guilds)
        .set({ lastRecapDate: recapDate })
        .where(eq(guilds.guildId, guildId));
}
