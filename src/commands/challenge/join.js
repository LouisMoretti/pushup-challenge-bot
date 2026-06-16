import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { joinChallenge } from '../../db/queries.js';

export const data = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Rejoins le challenge.');

export async function execute(interaction) {
    const result = await joinChallenge(
        interaction.guildId,
        interaction.user.id,
    );

    if (!result.ok) {
        await interaction.reply({
            content:
                'Le serveur n’est pas configuré. Demande à un admin de lancer `/setup`.',
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.reply({
        content: `${interaction.user} rejoint le challenge.`,
    });
}
