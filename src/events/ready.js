import { Events } from 'discord.js';
import { startScheduler } from '../scheduler.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
    startScheduler(client);
    console.log(`Ready! Logged in as ${client.user.tag}`);
}
