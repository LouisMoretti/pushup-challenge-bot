# pushup-challenge-bot

```bash
docker compose build bot
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
```

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
