# pushup-challenge-bot

```bash
docker compose build bot
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
```

## Sauvegardes

Le service `db-backup` (démarré avec `docker compose up -d`) effectue un dump
compressé (`pg_dump -Fc`) de la base à intervalle régulier. Opération strictement
en lecture seule : aucune écriture, aucune modification de schéma.

- Emplacement des dumps : volume nommé `backups_data`, monté sur `/backups`
  dans le conteneur `db-backup` (jamais dans `postgres_data`). Fichiers
  `pushup_challenge_AAAAMMJJ_HHMMSS.dump`.
- Réglages optionnels via `.env` :
    - `BACKUP_INTERVAL_SECONDS` : secondes entre deux dumps (défaut `86400`,
      soit quotidien).
    - `BACKUP_RETENTION_DAYS` : conservation en jours (défaut `7`, les dumps
      plus anciens sont purgés automatiquement).

```bash
# Lister les dumps
docker compose exec db-backup ls -lh /backups

# Copier un dump hors du volume (à faire régulièrement : offsite)
docker compose cp db-backup:/backups/<fichier>.dump ./<fichier>.dump
```

### Restauration

`--clean --if-exists` supprime les objets existants avant de les recréer :
le contenu actuel de la base est remplacé par celui du dump.

```bash
docker compose stop bot  # éviter toute écriture pendant la restauration
docker compose exec db-backup sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" \
    pg_restore --clean --if-exists --no-owner \
    -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" /backups/<fichier>.dump'
docker compose start bot
```

Depuis une copie locale du fichier :

```bash
docker compose exec -T db pg_restore --clean --if-exists --no-owner \
    -U pushup -d pushup_challenge < ./<fichier>.dump
```

**Attention :** ne jamais lancer `docker compose down -v` — cela supprimerait
le volume `postgres_data` **et** le volume `backups_data` (données et
sauvegardes définitivement perdues).
