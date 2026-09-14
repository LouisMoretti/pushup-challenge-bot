-- Legacy schema fixture: app tables as of v2, after the
-- per-exercise goals table (commit 08b0b7f, #28) but before the
-- end-of-challenge marker (commit 78188fa, #20). Has
-- `guild_exercise_goals`, no `guilds.challenge_ended_at` column.
--
-- Generated from `git show 08b0b7f:src/db/schema.js` with
-- `drizzle-kit generate` (dialect postgresql). Do not edit by hand;
-- regenerate from the tagged commit if needed. Statements are
-- separated by drizzle's statement separator line; the
-- retro-compat test splits on it and runs each statement separately.
CREATE TYPE "public"."exercise_type" AS ENUM('PUSHUP', 'SQUAT', 'CRUNCH', 'RUNNING');--> statement-breakpoint
CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"participant_id" integer NOT NULL,
	"entry_date" date NOT NULL,
	"exercise_type" "exercise_type" DEFAULT 'PUSHUP' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entries_participant_id_entry_date_exercise_type_unique" UNIQUE("participant_id","entry_date","exercise_type")
);
--> statement-breakpoint
CREATE TABLE "entry_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"amount" integer NOT NULL,
	"before_count" integer NOT NULL,
	"after_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_exercise_goals" (
	"guild_id" text NOT NULL,
	"exercise_type" "exercise_type" NOT NULL,
	"daily_goal" integer NOT NULL,
	CONSTRAINT "guild_exercise_goals_guild_id_exercise_type_pk" PRIMARY KEY("guild_id","exercise_type"),
	CONSTRAINT "guild_exercise_goals_daily_goal_check" CHECK ("guild_exercise_goals"."daily_goal" > 0)
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"tracked_channel_id" text,
	"start_date" date,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"daily_goal" integer DEFAULT 100 NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"reminder_time" text DEFAULT '20:00' NOT NULL,
	"last_recap_date" date
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "participants_guild_id_user_id_unique" UNIQUE("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_events" ADD CONSTRAINT "entry_events_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_exercise_goals" ADD CONSTRAINT "guild_exercise_goals_guild_id_guilds_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("guild_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_guild_id_guilds_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("guild_id") ON DELETE cascade ON UPDATE no action;