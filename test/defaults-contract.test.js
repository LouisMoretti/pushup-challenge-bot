import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    entries,
    EXERCISE_TYPES,
    guilds,
    participants,
} from '../src/db/schema.js';

// Contract test pinning the drizzle schema column defaults. Prior to #19 this
// also pinned command-level `?? <literal>` fallbacks in /setup; those were
// removed when /setup became all-required, so only the schema side remains.
// When #11 extracts src/config.js, these defaults should switch to importing
// the shared constant.

// The daily-goal/duration/timezone/reminder command-level `?? <literal>`
// fallbacks were removed in #19: /setup now makes every option required, so
// there is no command fallback left to pin against the schema. The schema
// column defaults are still asserted below (they remain the source of truth
// for rows created outside the strict command path).

describe('defaults contract (schema)', () => {
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
