import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { EXERCISE_TYPES, getLeaderboard } from '../../db/queries.js';

const exerciseChoices = Object.values(EXERCISE_TYPES).map((exerciseType) => ({
    name: exerciseType,
    value: exerciseType,
}));

export const data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Affiche le classement du challenge.')
    .addStringOption((option) =>
        option
            .setName('exercise')
            .setDescription('Type d’exercice.')
            .setRequired(true)
            .addChoices(...exerciseChoices),
    );

export async function execute(interaction) {
    const exerciseType = interaction.options.getString('exercise', true);
    const result = await getLeaderboard(interaction.guildId, exerciseType);

    if (!result.ok) {
        await interaction.reply({
            content: 'Type d’exercice invalide.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (result.rows.length === 0) {
        await interaction.reply({
            content: 'Personne n’est encore inscrit au challenge.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const lines = result.rows
        .map((row, index) => `${index + 1}. <@${row.userId}> — ${row.total}`)
        .join('\n');

    await interaction.reply({
        content: `Classement ${exerciseType}\n${lines}`,
    });
}
