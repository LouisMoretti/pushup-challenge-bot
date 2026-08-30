import {
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import {
    adminAddExercise,
    adminRemoveExercise,
    adminSetExercise,
} from '../../db/queries.js';
import { exerciseChoices } from '../../utils/exercises.js';

function addUserExerciseAmountOptions(command, amountName) {
    return command
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Participant à modifier.')
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName('exercise')
                .setDescription('Type d’exercice.')
                .setRequired(true)
                .addChoices(...exerciseChoices),
        )
        .addIntegerOption((option) =>
            option
                .setName(amountName)
                .setDescription('Nombre.')
                .setMinValue(0)
                .setRequired(true),
        );
}

export const data = new SlashCommandBuilder()
    .setName('admin-log')
    .setDescription('Corrige les logs des participants.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
        addUserExerciseAmountOptions(
            subcommand
                .setName('add')
                .setDescription('Ajoute des répétitions à un participant.'),
            'amount',
        ),
    )
    .addSubcommand((subcommand) =>
        addUserExerciseAmountOptions(
            subcommand
                .setName('remove')
                .setDescription('Retire des répétitions à un participant.'),
            'amount',
        ),
    )
    .addSubcommand((subcommand) =>
        addUserExerciseAmountOptions(
            subcommand
                .setName('set')
                .setDescription('Définit le total du jour.'),
            'count',
        ),
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user', true);
    const exerciseType = interaction.options.getString('exercise', true);
    const value =
        interaction.options.getInteger('amount') ??
        interaction.options.getInteger('count');
    let result;

    if (subcommand === 'add') {
        result = await adminAddExercise(
            interaction.guildId,
            interaction.user.id,
            user.id,
            exerciseType,
            value,
        );
    } else if (subcommand === 'remove') {
        result = await adminRemoveExercise(
            interaction.guildId,
            interaction.user.id,
            user.id,
            exerciseType,
            value,
        );
    } else {
        result = await adminSetExercise(
            interaction.guildId,
            interaction.user.id,
            user.id,
            exerciseType,
            value,
        );
    }

    if (!result.ok) {
        const message =
            result.reason === 'guild_not_configured'
                ? 'Le serveur n’est pas configuré. Lance `/setup` d’abord.'
                : 'Ce participant n’est pas inscrit au challenge.';

        await interaction.reply({
            content: message,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.reply({
        content: `${user} est maintenant à ${result.afterCount} ${exerciseType} aujourd’hui.`,
        flags: MessageFlags.Ephemeral,
    });
}
