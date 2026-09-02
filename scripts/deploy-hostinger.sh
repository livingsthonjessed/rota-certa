#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/la-transportes
APP_USER=deploy
DB_NAME=la_transportes
REPOSITORY=https://github.com/livingsthonjessed/rota-certa.git

id -u "$APP_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$APP_USER"
mkdir -p /var/www

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch prod --single-branch "$REPOSITORY" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin prod
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout prod
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin prod
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1; then
  sudo -u postgres createuser "$APP_USER"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb --owner="$APP_USER" "$DB_NAME"
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  printf 'DATABASE_URL=postgresql:///%s?host=/var/run/postgresql\nPORT=8000\nNODE_ENV=production\nGOOGLE_MAPS_API_KEY=\n' "$DB_NAME" > "$APP_DIR/.env"
elif ! grep -q '^GOOGLE_MAPS_API_KEY=' "$APP_DIR/.env"; then
  printf 'GOOGLE_MAPS_API_KEY=\n' >> "$APP_DIR/.env"
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev
sudo -u "$APP_USER" npm run migrate:deploy

echo '--- DEPLOYED ---'
sudo -u "$APP_USER" git log -1 --oneline
sudo -u "$APP_USER" psql -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
