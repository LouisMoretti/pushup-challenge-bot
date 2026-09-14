import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { inArray, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client.js';
import {
    addExercise,
    getGuildGoals,
    getGuildStreaks,
    getGuildsForChallengeEnd,
    getLeaderboard,
    joinChallenge,
    markChallengeEnded,
} from '../src/db/queries.js';
import { guilds } from '../src/db/schema.js';

// Retro-compatibility checks: an old-version database must survive
// `drizzle-kit push` to the current schema with no data loss and a
// working app afterwards. Each scenario rebuilds a legacy schema
// from the `test/fixtures/schema-v*.sql` snapshots (generated with
// `drizzle-kit generate` from the historical `src/db/schema.js`),
// seeds legacy rows, then runs the REAL push binary — the same
// command `src/start_bot.sh` runs at deploy.
//
// DESTRUCTIVE: tables are dropped and recreated, so this suite only
// runs with RETROCOMPAT_TEST=1 (set in CI, opt-in locally) plus
// DATABASE_URL. Files run sequentially (`--test-concurrency=1` in
// `npm test`) because every integration file shares one database.
const enabled =
    Boolean(process.env.DATABASE_URL) && process.env.RETROCOMPAT_TEST === '1';

if (!enabled) {
    console.log(
        'Skipping retro-compat tests ' +
            '(need DATABASE_URL + RETROCOMPAT_TEST=1).',
    );
}

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readFile(relativePath) {
    return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

async function runStatement(statement) {
    const withoutComments = statement
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n');

    if (withoutComments.trim()) {
        await db.execute(sql.raw(withoutComments));
    }
}

async function resetToFixture(fixtureName) {
    await runStatement(`drop table if exists entry_events, entries,
        guild_exercise_goals, participants, guilds cascade`);
    await runStatement('drop type if exists exercise_type cascade');

    const fixture = readFile(`./fixtures/${fixtureName}`);

    for (const statement of fixture.split('--> statement-breakpoint')) {
        await runStatement(statement);
    }
}

function runDbPush() {
    const result = spawnSync('npx', ['drizzle-kit', 'push', '--force'], {
        cwd: projectRoot,
        env: process.env,
        encoding: 'utf8',
        timeout: 180000,
    });

    assert.equal(
        result.status,
        0,
        `drizzle-kit push failed:\n${result.stdout}\n${result.stderr}`,
    );
}

async function seedLegacyGuild(guildId, goals) {
    await db.execute(sql`
        insert into guilds (
            guild_id, tracked_channel_id, start_date, duration_days,
            daily_goal, timezone, reminder_time, last_recap_date
        ) values (
            ${guildId}, 'retro-channel', '2026-08-01', 30,
            ${goals.PUSHUP}, 'Europe/Paris', '20:00', null
        )`);

    const [participant] = await db.execute(sql`
        insert into participants (guild_id, user_id, active)
        values (${guildId}, 'retro-user', true)
        returning id`);

    const today = DateTime.now().setZone('Europe/Paris').toISODate();
    // Last day of the seeded challenge window (2026-08-01 + 30 days).
    const lastDay = DateTime.fromISO('2026-08-01', { zone: 'Europe/Paris' })
        .plus({ days: 29 })
        .toISODate();

    // Today's PUSHUP row: the app always writes "today", so the
    // post-migration addExercise continues this exact row.
    await db.execute(sql`
        insert into entries (
            participant_id, entry_date, exercise_type, count
        ) values (
            ${participant.id}, ${today}, 'PUSHUP'::exercise_type,
            ${goals.PUSHUP}
        )`);

    // A successful day inside the window: every type reaches its goal
    // on the challenge's last day, yesterday and before are empty.
    for (const [type, count] of Object.entries(goals)) {
        await db.execute(sql`
            insert into entries (
                participant_id, entry_date, exercise_type, count
            ) values (
                ${participant.id}, ${lastDay}, ${type}::exercise_type,
                ${count}
            )`);
    }

    const [entry] = await db.execute(sql`
        select id from entries
        where participant_id = ${participant.id}
        and entry_date = ${today}
        and exercise_type = 'PUSHUP'`);
    await db.execute(sql`
        insert into entry_events (
            entry_id, actor_user_id, action, amount, before_count,
            after_count
        ) values (
            ${entry.id}, 'retro-user', 'add', ${goals.PUSHUP}, 0,
            ${goals.PUSHUP}
        )`);

    return { today };
}

async function seedLegacyGoals(guildId, goals) {
    for (const [type, goal] of Object.entries(goals)) {
        await db.execute(sql`
            insert into guild_exercise_goals (
                guild_id, exercise_type, daily_goal
            ) values (
                ${guildId}, ${type}::exercise_type, ${goal}
            )`);
    }
}

async function verifyMigratedGuild(guildId, goals, today) {
    // Objects added since the legacy version exist after the push.
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

    // Legacy row preserved, new marker backfilled to NULL.
    const [guild] = await db.execute(sql`
        select daily_goal, challenge_ended_at from guilds
        where guild_id = ${guildId}`);
    assert.equal(guild.daily_goal, goals.PUSHUP);
    assert.equal(guild.challenge_ended_at, null);

    const [entry] = await db.execute(sql`
        select e.count from entries e
        join participants p on p.id = e.participant_id
        where p.guild_id = ${guildId}
        and e.entry_date = ${today}
        and e.exercise_type = 'PUSHUP'`);
    assert.equal(entry.count, goals.PUSHUP);

    const events = await db.execute(sql`
        select e.action, e.amount from entry_events e
        join entries n on n.id = e.entry_id
        join participants p on p.id = n.participant_id
        where p.guild_id = ${guildId}`);
    assert.ok(
        events.some(
            (event) => event.action === 'add' && event.amount === goals.PUSHUP,
        ),
    );

    // Backfill seeds (v1) or preserves (v2) the per-exercise goals.
    const backfill = readFile('../scripts/backfill-exercise-goals.sql');
    await db.execute(sql.raw(backfill));
    const storedGoals = await getGuildGoals(guildId);
    assert.equal(storedGoals.length, 4);

    for (const row of storedGoals) {
        assert.equal(row.dailyGoal, goals[row.exerciseType]);
    }

    // The app works on the migrated rows, continuing legacy counts.
    const joined = await joinChallenge(guildId, 'retro-user');
    assert.equal(joined.ok, true);

    const added = await addExercise(guildId, 'retro-user', 'PUSHUP', 5);
    assert.equal(added.beforeCount, goals.PUSHUP);
    assert.equal(added.afterCount, goals.PUSHUP + 5);

    const board = await getLeaderboard(guildId, 'PUSHUP');
    assert.equal(board.rows[0].userId, 'retro-user');
    // Last window day at goal + today at goal + 5 just logged.
    assert.equal(board.rows[0].total, goals.PUSHUP * 2 + 5);

    // The challenge's last day is successful on every type and the
    // day before is empty, so the streak is exactly 1.
    const streaks = await getGuildStreaks(guildId);
    assert.equal(streaks.get('retro-user'), 1);

    // The end-of-challenge marker (#20) fires exactly once here:
    // seeded startDate 2026-08-01 + 30 days is over.
    const dueBefore = await getGuildsForChallengeEnd();
    assert.ok(dueBefore.some((due) => due.guildId === guildId));

    await markChallengeEnded(guildId);

    const dueAfter = await getGuildsForChallengeEnd();
    assert.ok(!dueAfter.some((due) => due.guildId === guildId));
}

describe('db retro-compatibility', { skip: !enabled }, () => {
    const createdGuildIds = [];
    let counter = 0;

    function newGuildId(tag) {
        counter += 1;
        return `retro-${tag}-${Date.now()}-${counter}`;
    }

    after(async () => {
        try {
            if (createdGuildIds.length > 0) {
                await db
                    .delete(guilds)
                    .where(inArray(guilds.guildId, createdGuildIds));
            }
        } catch {
            // Best effort: a failed reset may leave the schema behind.
        }
        await closeDb();
    });

    it('v1 (initial schema) survives db:push to current', async () => {
        const guildId = newGuildId('v1');
        createdGuildIds.push(guildId);
        // v1 only knows one daily goal: every type inherits it.
        const goals = { PUSHUP: 80, SQUAT: 80, CRUNCH: 80, RUNNING: 80 };

        await resetToFixture('schema-v1.sql');
        const { today } = await seedLegacyGuild(guildId, goals);
        runDbPush();
        await verifyMigratedGuild(guildId, goals, today);
    });

    it('v2 (per-exercise goals) survives db:push to current', async () => {
        const guildId = newGuildId('v2');
        createdGuildIds.push(guildId);
        const goals = { PUSHUP: 80, SQUAT: 50, CRUNCH: 50, RUNNING: 5 };

        await resetToFixture('schema-v2.sql');
        const { today } = await seedLegacyGuild(guildId, goals);
        await seedLegacyGoals(guildId, goals);
        runDbPush();
        await verifyMigratedGuild(guildId, goals, today);
    });
});
