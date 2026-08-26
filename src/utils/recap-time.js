import { DateTime } from 'luxon';

export function isRecapDue(guild, now = DateTime.now()) {
    const guildNow = now.setZone(guild.timezone);
    const today = guildNow.toISODate();

    if (guild.lastRecapDate === today) {
        return false;
    }

    if (guildNow.toFormat('HH:mm') !== guild.reminderTime) {
        return false;
    }

    if (guild.startDate) {
        const lastDay = DateTime.fromISO(guild.startDate, {
            zone: guild.timezone,
        })
            .plus({ days: guild.durationDays - 1 })
            .toISODate();

        if (today > lastDay) {
            return false;
        }
    }

    return true;
}
