import { MessageFlags } from 'discord.js';
import { DateTime } from 'luxon';
import {
    candidateScore,
    maxAutocompleteFuzzyDistance,
    minFuzzyInputLength,
} from '../../utils/timezones.js';

const maxAutocompleteChoices = 10;

export async function autocompleteTimezone(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const startsWith = [];
    const contains = [];
    const fuzzy = [];

    for (const zone of Intl.supportedValuesOf('timeZone')) {
        const lowerZone = zone.toLowerCase();
        if (lowerZone.startsWith(focused)) {
            startsWith.push(zone);
        } else if (lowerZone.includes(focused)) {
            contains.push(zone);
        } else if (focused.trim().length >= minFuzzyInputLength) {
            const score = candidateScore(zone, focused);
            if (score <= maxAutocompleteFuzzyDistance) {
                fuzzy.push({ zone, score });
            }
        }
        if (startsWith.length >= maxAutocompleteChoices) {
            break;
        }
    }

    fuzzy.sort(
        (first, second) =>
            first.score - second.score || first.zone.localeCompare(second.zone),
    );

    const now = DateTime.now();
    const choices = [...startsWith, ...contains]
        .concat(
            fuzzy
                .slice(
                    0,
                    Math.max(
                        0,
                        maxAutocompleteChoices -
                            startsWith.length -
                            contains.length,
                    ),
                )
                .map((entry) => entry.zone),
        )
        .slice(0, maxAutocompleteChoices)
        .map((zone) => ({
            name: `${zone} (${now.setZone(zone).toFormat('\u0027UTC\u0027ZZ')})`,
            value: zone,
        }));

    await interaction.respond(choices);
}

export async function replyInvalidTimezone(interaction, input, resolved) {
    if (resolved.candidates.length > 0) {
        await interaction.reply({
            content: [
                'Plusieurs fuseaux horaires correspondent à ' +
                    `\`${input}\`. Précise ton choix :`,
                ...resolved.candidates.map((candidate) => `- \`${candidate}\``),
            ].join('\n'),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (resolved.suggestions?.length > 0) {
        await interaction.reply({
            content: [
                `Je ne connais pas \`${input}\`. Voulais-tu dire… ?`,
                ...resolved.suggestions.map(
                    (candidate) => `- \`${candidate}\``,
                ),
            ].join('\n'),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.reply({
        content: `Fuseau horaire invalide : \`${input}\`. Utilise un nom IANA comme \`Europe/Paris\`.`,
        flags: MessageFlags.Ephemeral,
    });
}
