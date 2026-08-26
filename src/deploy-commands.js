import { REST, Routes } from 'discord.js';

import { loadCommands } from './loaders/commands.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.APP_ID;
// Optional: set GUILD_ID to register instantly in one guild (dev) instead of
// globally, which can take up to an hour to propagate.
const guildId = process.env.GUILD_ID;

const commandModules = await loadCommands();
const commands = commandModules.map((command) => command.data.toJSON());

const rest = new REST().setToken(token);

try {
    const route = guildId
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId);

    console.log(
        `Started refreshing ${commands.length} application (/) commands${
            guildId ? ` in guild ${guildId}` : ' globally'
        }.`,
    );
    const data = await rest.put(route, { body: commands });
    console.log(
        `Successfully reloaded ${data.length} application (/) commands.`,
    );
} catch (error) {
    console.error(error);
}
