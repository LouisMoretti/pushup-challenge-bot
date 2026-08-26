-- Per-exercise goals backfill (#18).
--
-- Copies each guild's legacy single daily goal (guilds.daily_goal) into one
-- guild_exercise_goals row per exercise type, so every guild keeps its
-- previous goal on all four exercises.
--
-- Idempotent: INSERT ... SELECT ... ON CONFLICT (guild_id, exercise_type)
-- DO NOTHING. ON CONFLICT DO NOTHING makes the script safe to re-run: rows
-- that already exist (e.g. goals customized after an earlier run) are left
-- untouched instead of duplicated or overwritten.

INSERT INTO guild_exercise_goals (guild_id, exercise_type, daily_goal)
SELECT
    g.guild_id,
    t.exercise_type::exercise_type,
    g.daily_goal
FROM guilds g
CROSS JOIN (
    VALUES ('PUSHUP'), ('SQUAT'), ('CRUNCH'), ('RUNNING')
) AS t(exercise_type)
ON CONFLICT (guild_id, exercise_type) DO NOTHING;
