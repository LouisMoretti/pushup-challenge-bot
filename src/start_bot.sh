#!/bin/sh
set -eu

echo "Deploying Discord commands..."
node src/deploy-commands.js

echo "Preparing database schema..."
attempt=1
max_attempts=30

until node ./node_modules/drizzle-kit/bin.cjs push; do
    if [ "$attempt" -ge "$max_attempts" ]; then
        echo "Database schema preparation failed after $max_attempts attempts."
        exit 1
    fi

    echo "Database is not ready yet. Retrying in 2s... ($attempt/$max_attempts)"
    attempt=$((attempt + 1))
    sleep 2
done

echo "Starting bot..."
exec node src/index.js
