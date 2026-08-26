import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { isRecapDue } from '../src/utils/recap-time.js';

// Guild observed in Asia/Tokyo so tests never depend on the runner's TZ.
const baseGuild = {
    timezone: 'Asia/Tokyo',
    reminderTime: '20:00',
    lastRecapDate: null,
    startDate: '2026-08-01',
    durationDays: 30,
};

function atUtc(hours, minutes) {
    return DateTime.utc(2026, 8, 26, hours, minutes);
}

describe('isRecapDue', () => {
    it('is due at the exact reminder minute in the guild timezone', () => {
        // UTC 11:00 == Tokyo 20:00
        assert.equal(isRecapDue(baseGuild, atUtc(11, 0)), true);
    });

    it('evaluates the clock in the guild timezone, not server time', () => {
        // UTC 13:00 == Tokyo 22:00 -> past the reminder window
        assert.equal(isRecapDue(baseGuild, atUtc(13, 0)), false);
        // Same instant expressed with a DateTime already set to Tokyo
        const tokyoNow = atUtc(11, 0).setZone('Asia/Tokyo');
        assert.equal(isRecapDue({ ...baseGuild }, tokyoNow), true);
    });

    it('is not due one minute before or after', () => {
        assert.equal(isRecapDue(baseGuild, atUtc(10, 59)), false);
        assert.equal(isRecapDue(baseGuild, atUtc(12, 1)), false);
        // same day, different hour entirely
        assert.equal(isRecapDue(baseGuild, atUtc(3, 15)), false);
    });

    it('is not due when lastRecapDate equals today (guild tz)', () => {
        const sent = { ...baseGuild, lastRecapDate: '2026-08-26' };
        assert.equal(isRecapDue(sent, atUtc(11, 0)), false);
        // a recap from yesterday does not block today's recap
        const stale = { ...baseGuild, lastRecapDate: '2026-08-25' };
        assert.equal(isRecapDue(stale, atUtc(11, 0)), true);
    });

    it('compares lastRecapDate against the guild-tz date, not the server date', () => {
        // UTC 11:00 on Aug 26 is still Aug 26 20:00 in Tokyo...
        // but at UTC 15:30 (Tokyo 00:30 Aug 27) "today" rolls over.
        const rolledOver = { ...baseGuild, lastRecapDate: '2026-08-26' };
        assert.equal(
            isRecapDue(rolledOver, DateTime.utc(2026, 8, 26, 15, 30)),
            false,
        ); // now Aug 27 in Tokyo, 00:30 != 20:00 anyway

        const dueNextDay = {
            ...baseGuild,
            lastRecapDate: '2026-08-26',
            reminderTime: '00:30',
        };
        assert.equal(
            isRecapDue(dueNextDay, DateTime.utc(2026, 8, 26, 15, 30)),
            true,
        );
    });

    it('is due on the first and last day of the challenge window', () => {
        // start 2026-08-01 + 30 days => last day 2026-08-30
        const firstDay = DateTime.utc(2026, 8, 1, 11, 0);
        assert.equal(isRecapDue(baseGuild, firstDay), true);

        const lastDay = DateTime.utc(2026, 8, 30, 11, 0);
        assert.equal(isRecapDue(baseGuild, lastDay), true);
    });

    it('is not due after the challenge window ends', () => {
        const afterWindow = DateTime.utc(2026, 8, 31, 11, 0);
        assert.equal(isRecapDue(baseGuild, afterWindow), false);

        const wayAfter = DateTime.utc(2027, 1, 5, 11, 0);
        assert.equal(isRecapDue(baseGuild, wayAfter), false);
    });

    it('ignores the window when startDate is null', () => {
        const noStart = { ...baseGuild, startDate: null };
        assert.equal(
            isRecapDue(noStart, DateTime.utc(2030, 1, 1, 11, 0)),
            true,
        );
    });

    it('still checks time-of-day when startDate is null', () => {
        const noStart = { ...baseGuild, startDate: null };
        assert.equal(
            isRecapDue(noStart, DateTime.utc(2030, 1, 1, 9, 0)),
            false,
        );
    });

    it('fires at 20:00 sharp on a DST spring-forward day', () => {
        // Europe/Paris switched 02:00->03:00 on 2027-03-28; 20:00 local exists
        const springGuild = {
            ...baseGuild,
            timezone: 'Europe/Paris',
            startDate: '2027-03-01',
        };
        const due = DateTime.fromISO('2027-03-28T20:00', {
            zone: 'Europe/Paris',
        });
        assert.equal(isRecapDue(springGuild, due), true);
        // the skipped wall-clock slot collapses forward: local 02:30 becomes 03:30
        const collapsed = DateTime.fromISO('2027-03-28T02:30', {
            zone: 'Europe/Paris',
        });
        assert.equal(collapsed.hour, 3);
        const gapReminder = { ...springGuild, reminderTime: '02:30' };
        assert.equal(isRecapDue(gapReminder, collapsed), false);
    });
});
