import { DateTime } from 'luxon';
import { levenshtein } from './levenshtein.js';

export const reminderTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const minFuzzyInputLength = 3;
const maxFuzzyDistance = 4;
export const maxAutocompleteFuzzyDistance = 3;
const directResolutionGap = 2;

export function candidateScore(zone, needle) {
    const lowerZone = zone.toLowerCase();
    return Math.min(
        levenshtein(needle, lowerZone),
        levenshtein(needle, lowerZone.split('/').pop()),
    );
}

function rankZones(input, supportedZones) {
    const needle = input.trim().toLowerCase();
    const scored = supportedZones
        .map((zone) => ({ zone, score: candidateScore(zone, needle) }))
        .sort(
            (first, second) =>
                first.score - second.score ||
                first.zone.localeCompare(second.zone),
        );
    return { needle, scored };
}

export function resolveTimezoneInput(
    input,
    supportedZones = Intl.supportedValuesOf('timeZone'),
) {
    const zone = DateTime.now().setZone(input);
    if (zone.isValid) {
        return { ok: true, timezone: zone.zoneName };
    }

    const needle = input.split('/').pop().toLowerCase();
    const matches = supportedZones.filter(
        (candidate) => candidate.split('/').pop().toLowerCase() === needle,
    );

    if (matches.length === 1) {
        return { ok: true, timezone: matches[0] };
    }
    if (matches.length > 1) {
        return { ok: false, candidates: matches };
    }

    if (input.trim().length < minFuzzyInputLength) {
        return { ok: false, candidates: [], suggestions: [] };
    }

    const { scored } = rankZones(input, supportedZones);
    const [best, second] = scored;
    if (
        best.score <= maxFuzzyDistance &&
        best.score + directResolutionGap <= second.score
    ) {
        return { ok: true, timezone: best.zone };
    }

    const suggestions = scored
        .slice(0, 3)
        .filter((candidate) => candidate.score <= maxFuzzyDistance)
        .map((candidate) => candidate.zone);
    return { ok: false, candidates: [], suggestions };
}
