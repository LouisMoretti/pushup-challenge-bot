import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import { setupGuild } from '../../db/queries.js';

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

    await setupGuild({
        guildId: interaction.guildId,
        trackedChannelId: channel.id,
        dailyGoal,
        durationDays,
        timezone,
        reminderTime,
    });

    await interaction.reply({
        content: `Challenge configuré dans ${channel}. Objectif: ${dailyGoal}/jour pendant ${durationDays} jours.`,
        flags: MessageFlags.Ephemeral,
    });
}
