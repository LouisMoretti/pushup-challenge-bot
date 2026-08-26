import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { isRecapDue, isRecapLate } from '../src/utils/recap-time.js';

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
        // Behavior changed with #13: any instant past the reminder minute is
        // due, so UTC 13:00 (Tokyo 22:00) is now due — which itself proves
        // the comparison runs on Tokyo wall time, not UTC 20:00.
        assert.equal(isRecapDue(baseGuild, atUtc(13, 0)), true);
        // A pre-reminder Tokyo instant stays not due regardless of how the
        // server clock reads it: UTC 03:00 == Tokyo 12:00.
        assert.equal(isRecapDue(baseGuild, atUtc(3, 0)), false);
        // Same instant expressed with a DateTime already set to Tokyo
        const tokyoNow = atUtc(11, 0).setZone('Asia/Tokyo');
        assert.equal(isRecapDue({ ...baseGuild }, tokyoNow), true);
    });

    it('is due one minute after the reminder (catch-up), not before', () => {
        // Behavior changed with #13: the old exact-equality rule lost the
        // recap whenever the bot was not running at the precise minute.
        assert.equal(isRecapDue(baseGuild, atUtc(10, 59)), false);
        assert.equal(isRecapDue(baseGuild, atUtc(12, 1)), true);
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

    it('is not due after the challenge window ends, even past the reminder', () => {
        // Post-reminder instants (Tokyo 22:37): they would trigger a #13
        // catch-up if the window were open, so this pins the window check.
        const afterWindow = DateTime.utc(2026, 8, 31, 13, 37);
        assert.equal(isRecapDue(baseGuild, afterWindow), false);

        const wayAfter = DateTime.utc(2027, 1, 5, 13, 37);
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
        // Behavior changed with #13: the skipped 02:30 slot collapses to
        // 03:30, strictly after the reminder, so the day is salvaged by a
        // late catch-up instead of being silently lost.
        assert.equal(isRecapDue(gapReminder, collapsed), true);
    });

    it('catches up when the bot comes back after the reminder time (#13)', () => {
        // UTC 13:37 == Tokyo 22:37: the 20:00 slot was missed entirely
        assert.equal(isRecapDue(baseGuild, atUtc(13, 37)), true);

        const sentYesterday = { ...baseGuild, lastRecapDate: '2026-08-25' };
        assert.equal(isRecapDue(sentYesterday, atUtc(13, 37)), true);
    });

    it('is not due once already sent today, even far after the reminder', () => {
        // Tokyo 23:59, almost four hours past the reminder: the once-per-day
        // guard wins over the catch-up rule.
        const sent = { ...baseGuild, lastRecapDate: '2026-08-26' };
        assert.equal(isRecapDue(sent, atUtc(14, 59)), false);
    });

    it('is not due before the reminder time, however early', () => {
        // Tokyo 19:59, one minute early
        assert.equal(isRecapDue(baseGuild, atUtc(10, 59)), false);
        // Tokyo 08:00 the same morning
        assert.equal(
            isRecapDue(baseGuild, DateTime.utc(2026, 8, 25, 23, 0)),
            false,
        );
    });

    it('sends exactly one catch-up after several offline days (#13)', () => {
        const stale = { ...baseGuild, lastRecapDate: '2026-08-22' };
        // Back online 2026-08-26 after the reminder: due for TODAY only —
        // no backlog replay of Aug 23-25, because only `today` is evaluated.
        assert.equal(isRecapDue(stale, atUtc(13, 0)), true);
    });

    it('fires a same-day catch-up when configured after the reminder passed', () => {
        // Documented edge case (#13): the guild is set up today with a 09:00
        // reminder that is already past at 11:00 — we fire rather than wait
        // for tomorrow.
        const fresh = { ...baseGuild, reminderTime: '09:00' };
        // UTC 02:00 == Tokyo 11:00
        assert.equal(isRecapDue(fresh, atUtc(2, 0)), true);
        // ...but nothing fires before that first reminder (Tokyo 08:59)
        assert.equal(
            isRecapDue(fresh, DateTime.utc(2026, 8, 25, 23, 59)),
            false,
        );
    });

    it('does not recap after midnight before the next reminder (#13)', () => {
        // UTC 15:30 == Tokyo 00:30 on Aug 27: the Aug 27 reminder has not
        // passed yet and the Aug 26 one belongs to a finished calendar day.
        assert.equal(isRecapDue(baseGuild, atUtc(15, 30)), false);
    });

    it('recaps late on the last window day, never after it (#13)', () => {
        // Last day 2026-08-30, very late catch-up (Tokyo 23:59) still counts
        assert.equal(
            isRecapDue(baseGuild, DateTime.utc(2026, 8, 30, 14, 59)),
            true,
        );

        // Day after last day: not due at either end of the guild-tz day
        const earlyTokyo = DateTime.utc(2026, 8, 30, 15, 30); // 00:30 Aug 31
        assert.equal(isRecapDue(baseGuild, earlyTokyo), false);
        assert.equal(
            isRecapDue(baseGuild, DateTime.utc(2026, 8, 31, 14, 59)),
            false,
        ); // Tokyo 23:59 Aug 31
    });
});

describe('isRecapLate', () => {
    it('is not late at the exact reminder minute', () => {
        assert.equal(isRecapLate(baseGuild, atUtc(11, 0)), false);
    });

    it('is late strictly after the reminder minute', () => {
        assert.equal(isRecapLate(baseGuild, atUtc(11, 1)), true);
        assert.equal(isRecapLate(baseGuild, atUtc(14, 59)), true);
    });

    it('is not late before the reminder minute', () => {
        assert.equal(isRecapLate(baseGuild, atUtc(10, 59)), false);
        assert.equal(
            isRecapLate(baseGuild, DateTime.utc(2026, 8, 25, 23, 0)),
            false,
        );
    });
});
