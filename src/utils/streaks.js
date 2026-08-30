import { DateTime } from 'luxon';

/**
 * Pure streak computation for a participant (issue #21).
 *
 * A day is successful iff EVERY exercise type configured for the guild
 * reaches its own goal that day. The streak is the number of consecutive
 * successful days ending today — or ending yesterday when today is not
 * (yet) successful, so logging below the goals during the current day
 * does not break the streak. Days with no entries at all are never
 * successful and stop the walk.
 *
 * The walk is bounded by the challenge window: nothing before
 * `startDate` and nothing after `startDate + durationDays - 1` counts.
 *
 * @param {object} params
 * @param {Object<string, Object<string, number>>} params.entriesByDate
 *   Plain object keyed by 'YYYY-MM-DD', each value an object mapping
 *   exercise type to the total count logged that day, e.g.
 *   `{ '2026-08-25': { PUSHUP: 100, SQUAT: 50 } }`. Missing keys mean
 *   nothing was logged that day.
 * @param {Object<string, number>} params.goalsByType Goals for the
 *   configured types only, e.g. `{ PUSHUP: 100, SQUAT: 50 }`.
 * @param {string|null} params.startDate Challenge start 'YYYY-MM-DD' or
 *   null when the challenge has not started yet.
 * @param {number|null} params.durationDays Positive integer or null.
 * @param {DateTime} params.now Guild-timezone aware Luxon DateTime used
 *   to determine "today".
 * @returns {number} Streak as an integer >= 0.
 */
export function computeStreak({
    entriesByDate,
    goalsByType,
    startDate,
    durationDays,
    now,
}) {
    // Nothing configured => no successful days possible.
    if (!goalsByType || Object.keys(goalsByType).length === 0) {
        return 0;
    }

    const today = now.toISODate();

    // The challenge window is empty before it starts.
    if (startDate && today < startDate) {
        return 0;
    }

    let lastCountedDay = today;

    if (startDate && Number.isInteger(durationDays) && durationDays > 0) {
        const challengeLastDay = DateTime.fromISO(startDate, { zone: 'utc' })
            .plus({ days: durationDays - 1 })
            .toISODate();

        if (challengeLastDay < lastCountedDay) {
            lastCountedDay = challengeLastDay;
        }
    }

    const isSuccessfulDay = (date) => {
        const dayEntries = entriesByDate?.[date] ?? {};

        return Object.entries(goalsByType).every(
            ([exerciseType, goal]) => (dayEntries[exerciseType] ?? 0) >= goal,
        );
    };

    // Today counts only once it is already successful; otherwise fall
    // back to yesterday without breaking the streak. When the challenge
    // is over, lastCountedDay lies strictly before today and must be a
    // completed successful day like any other.
    if (lastCountedDay === today && !isSuccessfulDay(today)) {
        lastCountedDay = DateTime.fromISO(lastCountedDay, { zone: 'utc' })
            .minus({ days: 1 })
            .toISODate();
    }

    let streak = 0;
    let cursor = lastCountedDay;

    while ((!startDate || cursor >= startDate) && isSuccessfulDay(cursor)) {
        streak += 1;
        cursor = DateTime.fromISO(cursor, { zone: 'utc' })
            .minus({ days: 1 })
            .toISODate();
    }

    return streak;
}
