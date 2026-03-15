#!/bin/bash
# Backup script for UI_K data (Mac 2 only)
# Backs up: SQLite database, config files, mask mappings

set -e

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="uik_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "=== UI_K Backup ==="
echo "Backup path: ${BACKUP_PATH}"

mkdir -p "$BACKUP_PATH"

# Backup database (using SQLite online backup for safety)
DB_PATH="${DB_PATH:-./db/uik.sqlite}"
if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" ".backup '${BACKUP_PATH}/uik.sqlite'"
    echo "Database backed up."
else
    echo "WARNING: Database not found at $DB_PATH"
fi

# Backup config files
cp -r config/ "${BACKUP_PATH}/config/" 2>/dev/null || echo "No config directory."

# Backup .env (but NOT credentials)
if [ -f .env ]; then
    grep -v 'API_KEY\|PASSWORD\|SECRET' .env > "${BACKUP_PATH}/env_safe.txt" || true
    echo ".env backed up (credentials stripped)."
fi

# Create tarball
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo ""
echo "Backup complete: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "Size: $(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)"
