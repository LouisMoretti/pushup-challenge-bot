import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { DateTime } from 'luxon';
import { getGuild, isGuildConfigured, setupGuild } from '../../db/queries.js';
import {
    candidateScore,
    maxAutocompleteFuzzyDistance,
    minFuzzyInputLength,
    reminderTimePattern,
    resolveTimezoneInput,
} from '../../utils/timezones.js';

const maxAutocompleteChoices = 10;

export const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure le challenge pour ce serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
        option
            .setName('channel')
            .setDescription('Salon où poster les récaps.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
    )
    .addIntegerOption((option) =>
        option
            .setName('duration_days')
            .setDescription('Durée du challenge en jours.')
            .setMinValue(1)
            .setRequired(true),
    )
    .addStringOption((option) =>
        option
            .setName('timezone')
            .setDescription('Fuseau horaire du serveur.')
            .setAutocomplete(true)
            .setRequired(true),
    )
    .addStringOption((option) =>
        option
            .setName('reminder_time')
            .setDescription('Heure de rappel, format HH:mm.')
            .setRequired(true),
    )
    .addIntegerOption((option) =>
        option
            .setName('goal_pushup')
            .setDescription('Objectif quotidien de pompes.')
            .setMinValue(1)
            .setRequired(true),
    )
    .addIntegerOption((option) =>
        option
            .setName('goal_squat')
            .setDescription('Objectif quotidien de squats.')
            .setMinValue(1)
            .setRequired(true),
    )
    .addIntegerOption((option) =>
        option
            .setName('goal_crunch')
            .setDescription('Objectif quotidien de crunchs.')
            .setMinValue(1)
            .setRequired(true),
    )
    .addIntegerOption((option) =>
        option
            .setName('goal_running')
            .setDescription('Objectif quotidien de course.')
            .setMinValue(1)
            .setRequired(true),
    );

export async function execute(interaction) {
    const channel = interaction.options.getChannel('channel', true);
    const durationDays = interaction.options.getInteger('duration_days', true);
    const timezone = interaction.options.getString('timezone', true);
    const reminderTime = interaction.options.getString('reminder_time', true);
    const goals = {
        PUSHUP: interaction.options.getInteger('goal_pushup', true),
        SQUAT: interaction.options.getInteger('goal_squat', true),
        CRUNCH: interaction.options.getInteger('goal_crunch', true),
        RUNNING: interaction.options.getInteger('goal_running', true),
    };

    const resolved = resolveTimezoneInput(timezone);
    if (!resolved.ok) {
        if (resolved.candidates.length > 0) {
            await interaction.reply({
                content: [
                    'Plusieurs fuseaux horaires correspondent à ' +
                        `\`${timezone}\`. Précise ton choix :`,
                    ...resolved.candidates.map(
                        (candidate) => `- \`${candidate}\``,
                    ),
                ].join('\n'),
                flags: MessageFlags.Ephemeral,
            });
        } else if (resolved.suggestions?.length > 0) {
            await interaction.reply({
                content: [
                    `Je ne connais pas \`${timezone}\`. Voulais-tu dire… ?`,
                    ...resolved.suggestions.map(
                        (candidate) => `- \`${candidate}\``,
                    ),
                ].join('\n'),
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: `Fuseau horaire invalide : \`${timezone}\`. Utilise un nom IANA comme \`Europe/Paris\`.`,
                flags: MessageFlags.Ephemeral,
            });
        }
        return;
    }
    const normalizedTimezone = resolved.timezone;

    if (!reminderTimePattern.test(reminderTime)) {
        await interaction.reply({
            content: `Heure de rappel invalide : \`${reminderTime}\`. Format attendu : \`HH:mm\`.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const existingGuild = await getGuild(interaction.guildId);

    if (isGuildConfigured(existingGuild)) {
        await interaction.reply({
            content:
                'Un challenge existe déjà sur ce serveur. Supprime-le avec `/config delete` avant d’en recréer un.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await setupGuild({
        guildId: interaction.guildId,
        trackedChannelId: channel.id,
        durationDays,
        timezone: normalizedTimezone,
        reminderTime,
        goals,
    });

    await interaction.reply({
        content: [
            `Challenge configuré dans ${channel} pendant ${durationDays} jours.`,
            `Fuseau horaire : \`${normalizedTimezone}\`. Rappel quotidien à ${reminderTime}.`,
            `Objectifs — POMPES : ${goals.PUSHUP}, SQUATS : ${goals.SQUAT}, ` +
                `CRUNCH : ${goals.CRUNCH}, COURSE : ${goals.RUNNING}.`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
    });
}

export async function autocomplete(interaction) {
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
