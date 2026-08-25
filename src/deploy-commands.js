import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.APP_ID;
// Optional: set GUILD_ID to register instantly in one guild (dev) instead of
// globally, which can take up to an hour to propagate.
const guildId = process.env.GUILD_ID;

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = await import(pathToFileURL(filePath).href);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(
                `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
            );
        }
    }
}

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
