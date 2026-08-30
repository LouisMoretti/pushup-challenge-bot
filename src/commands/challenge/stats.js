import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
    EXERCISE_TYPES,
    getGlobalStats,
    getUserAllStats,
    getUserStats,
    getUserStreak,
} from '../../db/queries.js';
import { exerciseChoices } from '../../utils/exercises.js';

function addExerciseOption(command, { required = true } = {}) {
    return command.addStringOption((option) =>
        option
            .setName('exercise')
            .setDescription('Type d’exercice.')
            .setRequired(required)
            .addChoices(...exerciseChoices),
    );
}

function formatStreakLine(streak) {
    return `Série : ${streak} ${streak === 1 ? 'jour' : 'jours'}`;
}

async function getStreakLineOrEmpty(guildId, userId) {
    const streakResult = await getUserStreak(guildId, userId);

    if (!streakResult.ok) {
        return null;
    }

    return formatStreakLine(streakResult.streak);
}

export const data = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Affiche les stats du challenge.')
    .addSubcommand((subcommand) =>
        addExerciseOption(
            subcommand
                .setName('global')
                .setDescription('Stats globales du serveur.'),
        ),
    )
    .addSubcommand((subcommand) =>
        addExerciseOption(
            subcommand
                .setName('user')
                .setDescription('Stats d’un participant.'),
            { required: false },
        ).addUserOption((option) =>
            option
                .setName('user')
                .setDescription('Participant à afficher.')
                .setRequired(false),
        ),
    );

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const exerciseType = interaction.options.getString('exercise');

    if (subcommand === 'global') {
        const result = await getGlobalStats(interaction.guildId, exerciseType);

        if (!result.ok) {
            await interaction.reply({
                content: 'Type d’exercice invalide.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.reply({
            content: [
                `Stats globales ${exerciseType}`,
                `Total: ${result.stats.total}`,
                `Jours loggés: ${result.stats.loggedDays}`,
                `Meilleur jour: ${result.stats.bestDay}`,
                `Participants actifs: ${result.stats.activeParticipants}`,
            ].join('\n'),
        });
        return;
    }

    const user = interaction.options.getUser('user') ?? interaction.user;

    if (!exerciseType) {
        const result = await getUserAllStats(interaction.guildId, user.id);

        if (!result.ok) {
            await interaction.reply({
                content: `${user} n’est pas inscrit au challenge.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const statsByType = new Map(
            result.rows.map((row) => [row.exerciseType, row]),
        );
        let grandTotal = 0;

        const lines = Object.values(EXERCISE_TYPES).map((type) => {
            const { total, loggedDays, bestDay } = statsByType.get(type) ?? {
                total: 0,
                loggedDays: 0,
                bestDay: 0,
            };
            grandTotal += total;

            return [
                `${type} : total ${total}`,
                `${loggedDays} jours`,
                `meilleur ${bestDay}`,
            ].join(' — ');
        });
        lines.push(`TOTAL : ${grandTotal}`);

        const streakLine = await getStreakLineOrEmpty(
            interaction.guildId,
            user.id,
        );

        if (streakLine) {
            lines.push(streakLine);
        }

        await interaction.reply({
            content: [`Stats de ${user}`, ...lines].join('\n'),
        });
        return;
    }

    const result = await getUserStats(
        interaction.guildId,
        user.id,
        exerciseType,
    );

    if (!result.ok) {
        const message =
            result.reason === 'not_joined'
                ? `${user} n’est pas inscrit au challenge.`
                : 'Type d’exercice invalide.';

        await interaction.reply({
            content: message,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const contentLines = [
        `Stats ${exerciseType} de ${user}`,
        `Total: ${result.stats.total}`,
        `Jours loggés: ${result.stats.loggedDays}`,
        `Meilleur jour: ${result.stats.bestDay}`,
    ];

    const streakLine = await getStreakLineOrEmpty(interaction.guildId, user.id);

    if (streakLine) {
        contentLines.push(streakLine);
    }

    await interaction.reply({
        content: contentLines.join('\n'),
    });
}
