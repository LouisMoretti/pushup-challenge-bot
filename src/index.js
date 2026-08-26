import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    Client,
    Collection,
    GatewayIntentBits,
    // MessageFlags,
} from 'discord.js';

import { loadCommands } from './loaders/commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- Commands ---
client.commands = new Collection();
client.cooldowns = new Collection();

const commands = await loadCommands();
for (const command of commands) {
    client.commands.set(command.data.name, command);
}

// --- Events ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = await import(pathToFileURL(filePath).href);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// --- Connect ---
client.login(process.env.DISCORD_TOKEN);
