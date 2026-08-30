import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    entries,
    EXERCISE_TYPES,
    guilds,
    participants,
} from '../src/db/schema.js';

// Command fallbacks live as `?? <literal>` in setup's execute(); the schema
// column defaults live on the drizzle table columns. This contract pins them
// together so one cannot drift from the other. When #11 extracts src/config.js,
// both sides of each assertion should switch to importing the shared constant.

const setupSource = readFileSync(
    new URL('../src/commands/admin/setup.js', import.meta.url),
    'utf8',
);

function fallbackLiteral(optionName) {
    const pattern = new RegExp(
        String.raw`getString\('${optionName}'\) \?\? '([^']+)';`,
    );
    const match = setupSource.match(pattern);
    assert.ok(match, `no ?? fallback found for option ${optionName}`);
    return match[1];
}

function fallbackInteger(optionName) {
    const pattern = new RegExp(
        String.raw`getInteger\('${optionName}'\) \?\? (\d+);`,
    );
    const match = setupSource.match(pattern);
    assert.ok(match, `no ?? fallback found for option ${optionName}`);
    return Number(match[1]);
}

describe('defaults contract (commands <-> schema)', () => {
    it('daily_goal fallback equals guilds.dailyGoal default', () => {
        assert.equal(fallbackInteger('daily_goal'), 100);
        assert.equal(guilds.dailyGoal.default, 100);
        assert.equal(fallbackInteger('daily_goal'), guilds.dailyGoal.default);
    });

    it('duration_days fallback equals guilds.durationDays default', () => {
        assert.equal(fallbackInteger('duration_days'), 30);
        assert.equal(guilds.durationDays.default, 30);
        assert.equal(
            fallbackInteger('duration_days'),
            guilds.durationDays.default,
        );
    });

    it('timezone fallback equals guilds.timezone default', () => {
        assert.equal(fallbackLiteral('timezone'), 'Europe/Paris');
        assert.equal(guilds.timezone.default, 'Europe/Paris');
        assert.equal(fallbackLiteral('timezone'), guilds.timezone.default);
    });

    it('reminder_time fallback equals guilds.reminderTime default', () => {
        assert.equal(fallbackLiteral('reminder_time'), '20:00');
        assert.equal(guilds.reminderTime.default, '20:00');
        assert.equal(
            fallbackLiteral('reminder_time'),
            guilds.reminderTime.default,
        );
    });

    it('exercise type default matches EXERCISE_TYPES.PUSHUP', () => {
        assert.equal(entries.exerciseType.hasDefault, true);
        assert.equal(entries.exerciseType.default, EXERCISE_TYPES.PUSHUP);
    });

    it('participants.active defaults to true', () => {
        assert.equal(participants.active.hasDefault, true);
        assert.equal(participants.active.default, true);
    });

    it('entries.count defaults to 0', () => {
        assert.equal(entries.count.hasDefault, true);
        assert.equal(entries.count.default, 0);
    });

    it('every command fallback is a value the matching column accepts', () => {
        // reminder_time must satisfy the HH:mm pattern used at validation time
        const reminderPattern = /^([01]\d|2[0-3]):[0-5]\d$/;
        assert.match(guilds.reminderTime.default, reminderPattern);

        // timezone fallback must be a resolvable IANA zone
        assert.equal(
            Intl.supportedValuesOf('timeZone').includes('Europe/Paris'),
            true,
        );
    });
});
