#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/la-transportes
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

install -d -m 700 "$BACKUP_DIR"
sudo -u deploy pg_dump --format=custom la_transportes > "$BACKUP_DIR/la_transportes-$TIMESTAMP.dump"
chown root:root "$BACKUP_DIR/la_transportes-$TIMESTAMP.dump"
chmod 600 "$BACKUP_DIR/la_transportes-$TIMESTAMP.dump"
find "$BACKUP_DIR" -type f -name 'la_transportes-*.dump' -mtime +7 -delete
