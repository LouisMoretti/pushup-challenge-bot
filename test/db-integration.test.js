import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { eq, inArray, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client.js';
import {
    addExercise,
    adminRemoveExercise,
    getGlobalStats,
    getGuildGoal,
    getGuildGoals,
    getGuildStreaks,
    getLeaderboard,
    getUserStreak,
    joinChallenge,
    leaveChallenge,
    setExercise,
    setGuildGoal,
    setupGuild,
} from '../src/db/queries.js';
import { entryEvents, guildExerciseGoals, guilds } from '../src/db/schema.js';

// Integration suite for the Postgres layer. Skipped without
// DATABASE_URL so `npm test` stays green on machines without a
// database (and in the lint CI job). CI runs this same file
// against a postgres:17 service after `drizzle-kit push --force`.
describe('db integration', { skip: !process.env.DATABASE_URL }, () => {
    const createdGuildIds = [];
    let counter = 0;

    const testGoals = { PUSHUP: 100, SQUAT: 50, CRUNCH: 50, RUNNING: 5 };

    async function setupTestGuild() {
        counter += 1;
        const guildId = `test-${Date.now()}-${counter}`;
        await setupGuild({
            guildId,
            trackedChannelId: 'test-channel',
            durationDays: 30,
            timezone: 'Europe/Paris',
            reminderTime: '20:00',
            goals: testGoals,
        });
        createdGuildIds.push(guildId);
        return guildId;
    }

    after(async () => {
        if (createdGuildIds.length > 0) {
            await db
                .delete(guilds)
                .where(inArray(guilds.guildId, createdGuildIds));
        }
        await closeDb();
    });

    it('schema upgrades are applied', async () => {
        const [table] = await db.execute(
            sql`select to_regclass('public.guild_exercise_goals') as name`,
        );
        assert.equal(table.name, 'guild_exercise_goals');

        const [column] = await db.execute(
            sql`select column_name from information_schema.columns
                where table_name = 'guilds'
                and column_name = 'challenge_ended_at'`,
        );
        assert.equal(column.column_name, 'challenge_ended_at');
    });

    it('setupGuild is idempotent (upsert)', async () => {
        const guildId = await setupTestGuild();
        await setupGuild({
            guildId,
            trackedChannelId: 'test-channel',
            durationDays: 30,
            timezone: 'Europe/Paris',
            reminderTime: '20:00',
            goals: testGoals,
        });

        const rows = await getGuildGoals(guildId);
        assert.equal(rows.length, 4);
    });

    it('join / leave / rejoin cycle', async () => {
        const guildId = await setupTestGuild();

        const joined = await joinChallenge(guildId, 'user-a');
        assert.equal(joined.ok, true);

        const left = await leaveChallenge(guildId, 'user-a');
        assert.equal(left.ok, true);

        const leftAgain = await leaveChallenge(guildId, 'user-a');
        assert.deepEqual(leftAgain, { ok: false, reason: 'not_joined' });

        const rejoined = await joinChallenge(guildId, 'user-a');
        assert.equal(rejoined.ok, true);
    });

    it('log flows, admin clamp and audit trail', async () => {
        const guildId = await setupTestGuild();
        await joinChallenge(guildId, 'user-a');

        const invalid = await addExercise(guildId, 'user-a', 'NOPE', 1);
        assert.deepEqual(invalid, {
            ok: false,
            reason: 'invalid_exercise_type',
        });

        const added = await addExercise(guildId, 'user-a', 'PUSHUP', 30);
        assert.equal(added.afterCount, 30);

        const addedMore = await addExercise(guildId, 'user-a', 'PUSHUP', 20);
        assert.equal(addedMore.beforeCount, 30);
        assert.equal(addedMore.afterCount, 50);

        const set = await setExercise(guildId, 'user-a', 'PUSHUP', 100);
        assert.equal(set.afterCount, 100);
        assert.equal(set.reachedGoal, true);

        const removed = await adminRemoveExercise(
            guildId,
            'admin',
            'user-a',
            'PUSHUP',
            150,
        );
        assert.equal(removed.afterCount, 0);

        const events = await db
            .select()
            .from(entryEvents)
            .where(eq(entryEvents.entryId, added.entry.id));
        assert.ok(events.length >= 4);
    });

    it('leaderboard and global stats reflect logged reps', async () => {
        const guildId = await setupTestGuild();
        await joinChallenge(guildId, 'user-a');
        await joinChallenge(guildId, 'user-b');
        await addExercise(guildId, 'user-a', 'PUSHUP', 70);
        await addExercise(guildId, 'user-b', 'PUSHUP', 20);

        const board = await getLeaderboard(guildId, 'PUSHUP');
        assert.equal(board.ok, true);
        assert.equal(board.rows[0].userId, 'user-a');
        assert.equal(board.rows[0].total, 70);

        const global = await getGlobalStats(guildId, 'PUSHUP');
        assert.equal(global.ok, true);
        assert.equal(global.stats.total, 90);
    });

    it('batched getGuildStreaks matches per-user results', async () => {
        const guildId = await setupTestGuild();
        await joinChallenge(guildId, 'user-a');
        await joinChallenge(guildId, 'user-b');
        await addExercise(guildId, 'user-a', 'PUSHUP', 100);
        await addExercise(guildId, 'user-a', 'SQUAT', 50);
        await addExercise(guildId, 'user-a', 'CRUNCH', 50);
        await addExercise(guildId, 'user-a', 'RUNNING', 5);
        await addExercise(guildId, 'user-b', 'PUSHUP', 10);

        const batch = await getGuildStreaks(guildId);
        const singleA = await getUserStreak(guildId, 'user-a');
        const singleB = await getUserStreak(guildId, 'user-b');

        assert.equal(batch.get('user-a'), singleA.streak);
        assert.equal(batch.get('user-b'), singleB.streak);
        assert.ok(singleA.streak >= 1);
        assert.equal(singleB.streak, 0);
    });

    it('exercise-goals backfill is idempotent', async () => {
        const guildId = await setupTestGuild();
        // Simulate a legacy guild: no per-exercise goals, only the
        // deprecated guilds.daily_goal column.
        await db
            .delete(guildExerciseGoals)
            .where(eq(guildExerciseGoals.guildId, guildId));
        await db
            .update(guilds)
            .set({ dailyGoal: 42 })
            .where(eq(guilds.guildId, guildId));

        const backfillPath = new URL(
            '../scripts/backfill-exercise-goals.sql',
            import.meta.url,
        );
        const backfillSql = fs.readFileSync(backfillPath, 'utf8');

        await db.execute(sql.raw(backfillSql));
        const first = await getGuildGoals(guildId);
        assert.equal(first.length, 4);
        assert.ok(first.every((row) => row.dailyGoal === 42));

        // Customized goals survive a re-run (ON CONFLICT DO NOTHING).
        await setGuildGoal(guildId, 'PUSHUP', 7);
        await db.execute(sql.raw(backfillSql));
        const second = await getGuildGoals(guildId);
        assert.equal(second.length, 4);
        assert.equal(await getGuildGoal(guildId, 'PUSHUP'), 7);
    });
});
