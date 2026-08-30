import {
    pgEnum,
    pgTable,
    text,
    integer,
    date,
    timestamp,
    serial,
    unique,
    boolean,
    check,
    primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const EXERCISE_TYPES = {
    PUSHUP: 'PUSHUP',
    SQUAT: 'SQUAT',
    CRUNCH: 'CRUNCH',
    RUNNING: 'RUNNING',
};

export const exerciseTypeEnum = pgEnum(
    'exercise_type',
    Object.values(EXERCISE_TYPES),
);

export const guilds = pgTable('guilds', {
    guildId: text('guild_id').primaryKey(),
    trackedChannelId: text('tracked_channel_id'),
    startDate: date('start_date'),
    durationDays: integer('duration_days').notNull().default(30),
    /**
     * @deprecated Since issue #18. Replaced by the per-exercise goals in
     * `guildExerciseGoals`; stop reading/writing this column when UX v2
     * (#19) ships. Drop deferred.
     */
    dailyGoal: integer('daily_goal').notNull().default(100),
    timezone: text('timezone').notNull().default('Europe/Paris'),
    reminderTime: text('reminder_time').notNull().default('20:00'),
    lastRecapDate: date('last_recap_date'),
});

export const guildExerciseGoals = pgTable(
    'guild_exercise_goals',
    {
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.guildId, { onDelete: 'cascade' }),
        exerciseType: exerciseTypeEnum('exercise_type').notNull(),
        dailyGoal: integer('daily_goal').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.guildId, table.exerciseType] }),
        check(
            'guild_exercise_goals_daily_goal_check',
            sql`${table.dailyGoal} > 0`,
        ),
    ],
);

export const participants = pgTable(
    'participants',
    {
        id: serial('id').primaryKey(),
        guildId: text('guild_id')
            .notNull()
            .references(() => guilds.guildId, { onDelete: 'cascade' }),
        userId: text('user_id').notNull(),
        joinedAt: timestamp('joined_at').notNull().defaultNow(),
        active: boolean('active').notNull().default(true),
    },
    (table) => [unique().on(table.guildId, table.userId)],
);

export const entries = pgTable(
    'entries',
    {
        id: serial('id').primaryKey(),
        participantId: integer('participant_id')
            .notNull()
            .references(() => participants.id, { onDelete: 'cascade' }),

        entryDate: date('entry_date').notNull(),
        exerciseType: exerciseTypeEnum('exercise_type')
            .notNull()
            .default(EXERCISE_TYPES.PUSHUP),
        count: integer('count').notNull().default(0),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => [
        unique().on(table.participantId, table.entryDate, table.exerciseType),
    ],
);

export const entryEvents = pgTable('entry_events', {
    id: serial('id').primaryKey(),
    entryId: integer('entry_id')
        .notNull()
        .references(() => entries.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(),
    amount: integer('amount').notNull(),
    beforeCount: integer('before_count').notNull(),
    afterCount: integer('after_count').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});
