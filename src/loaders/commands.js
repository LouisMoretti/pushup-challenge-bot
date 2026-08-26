import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function loadCommands() {
    const loadersDir = path.dirname(fileURLToPath(import.meta.url));
    const srcDir = path.dirname(loadersDir);
    const foldersPath = path.join(srcDir, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    const commands = [];

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs
            .readdirSync(commandsPath)
            .filter((file) => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = await import(pathToFileURL(filePath).href);
            if ('data' in command && 'execute' in command) {
                commands.push(command);
            } else {
                console.log(
                    `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
                );
            }
        }
    }

    return commands;
}
