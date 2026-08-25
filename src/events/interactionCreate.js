import { Collection, Events, MessageFlags } from 'discord.js';

export const name = Events.InteractionCreate;

export async function execute(interaction) {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(
            interaction.commandName,
        );

        if (!command) {
            console.error(
                `No command matching ${interaction.commandName} was found.`,
            );
            return;
        }

        // --- Cooldowns
        const { cooldowns } = interaction.client;

        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Collection());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const defaultCooldownDuration = 3;
        const cooldownAmount =
            (command.cooldown ?? defaultCooldownDuration) * 1_000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime =
                timestamps.get(interaction.user.id) + cooldownAmount;

            if (now < expirationTime) {
                const expiredTimestamp = Math.round(expirationTime / 1_000);
                return interaction.reply({
                    content: `Patiente un peu, \`${command.data.name}\` est en cooldown. Réutilisable <t:${expiredTimestamp}:R>.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(
            () => timestamps.delete(interaction.user.id),
            cooldownAmount,
        );

        // --- Execute ---
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content:
                        'Une erreur est survenue pendant l’exécution de cette commande !',
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content:
                        'Une erreur est survenue pendant l’exécution de cette commande !',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    } else if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(
            interaction.commandName,
        );

        if (!command) {
            console.error(
                `No command matching ${interaction.commandName} was found.`,
            );
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
    }
}
