import { DateTime } from 'luxon';

export const reminderTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    return { ok: false, candidates: [] };
}
