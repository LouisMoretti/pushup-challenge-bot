import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import {
    buildChallengeEndMessage,
    buildGoalLines,
    buildPodiumLine,
    countDaysWithGoalMet,
    getChallengeWindow,
    isChallengeEnded,
} from '../src/utils/challenge-end.js';

function atUtc(isoDateTime) {
    return DateTime.fromISO(isoDateTime, { zone: 'utc' });
}

function tokyoGuild(overrides = {}) {
    return {
        startDate: '2026-08-01',
        durationDays: 30,
        timezone: 'Asia/Tokyo',
        challengeEndedAt: null,
        ...overrides,
    };
}

describe('isChallengeEnded', () => {
    it('renvoie false avant le dernier jour', () => {
        assert.equal(
            isChallengeEnded(tokyoGuild(), atUtc('2026-08-10T00:00:00')),
            false,
        );
    });

    it('renvoie false le dernier jour (non fini)', () => {
        assert.equal(
            isChallengeEnded(tokyoGuild(), atUtc('2026-08-30T06:00:00')),
            false,
        );
    });

    it('renvoie true le lendemain du dernier jour en timezone guilde', () => {
        const now = atUtc('2026-08-30T15:30:00');

        assert.equal(now.setZone('utc').toISODate(), '2026-08-30');
        assert.equal(isChallengeEnded(tokyoGuild(), now), true);
    });

    it('renvoie true bien après la fin du challenge', () => {
        assert.equal(
            isChallengeEnded(tokyoGuild(), atUtc('2026-09-20T00:00:00')),
            true,
        );
    });

    it('renvoie false si startDate est null', () => {
        assert.equal(
            isChallengeEnded(
                tokyoGuild({ startDate: null }),
                atUtc('2026-09-20T00:00:00'),
            ),
            false,
        );
    });

    it('renvoie false si challengeEndedAt est déjà setté', () => {
        assert.equal(
            isChallengeEnded(
                tokyoGuild({
                    challengeEndedAt: atUtc('2026-09-01T00:00:00').toJSDate(),
                }),
                atUtc('2026-09-20T00:00:00'),
            ),
            false,
        );
    });

    it('utilise DateTime.now() par défaut et ne throw pas', () => {
        assert.equal(typeof isChallengeEnded(tokyoGuild()), 'boolean');
    });
});

describe('getChallengeWindow', () => {
    it('renvoie null sans startDate', () => {
        assert.equal(getChallengeWindow(tokyoGuild({ startDate: null })), null);
    });

    it('calcule lastDay depuis startDate et durationDays', () => {
        assert.deepEqual(getChallengeWindow(tokyoGuild()), {
            startDate: '2026-08-01',
            lastDay: '2026-08-30',
        });
    });
});

describe('countDaysWithGoalMet', () => {
    it('renvoie 0 sans ligne', () => {
        assert.equal(countDaysWithGoalMet([], 100), 0);
    });

    it('ne compte que les jours atteignant le seuil', () => {
        const dailyRows = [
            { entryDate: '2026-08-01', dayTotal: 99 },
            { entryDate: '2026-08-02', dayTotal: 150 },
        ];

        assert.equal(countDaysWithGoalMet(dailyRows, 100), 1);
    });

    it('compte chaque date distincte une seule fois', () => {
        const dailyRows = [
            { entryDate: '2026-08-01', dayTotal: 100 },
            { entryDate: '2026-08-01', dayTotal: 200 },
            { entryDate: '2026-08-02', dayTotal: 300 },
        ];

        assert.equal(countDaysWithGoalMet(dailyRows, 100), 2);
    });
});

describe('buildPodiumLine', () => {
    it('utilise les médailles pour les rangs 1 à 3', () => {
        assert.equal(buildPodiumLine(1, '111', 12345), '🥇 <@111> — 12 345');
        assert.equal(buildPodiumLine(2, '222', 500), '🥈 <@222> — 500');
        assert.equal(buildPodiumLine(3, '333', 42), '🥉 <@333> — 42');
    });
});

describe('buildGoalLines', () => {
    it('trie par jours décroissants puis userId et ignore N < 1', () => {
        const goalRowsByUser = {
            444: [{ entryDate: '2026-08-04', dayTotal: 10 }],
            222: [
                { entryDate: '2026-08-01', dayTotal: 100 },
                { entryDate: '2026-08-02', dayTotal: 120 },
            ],
            333: [{ entryDate: '2026-08-03', dayTotal: 100 }],
            111: [
                { entryDate: '2026-08-01', dayTotal: 100 },
                { entryDate: '2026-08-02', dayTotal: 190 },
                { entryDate: '2026-08-03', dayTotal: 110 },
            ],
        };

        assert.deepEqual(buildGoalLines(goalRowsByUser, 100), [
            '<@111> : 3 jour(s) avec objectif atteint',
            '<@222> : 2 jour(s) avec objectif atteint',
            '<@333> : 1 jour(s) avec objectif atteint',
        ]);
    });
});

describe('buildChallengeEndMessage', () => {
    const window = { startDate: '2026-08-01', lastDay: '2026-08-30' };

    it('construit le message complet avec podium et objectifs', () => {
        const message = buildChallengeEndMessage({
            window,
            podiumRows: ['🥇 <@111> — 1 000', '🥈 <@222> — 900'],
            goalLines: ['<@111> : 5 jour(s) avec objectif atteint'],
        });

        assert.ok(message.startsWith('🏆 Challenge terminé !'));
        assert.ok(message.includes('Du 2026-08-01 au 2026-08-30'));
        assert.ok(
            message.includes('Podium (total toutes épreuves confondues) :'),
        );
        assert.ok(message.includes('<@111>'));
        assert.ok(message.includes('<@222>'));
        assert.ok(message.includes('🥇'));
        assert.ok(message.includes('🥈'));
        assert.ok(message.includes('Objectifs quotidiens atteints :'));
        assert.ok(message.includes('<@111> : 5 jour(s) avec objectif atteint'));
        assert.ok(!/'/.test(message));
    });

    it('remplace le bloc podium si aucune entrée', () => {
        const message = buildChallengeEndMessage({
            window,
            podiumRows: [],
            goalLines: [],
        });

        assert.ok(
            message.includes(
                'Aucune répétition enregistrée pour ce challenge.',
            ),
        );
        assert.ok(!message.includes('Podium'));
        assert.ok(!message.includes('Objectifs quotidiens'));
    });
});
