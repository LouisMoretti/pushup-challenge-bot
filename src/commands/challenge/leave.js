import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { leaveChallenge } from '../../db/queries.js';

export const data = new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Quitte le challenge.');

export async function execute(interaction) {
    const result = await leaveChallenge(
        interaction.guildId,
        interaction.user.id,
    );

    if (!result.ok) {
        await interaction.reply({
            content: 'Tu n’es pas inscrit au challenge.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.reply({
        content: `${interaction.user} quitte le challenge. Ton historique reste conservé.`,
        flags: MessageFlags.Ephemeral,
    });
}
