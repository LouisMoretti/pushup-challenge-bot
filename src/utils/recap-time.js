import { DateTime } from 'luxon';

function minutesOfDay(time) {
    const [hour, minute] = time.split(':').map(Number);

    return hour * 60 + minute;
}

export function isRecapDue(guild, now = DateTime.now()) {
    const guildNow = now.setZone(guild.timezone);
    const today = guildNow.toISODate();

    if (guild.lastRecapDate === today) {
        return false;
    }

    // #13: due AT the reminder minute or at any later minute of the same
    // guild-tz day, so a bot downtime no longer loses the recap. Edge case,
    // documented choice: a guild configured TODAY with its reminder time
    // already past fires a same-day catch-up (rather than skipping to
    // tomorrow). Multi-day downtime still yields exactly one recap, for
    // today only, because only `today` is ever evaluated.
    if (
        guildNow.hour * 60 + guildNow.minute <
        minutesOfDay(guild.reminderTime)
    ) {
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

export function isRecapLate(guild, now = DateTime.now()) {
    const guildNow = now.setZone(guild.timezone);

    return (
        guildNow.hour * 60 + guildNow.minute > minutesOfDay(guild.reminderTime)
    );
}
