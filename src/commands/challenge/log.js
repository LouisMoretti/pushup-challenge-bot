import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { addExercise, EXERCISE_TYPES, setExercise } from '../../db/queries.js';

const exerciseChoices = Object.values(EXERCISE_TYPES).map((exerciseType) => ({
    name: exerciseType,
    value: exerciseType,
}));

function addExerciseOption(command) {
    return command.addStringOption((option) =>
        option
            .setName('exercise')
            .setDescription('Type d’exercice.')
            .setRequired(true)
            .addChoices(...exerciseChoices),
    );
}

export const data = new SlashCommandBuilder()
    .setName('log')
    .setDescription('Enregistre tes exercices du jour.')
    .addSubcommand((subcommand) =>
        addExerciseOption(
            subcommand
                .setName('add')
                .setDescription('Ajoute au total du jour.'),
        ).addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('Nombre à ajouter.')
                .setMinValue(1)
                .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
        addExerciseOption(
            subcommand
                .setName('set')
                .setDescription('Définit le total du jour.'),
        ).addIntegerOption((option) =>
            option
                .setName('count')
                .setDescription('Total du jour.')
                .setMinValue(0)
                .setRequired(true),
        ),
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const exerciseType = interaction.options.getString('exercise', true);
    const value =
        interaction.options.getInteger('amount') ??
        interaction.options.getInteger('count');

    let result;

    if (subcommand === 'add') {
        result = await addExercise(
            interaction.guildId,
            interaction.user.id,
            exerciseType,
            value,
        );
    } else {
        result = await setExercise(
            interaction.guildId,
            interaction.user.id,
            exerciseType,
            value,
        );
    }

    if (!result.ok) {
        const message =
            result.reason === 'guild_not_configured'
                ? 'Le serveur n’est pas configuré. Demande à un admin de lancer `/setup`.'
                : 'Tu dois faire `/join` avant de log tes exercices.';

        await interaction.reply({
            content: message,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const congrats = result.reachedGoal
        ? ` Objectif de ${result.goal} ${exerciseType} atteint, bravo !`
        : '';

    await interaction.reply({
        content: `${interaction.user} est à ${result.afterCount} ${exerciseType} aujourd’hui.${congrats}`,
    });
}
