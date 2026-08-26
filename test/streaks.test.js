import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { computeStreak } from '../src/utils/streaks.js';

// Fixed "now" in the guild timezone so tests never depend on the
// runner's clock or TZ. Today is always 2026-08-26 here.
const NOW = DateTime.fromISO('2026-08-26T12:00:00', {
    zone: 'Europe/Paris',
});

// Builds entriesByDate from { 'YYYY-MM-DD': count } for a single type.
function singleType(perDay, type = 'PUSHUP') {
    return Object.fromEntries(
        Object.entries(perDay).map(([date, count]) => [
            date,
            { [type]: count },
        ]),
    );
}

describe('computeStreak', () => {
    it('returns 0 for a participant with zero entries', () => {
        const streak = computeStreak({
            entriesByDate: {},
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 0);
    });

    it('counts today when today is already successful', () => {
        const streak = computeStreak({
            entriesByDate: singleType({
                '2026-08-26': 100,
                '2026-08-25': 100,
            }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 2);
    });

    it('falls back to yesterday when today is not yet successful', () => {
        // Today has entries below the goal: the streak must not break,
        // and must count up to yesterday only.
        const streak = computeStreak({
            entriesByDate: singleType({
                '2026-08-26': 40,
                '2026-08-25': 100,
                '2026-08-24': 100,
            }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 2);
    });

    it('also falls back to yesterday when today has no entries', () => {
        const streak = computeStreak({
            entriesByDate: singleType({
                '2026-08-25': 100,
                '2026-08-24': 100,
            }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 2);
    });

    it('is broken by a gap day with no entries at all', () => {
        // 2026-08-25 has no entry: only today counts.
        const streak = computeStreak({
            entriesByDate: singleType({
                '2026-08-26': 100,
                '2026-08-24': 100,
                '2026-08-23': 100,
            }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 1);
    });

    it('fails a day when one exercise stays below its goal', () => {
        // SQUAT misses its goal on 2026-08-25 while PUSHUP passes.
        const streak = computeStreak({
            entriesByDate: {
                '2026-08-26': { PUSHUP: 120, SQUAT: 60 },
                '2026-08-25': { PUSHUP: 120, SQUAT: 30 },
                '2026-08-24': { PUSHUP: 120, SQUAT: 60 },
            },
            goalsByType: { PUSHUP: 100, SQUAT: 50 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 1);
    });

    it('requires every configured type to pass each day', () => {
        const streak = computeStreak({
            entriesByDate: {
                '2026-08-26': { PUSHUP: 120, SQUAT: 50 },
                '2026-08-25': { PUSHUP: 120, SQUAT: 50 },
                '2026-08-24': { PUSHUP: 120 }, // SQUAT missing entirely
            },
            goalsByType: { PUSHUP: 100, SQUAT: 50 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 2);
    });

    it('ignores entries before the challenge start date', () => {
        // Successful every day since 2026-08-14 but the challenge only
        // started on 2026-08-20: only 20..26 may count.
        const perDay = {};
        for (let day = 14; day <= 26; day += 1) {
            perDay[`2026-08-${String(day).padStart(2, '0')}`] = 100;
        }

        const streak = computeStreak({
            entriesByDate: singleType(perDay),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-20',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 7);
    });

    it('returns 0 before the challenge starts', () => {
        const streak = computeStreak({
            entriesByDate: singleType({ '2026-08-25': 100 }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-09-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 0);
    });

    it('ignores successes after startDate + durationDays - 1', () => {
        // Challenge runs 2026-08-01..2026-08-10 (durationDays: 10).
        // Successful 2026-08-06..2026-08-12; only up to 08-10 counts.
        const perDay = {};
        for (let day = 6; day <= 12; day += 1) {
            perDay[`2026-08-${String(day).padStart(2, '0')}`] = 100;
        }

        const streak = computeStreak({
            entriesByDate: singleType(perDay),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 10,
            now: NOW,
        });

        assert.equal(streak, 5);
    });

    it('ends at the last challenge day once the challenge is over', () => {
        // Challenge ended 2026-08-10 and that final day was successful;
        // entries stopped afterwards but must not matter.
        const streak = computeStreak({
            entriesByDate: singleType({
                '2026-08-10': 100,
                '2026-08-09': 100,
            }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 10,
            now: NOW,
        });

        assert.equal(streak, 2);
    });

    it('never returns a negative streak', () => {
        // Today below goal and yesterday missing entirely.
        const streak = computeStreak({
            entriesByDate: singleType({ '2026-08-26': 1 }),
            goalsByType: { PUSHUP: 100 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 0);
        assert.ok(streak >= 0);
    });

    it('works for a single-type guild', () => {
        const streak = computeStreak({
            entriesByDate: singleType(
                {
                    '2026-08-26': 8,
                    '2026-08-25': 8,
                    '2026-08-24': 3,
                },
                'RUNNING',
            ),
            goalsByType: { RUNNING: 8 },
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 2);
    });

    it('returns 0 when no goals are configured', () => {
        const streak = computeStreak({
            entriesByDate: singleType({ '2026-08-26': 100 }),
            goalsByType: {},
            startDate: '2026-08-01',
            durationDays: 30,
            now: NOW,
        });

        assert.equal(streak, 0);
    });
});
