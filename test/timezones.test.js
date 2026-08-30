import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    reminderTimePattern,
    resolveTimezoneInput,
} from '../src/utils/timezones.js';

describe('resolveTimezoneInput', () => {
    describe('city name -> IANA resolution', () => {
        it('resolves a city name to its IANA zone', () => {
            assert.deepEqual(resolveTimezoneInput('Paris'), {
                ok: true,
                timezone: 'Europe/Paris',
            });
            assert.deepEqual(resolveTimezoneInput('Tokyo'), {
                ok: true,
                timezone: 'Asia/Tokyo',
            });
        });

        it('is case-insensitive on the city name', () => {
            assert.equal(
                resolveTimezoneInput('PARIS').timezone,
                'Europe/Paris',
            );
            assert.equal(resolveTimezoneInput('tOkYo').ok, true);
        });

        it('matches only on the last path segment of candidate zones', () => {
            // 'Foo/New_York' is not a valid zone but its tail 'new_york'
            // uniquely matches America/New_York (case-insensitive)
            const result = resolveTimezoneInput('Foo/New_York');
            assert.deepEqual(result, {
                ok: true,
                timezone: 'America/New_York',
            });
        });
    });

    describe('full IANA passthrough', () => {
        it('accepts a complete IANA name as-is', () => {
            assert.deepEqual(resolveTimezoneInput('America/New_York'), {
                ok: true,
                timezone: 'America/New_York',
            });
            assert.deepEqual(resolveTimezoneInput('Europe/Paris'), {
                ok: true,
                timezone: 'Europe/Paris',
            });
        });

        it('accepts UTC and fixed offsets without lookup', () => {
            assert.deepEqual(resolveTimezoneInput('UTC'), {
                ok: true,
                timezone: 'UTC',
            });
            assert.deepEqual(resolveTimezoneInput('+05:00'), {
                ok: true,
                timezone: '+05:00',
            });
        });

        it('normalizes a bare city that is itself an alias zone', () => {
            // 'Singapore' resolves directly (alias) instead of Asia/Singapore
            assert.equal(resolveTimezoneInput('Singapore').ok, true);
        });

        it('keeps lowercase-with-slash input verbatim (passthrough)', () => {
            // Luxon accepts it; zoneName echoes the given casing
            assert.deepEqual(resolveTimezoneInput('europe/paris'), {
                ok: true,
                timezone: 'europe/paris',
            });
        });

        it('resolves through an unknown directory prefix via tail match', () => {
            // 'Foo/Paris' is not a valid zone but 'paris' matches Europe/Paris
            assert.deepEqual(resolveTimezoneInput('Foo/Paris'), {
                ok: true,
                timezone: 'Europe/Paris',
            });
        });
    });

    describe('unknown zone', () => {
        it('rejects an unknown city with no candidates', () => {
            assert.deepEqual(resolveTimezoneInput('Atlantis/City'), {
                ok: false,
                candidates: [],
                suggestions: [],
            });
            assert.deepEqual(resolveTimezoneInput('Nowhereville'), {
                ok: false,
                candidates: [],
                suggestions: [],
            });
        });

        it('rejects empty and malformed inputs', () => {
            assert.deepEqual(resolveTimezoneInput(''), {
                ok: false,
                candidates: [],
                suggestions: [],
            });
            // Below the fuzzy threshold: no silent resolution, no suggestions.
            assert.deepEqual(resolveTimezoneInput('Pa'), {
                ok: false,
                candidates: [],
                suggestions: [],
            });
        });

        it('suggests near matches for a typo instead of resolving silently', () => {
            // #22: a fuzzy input close to one zone returns it as a suggestion,
            // never a silent resolution.
            const result = resolveTimezoneInput('Paris/Foo');
            assert.equal(result.ok, false);
            assert.deepEqual(result.candidates, []);
            assert.ok(result.suggestions.includes('Europe/Paris'));
        });
    });

    describe('ambiguity branch', () => {
        it('returns every matching candidate when several zones share a tail', () => {
            const synthetic = [
                'America/Springfield',
                'US/Springfield',
                'Europe/Paris',
            ];
            assert.deepEqual(resolveTimezoneInput('Springfield', synthetic), {
                ok: false,
                candidates: ['America/Springfield', 'US/Springfield'],
            });
        });

        it('returns the unique candidate when only one zone matches', () => {
            const synthetic = ['Europe/Paris', 'Asia/Tokyo'];
            assert.deepEqual(resolveTimezoneInput('tokyo', synthetic), {
                ok: true,
                timezone: 'Asia/Tokyo',
            });
        });

        it('falls back to tail search when the direct input is invalid', () => {
            const synthetic = ['Europe/Paris', 'Europe/London'];
            // 'london' alone is not resolvable by Luxon but has one tail match
            assert.deepEqual(resolveTimezoneInput('London', synthetic), {
                ok: true,
                timezone: 'Europe/London',
            });
        });

        it('defaults to the full Intl supported list', () => {
            const result = resolveTimezoneInput('Paris');
            assert.deepEqual(result, { ok: true, timezone: 'Europe/Paris' });
        });
    });
});

describe('reminderTimePattern', () => {
    it('accepts valid HH:mm values across bounds', () => {
        const valid = [
            '00:00',
            '00:59',
            '09:05',
            '10:00',
            '19:59',
            '20:00',
            '23:59',
        ];
        for (const time of valid) {
            assert.equal(reminderTimePattern.test(time), true, time);
        }
    });

    it('rejects 24:00 and out-of-range hours', () => {
        const invalid = ['24:00', '24:01', '25:30', '99:99'];
        for (const time of invalid) {
            assert.equal(reminderTimePattern.test(time), false, time);
        }
    });

    it('rejects single-digit hours like 7:30', () => {
        assert.equal(reminderTimePattern.test('7:30'), false);
        assert.equal(reminderTimePattern.test('7:00'), false);
    });

    it('rejects malformed minutes', () => {
        const invalid = ['20:5', '20:', ':30', '20:60', '20:00x', '', '2000'];
        for (const time of invalid) {
            assert.equal(reminderTimePattern.test(time), false, time);
        }
    });

    it('rejects separators other than colon', () => {
        assert.equal(reminderTimePattern.test('20.00'), false);
        assert.equal(reminderTimePattern.test('20 00'), false);
        assert.equal(reminderTimePattern.test('20h00'), false);
    });
});
