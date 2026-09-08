#!/usr/bin/env bash
# Runs a private PostgreSQL 16 cluster inside the project folder (.local/postgres)
# for development and tests when Docker is not available. The data lives in .local.nosync so
# iCloud Drive never syncs or evicts database files when the project sits in a synced folder.
#
#   pnpm db:local start    # init (first time) and start on port 54329
#   pnpm db:local stop
#   pnpm db:local status
#   pnpm db:local reset    # stop, delete the cluster, start fresh
#
# Requires pg_ctl / initdb on PATH (brew install postgresql@16).
set -euo pipefail
export LC_ALL=C

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.local.nosync/postgres"
LOG_FILE="$ROOT_DIR/.local.nosync/postgres.log"
PORT="${PGPORT_LOCAL:-54329}"
DB_USER="scoreboard"
DB_PASSWORD="scoreboard"

for candidate in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin /usr/lib/postgresql/16/bin; do
  if [ -d "$candidate" ]; then export PATH="$candidate:$PATH"; fi
done

command -v pg_ctl >/dev/null 2>&1 || { echo "pg_ctl not found. Install PostgreSQL 16 (brew install postgresql@16) or use docker compose."; exit 1; }

init_cluster() {
  if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
    echo "[db-local] initialising cluster in $DATA_DIR"
    mkdir -p "$DATA_DIR"
    initdb -D "$DATA_DIR" -U "$DB_USER" --auth=trust -E UTF-8 --locale=C >/dev/null
    printf "\nport = %s\nlisten_addresses = 'localhost'\nunix_socket_directories = '%s'\n" "$PORT" "$DATA_DIR" >> "$DATA_DIR/postgresql.conf"
  fi
}

# Something else listening on our port is almost always another checkout of this project, and
# postgres only reports it in its log file, so check first and say so plainly (D-056).
port_in_use() {
  command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

start_cluster() {
  init_cluster
  if pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
    echo "[db-local] already running on port $PORT"
  else
    if port_in_use; then
      echo "[db-local] port $PORT is already in use:"
      lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | tail -n +2 | sed 's/^/  /'
      echo "[db-local] This is usually another copy of this project running its own cluster."
      echo "[db-local] Either stop that one (run 'pnpm db:local stop' in that folder), or run this"
      echo "[db-local] one on a free port and match it in .env:"
      echo "[db-local]   PGPORT_LOCAL=54330 pnpm db:local start"
      exit 1
    fi
    if ! pg_ctl -D "$DATA_DIR" -l "$LOG_FILE" -w start >/dev/null; then
      echo "[db-local] the server did not start. Last lines of $LOG_FILE:"
      tail -n 15 "$LOG_FILE" 2>/dev/null | sed 's/^/  /'
      exit 1
    fi
    echo "[db-local] started on port $PORT (log: $LOG_FILE)"
  fi
  for db in scoreboard scoreboard_test scoreboard_e2e; do
    if ! psql -h "$DATA_DIR" -p "$PORT" -U "$DB_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" postgres | grep -q 1; then
      createdb -h "$DATA_DIR" -p "$PORT" -U "$DB_USER" "$db"
      echo "[db-local] created database $db"
    fi
  done
  psql -h "$DATA_DIR" -p "$PORT" -U "$DB_USER" -qc "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" postgres
  echo "[db-local] DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:$PORT/scoreboard?schema=public"
}

case "${1:-status}" in
  start) start_cluster ;;
  stop)
    if pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then pg_ctl -D "$DATA_DIR" -w stop >/dev/null && echo "[db-local] stopped"; else echo "[db-local] not running"; fi ;;
  status) pg_ctl -D "$DATA_DIR" status || true ;;
  reset)
    "$0" stop || true
    rm -rf "$DATA_DIR"
    start_cluster ;;
  *) echo "usage: $0 {start|stop|status|reset}"; exit 1 ;;
esac
