import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { DateTime } from 'luxon';
import {
    EXERCISE_TYPES,
    getGuild,
    getGuildGoals,
    isGuildConfigured,
    resetGuildConfig,
    setGuildGoal,
    updateGuildSettings,
} from '../../db/queries.js';
import { reminderTimePattern, resolveTimezoneInput } from './setup.js';

const exerciseChoices = Object.values(EXERCISE_TYPES).map((exerciseType) => ({
    name: exerciseType,
    value: exerciseType,
}));

const notConfiguredMessage =
    'Le serveur n’est pas configuré. Lance `/setup` d’abord.';

function ephemeral(content) {
    return { content, flags: MessageFlags.Ephemeral };
}

export const data = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Consulte ou ajuste la configuration du challenge.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        subcommand
            .setName('view')
            .setDescription('Affiche la configuration actuelle.'),
    )
    .addSubcommandGroup((group) =>
        group
            .setName('set')
            .setDescription('Modifie un réglage du challenge.')
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('channel')
                    .setDescription('Change le salon des récaps.')
                    .addChannelOption((option) =>
                        option
                            .setName('channel')
                            .setDescription('Nouveau salon.')
                            .addChannelTypes(ChannelType.GuildText)
                            .setRequired(true),
                    ),
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('duration_days')
                    .setDescription('Change la durée du challenge.')
                    .addIntegerOption((option) =>
                        option
                            .setName('days')
                            .setDescription('Durée en jours.')
                            .setMinValue(1)
                            .setRequired(true),
                    ),
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('timezone')
                    .setDescription('Change le fuseau horaire.')
                    .addStringOption((option) =>
                        option
                            .setName('timezone')
                            .setDescription('Fuseau horaire (nom IANA).')
                            .setAutocomplete(true)
                            .setRequired(true),
                    ),
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('reminder_time')
                    .setDescription('Change l’heure du rappel quotidien.')
                    .addStringOption((option) =>
                        option
                            .setName('time')
                            .setDescription('Heure au format HH:mm.')
                            .setRequired(true),
                    ),
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('goal')
                    .setDescription('Change l’objectif d’un type d’exercice.')
                    .addStringOption((option) =>
                        option
                            .setName('exercise')
                            .setDescription('Type d’exercice.')
                            .setRequired(true)
                            .addChoices(...exerciseChoices),
                    )
                    .addIntegerOption((option) =>
                        option
                            .setName('value')
                            .setDescription('Objectif quotidien.')
                            .setMinValue(1)
                            .setRequired(true),
                    ),
            ),
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName('delete')
            .setDescription(
                'Supprime la configuration. L’historique des participants est conservé.',
            ),
    );

async function handleView(interaction) {
    const guild = await getGuild(interaction.guildId);

    if (!isGuildConfigured(guild)) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    const goals = await getGuildGoals(interaction.guildId);

    const today = DateTime.now().setZone(guild.timezone).toISODate();
    const endDate = DateTime.fromISO(guild.startDate, {
        zone: guild.timezone,
    })
        .plus({ days: guild.durationDays - 1 })
        .toISODate();
    const status = today > endDate ? 'TERMINÉ' : 'ACTIF';

    await interaction.reply({
        content: [
            'Configuration du challenge :',
            `Salon : <#${guild.trackedChannelId}>`,
            `Durée : ${guild.durationDays} jours (début ${guild.startDate}, fin ${endDate})`,
            `Fuseau horaire : \`${guild.timezone}\``,
            `Rappel quotidien : ${guild.reminderTime}`,
            `Statut : ${status}`,
            'Objectifs quotidiens :',
            ...goals.map(
                (goal) => `- ${goal.exerciseType} : ${goal.dailyGoal}`,
            ),
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
    });
}

async function handleSetChannel(interaction) {
    const channel = interaction.options.getChannel('channel', true);
    const result = await updateGuildSettings(interaction.guildId, {
        trackedChannelId: channel.id,
    });

    if (!result.ok) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    await interaction.reply(
        ephemeral(`Salon des récaps mis à jour : ${channel}.`),
    );
}

async function handleSetDurationDays(interaction) {
    const days = interaction.options.getInteger('days', true);
    const result = await updateGuildSettings(interaction.guildId, {
        durationDays: days,
    });

    if (!result.ok) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    await interaction.reply(
        ephemeral(`Durée du challenge mise à jour : ${days} jours.`),
    );
}

async function handleSetTimezone(interaction) {
    const timezone = interaction.options.getString('timezone', true);
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
            await interaction.reply(
                ephemeral(
                    `Fuseau horaire invalide : \`${timezone}\`. Utilise un nom IANA comme \`Europe/Paris\`.`,
                ),
            );
        }
        return;
    }

    const result = await updateGuildSettings(interaction.guildId, {
        timezone: resolved.timezone,
    });

    if (!result.ok) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    await interaction.reply(
        ephemeral(`Fuseau horaire mis à jour : \`${resolved.timezone}\`.`),
    );
}

async function handleSetReminderTime(interaction) {
    const time = interaction.options.getString('time', true);

    if (!reminderTimePattern.test(time)) {
        await interaction.reply(
            ephemeral(
                `Heure de rappel invalide : \`${time}\`. Format attendu : \`HH:mm\`.`,
            ),
        );
        return;
    }

    const result = await updateGuildSettings(interaction.guildId, {
        reminderTime: time,
    });

    if (!result.ok) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    await interaction.reply(
        ephemeral(`Heure de rappel mise à jour : ${time}.`),
    );
}

async function handleSetGoal(interaction) {
    const exerciseType = interaction.options.getString('exercise', true);
    const value = interaction.options.getInteger('value', true);
    const result = await setGuildGoal(interaction.guildId, exerciseType, value);

    if (!result.ok) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    await interaction.reply(
        ephemeral(`Objectif ${exerciseType} mis à jour : ${value} par jour.`),
    );
}

async function handleSet(interaction) {
    const setting = interaction.options.getSubcommand();

    if (setting === 'channel') {
        await handleSetChannel(interaction);
    } else if (setting === 'duration_days') {
        await handleSetDurationDays(interaction);
    } else if (setting === 'timezone') {
        await handleSetTimezone(interaction);
    } else if (setting === 'reminder_time') {
        await handleSetReminderTime(interaction);
    } else {
        await handleSetGoal(interaction);
    }
}

async function handleDelete(interaction) {
    const result = await resetGuildConfig(interaction.guildId);

    if (!result.ok) {
        await interaction.reply(ephemeral(notConfiguredMessage));
        return;
    }

    await interaction.reply(
        ephemeral(
            'Configuration supprimée. Tu peux recréer un challenge avec `/setup`. L’historique des participants est conservé.',
        ),
    );
}

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (interaction.options.getSubcommandGroup() === 'set') {
        await handleSet(interaction);
        return;
    }

    if (subcommand === 'view') {
        await handleView(interaction);
        return;
    }

    await handleDelete(interaction);
}

export { autocomplete } from './setup.js';
