import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { DateTime } from 'luxon';
import { setupGuild } from '../../db/queries.js';

const reminderTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const maxAutocompleteChoices = 25;

function resolveTimezoneInput(input) {
    const zone = DateTime.now().setZone(input);
    if (zone.isValid) {
        return { ok: true, timezone: zone.zoneName };
    }

    const needle = input.split('/').pop().toLowerCase();
    const matches = Intl.supportedValuesOf('timeZone').filter(
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
            .setName('daily_goal')
            .setDescription('Objectif quotidien.')
            .setMinValue(1)
            .setRequired(false),
    )
    .addIntegerOption((option) =>
        option
            .setName('duration_days')
            .setDescription('Durée du challenge en jours.')
            .setMinValue(1)
            .setRequired(false),
    )
    .addStringOption((option) =>
        option
            .setName('timezone')
            .setDescription('Fuseau horaire du serveur.')
            .setAutocomplete(true)
            .setRequired(false),
    )
    .addStringOption((option) =>
        option
            .setName('reminder_time')
            .setDescription('Heure de rappel, format HH:mm.')
            .setRequired(false),
    );

export async function execute(interaction) {
    const channel = interaction.options.getChannel('channel', true);
    const dailyGoal = interaction.options.getInteger('daily_goal') ?? 100;
    const durationDays = interaction.options.getInteger('duration_days') ?? 30;
    const timezone =
        interaction.options.getString('timezone') ?? 'Europe/Paris';
    const reminderTime =
        interaction.options.getString('reminder_time') ?? '20:00';

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

    await setupGuild({
        guildId: interaction.guildId,
        trackedChannelId: channel.id,
        dailyGoal,
        durationDays,
        timezone: normalizedTimezone,
        reminderTime,
    });

    await interaction.reply({
        content: `Challenge configuré dans ${channel}. Objectif: ${dailyGoal}/jour pendant ${durationDays} jours.`,
        flags: MessageFlags.Ephemeral,
    });
}

export async function autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const startsWith = [];
    const contains = [];

    for (const zone of Intl.supportedValuesOf('timeZone')) {
        const lowerZone = zone.toLowerCase();
        if (lowerZone.startsWith(focused)) {
            startsWith.push(zone);
        } else if (lowerZone.includes(focused)) {
            contains.push(zone);
        }
        if (startsWith.length >= maxAutocompleteChoices) {
            break;
        }
    }

    const choices = [...startsWith, ...contains]
        .slice(0, maxAutocompleteChoices)
        .map((zone) => ({ name: zone, value: zone }));

    await interaction.respond(choices);
}
