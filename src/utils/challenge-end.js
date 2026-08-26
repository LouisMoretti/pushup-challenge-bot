import { DateTime } from 'luxon';

const MEDALS = ['🥇', '🥈', '🥉'];

export function getChallengeWindow(guild) {
    if (!guild?.startDate) {
        return null;
    }

    const lastDay = DateTime.fromISO(guild.startDate, {
        zone: guild.timezone,
    })
        .plus({ days: guild.durationDays - 1 })
        .toISODate();

    return { startDate: guild.startDate, lastDay };
}

export function isChallengeEnded(guild, now = DateTime.now()) {
    if (guild.challengeEndedAt) {
        return false;
    }

    const window = getChallengeWindow(guild);

    if (!window) {
        return false;
    }

    const today = now.setZone(guild.timezone).toISODate();

    return today > window.lastDay;
}

function formatCount(count) {
    return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function buildPodiumLine(rank, userId, total) {
    const medal = MEDALS[rank - 1] ?? `${rank}.`;

    return `${medal} <@${userId}> — ${formatCount(total)}`;
}

export function countDaysWithGoalMet(dailyRows, dailyGoalTotal) {
    const metDates = new Set();

    for (const row of dailyRows) {
        if ((row.dayTotal ?? 0) >= dailyGoalTotal) {
            metDates.add(row.entryDate);
        }
    }

    return metDates.size;
}

export function buildGoalLines(goalRowsByUser, dailyGoalTotal) {
    return Object.entries(goalRowsByUser)
        .map(([userId, dailyRows]) => ({
            userId,
            days: countDaysWithGoalMet(dailyRows, dailyGoalTotal),
        }))
        .filter((row) => row.days >= 1)
        .sort((a, b) => b.days - a.days || a.userId.localeCompare(b.userId))
        .map(
            (row) =>
                `<@${row.userId}> : ${row.days} jour(s) avec objectif atteint`,
        );
}

export function buildChallengeEndMessage({ window, podiumRows, goalLines }) {
    const dateRange = `Du ${window.startDate} au ${window.lastDay}`;
    const lines = [
        '🏆 Challenge terminé !',
        `${dateRange} — merci à tous les participants !`,
        '',
    ];

    if (podiumRows.length > 0) {
        lines.push(
            'Podium (total toutes épreuves confondues) :',
            ...podiumRows,
        );
    } else {
        lines.push('Aucune répétition enregistrée pour ce challenge.');
    }

    if (goalLines.length > 0) {
        lines.push('');
        lines.push('Objectifs quotidiens atteints :', ...goalLines);
    }

    return lines.join('\n');
}
