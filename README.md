# pushup-challenge-bot

A Discord bot that runs **fitness challenges inside a guild**: members join, log
their daily reps (pushups, squats, crunches, running), and the bot keeps score —
daily recaps in a tracked channel, leaderboards, per-user and global stats.
Everything is stored per-guild in Postgres.

Built with discord.js v14 (pure ESM, Node >= 22.12), Drizzle ORM and Postgres 17.

## Commands

| Command | Purpose |
|---|---|
| `/setup` | Configure the challenge for the server (ManageGuild required) |
| `/join` / `/leave` | Join or leave the challenge |
| `/log add\|set` | Log today's reps for an exercise type |
| `/admin-log add\|remove\|set` | Correct another participant's count (ManageGuild) |
| `/stats user\|global` | Per-user or server-wide statistics |
| `/leaderboard` | Rankings per exercise type |

Daily recap: posted at the configured time (`reminderTime`, guild timezone) in
the tracked channel, listing every participant's total against `dailyGoal`.

## Deployment

```bash
docker compose build bot
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
```

Inside the container, `src/start_bot.sh` re-registers slash commands and applies
the schema (`drizzle-kit push`) before starting the bot. Copy `.env.example` to
`.env` and fill in your Discord credentials and database settings first.

## Local development

Requirements: Node >= 22.12, Docker.

```bash
cp .env.example .env      # fill APP_ID, DISCORD_TOKEN, POSTGRES_*
docker compose up -d db   # local Postgres on localhost:5432
npm ci
```

Gotchas:

- Every npm script loads env via `node --env-file=.env` — bare `node src/index.js`
  will not work.
- `.env.example` points `DATABASE_URL` at the compose hostname `db`. When running
  npm scripts on the host, use `localhost` instead (port 5432 is published).
  Switch it back to `db` before `docker compose up`.
- Slash command changes need `npm run deploy`. Registration is global by default
  (up to an hour to propagate); set `GUILD_ID` in `.env` during development to
  register instantly in one guild.
- Verification is `npx eslint .` (Prettier rules run through ESLint). There is no
  test suite yet.

More architecture notes live in [AGENTS.md](AGENTS.md).

## Backups

The `db-backup` service (started with `docker compose up -d`) takes a
compressed dump (`pg_dump -Fc`) of the database at a regular interval.
Strictly read-only: no writes, no schema changes.

- Dump location: named volume `backups_data`, mounted at `/backups` in the
  `db-backup` container (never inside `postgres_data`). Files are named
  `pushup_challenge_YYYYMMDD_HHMMSS.dump`.
- Optional settings via `.env`:
    - `BACKUP_INTERVAL_SECONDS`: seconds between two dumps (default `86400`,
      i.e. daily). Note that a dump is also taken on every container start.
    - `BACKUP_RETENTION_DAYS`: days to keep dumps (default `7`; older dumps
      are pruned automatically).

Every archive is verified with `pg_restore -l` right after the dump; a corrupt
or truncated file is deleted instead of being kept as a false backup.

```bash
# List dumps
docker compose exec db-backup ls -lh /backups

# Copy a dump off the host regularly (offsite — cloud sync tracked in #10)
docker compose cp db-backup:/backups/<file>.dump ./<file>.dump
```

### Restore

`--clean --if-exists` drops existing objects before recreating them: the
current database content is replaced by the dump content.

```bash
docker compose stop bot  # avoid writes during the restore
docker compose exec db-backup sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" \
    pg_restore --clean --if-exists --no-owner \
    -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" /backups/<file>.dump'
docker compose start bot
```

From a local copy of the file:

```bash
docker compose exec -T db pg_restore --clean --if-exists --no-owner \
    -U pushup -d pushup_challenge < ./<file>.dump
```

**Warning:** never run `docker compose down -v` — it would delete the
`postgres_data` volume **and** the `backups_data` volume (data and backups
permanently lost).
