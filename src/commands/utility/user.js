import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('user')
	.setDescription('Provides information about the user.');

export async function execute(interaction) {
	// interaction.user est l'objet User qui a lancé la commande
	// interaction.member est le GuildMember (l'utilisateur dans ce serveur précis)
	await interaction.reply(
		`This command was run by \`\`${interaction.user.username}\`\`, who joined on \`\`${interaction.member.joinedAt}\`\`.`,
	);
}
