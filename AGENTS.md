# AGENTS.md

Discord bot (discord.js v14, Node >= 22.12, pure ESM) tracking per-guild exercise challenges. Data in Postgres via Drizzle ORM.

## Commands

- Every script loads env via `node --env-file=.env` (no dotenv package). Bare `node src/index.js` fails; use npm scripts or add the flag yourself.
- `npm run start` — run the bot locally
- `npm run deploy` — register slash commands with Discord (global, not guild-scoped; new/changed commands don't appear until this runs)
- `npm run db:push` — apply `src/db/schema.js` directly to Postgres. The workflow is push-based: there is no `drizzle/` migrations folder and no generate/migrate scripts.
- No test suite and no lint script. Verification = `npx eslint .` (Prettier runs inside ESLint as `prettier/prettier: error`).
- For dev, set `GUILD_ID` in `.env` before `npm run deploy` to register commands instantly in one guild; without it registration is global and takes up to an hour to propagate.

## Architecture

- Slash commands auto-load at startup from `src/commands/<group>/*.js`; each file must export `data` (SlashCommandBuilder) and `execute`, optionally `cooldown` (seconds, default 3). Events auto-load from `src/events/*.js` exporting `name`, `execute`, optional `once`.
- All DB access goes through `src/db/queries.js` (Drizzle, schema in `src/db/schema.js`). Query functions return `{ ok, reason }` result objects that each command maps to user-facing messages.
- Count mutations run in a transaction with `SELECT ... FOR UPDATE` on the entry row — keep that pattern or concurrent commands lose updates.
- Daily recaps: `src/scheduler.js` is started from the ready event and ticks every minute; a guild gets its recap when guild-timezone `HH:mm` equals `reminderTime`, `lastRecapDate ≠ today`, and today is within `startDate + durationDays`.

## Conventions / gotchas

- Relative imports need the `.js` extension (ESM).
- Formatting is enforced, not optional: 4-space indent, single quotes, semicolons, trailing commas, 80 cols. Run `npx eslint .` before finishing.
- User-facing strings are French using typographic apostrophes (’). Match existing command files.
- Exercise types live in `EXERCISE_TYPES` in `src/db/schema.js` (a PG enum — changing it requires `db:push`); `/log` and `/admin-log` choices derive from it automatically.
- Daily entry dates are computed in the guild's timezone (Luxon, default `Europe/Paris`), not server time — see `dateInGuildTimezone` in `queries.js`.

## Environment / deployment

- `.env.example`'s `DATABASE_URL` points at the compose hostname `db`. Running npm scripts on the host against the compose Postgres (port 5432 published) needs `localhost` instead.
- Production flow (README): build image → `docker compose run --rm bot node src/deploy-commands.js` → `up -d`. Inside the container, `src/start_bot.sh` redeploys commands and retries `drizzle-kit push` until the DB is up before starting the bot.
- The only remaining `npm audit` finding is esbuild via drizzle-kit's CLI config loader — dev-only, no server exposed; don't "fix" it by downgrading drizzle-kit.
