#!/usr/bin/env bash
# ==============================================================================
# Surat Ijin - Automated Storage Cleanup Cron Task
# ==============================================================================
# Menjalankan pembersihan berkas unggahan yang tidak lagi terhubung ke database.
#
# Rekomendasi Setup Crontab:
# Jalankan setiap hari Minggu pukul 02:00 pagi:
#   crontab -e
#   0 2 * * 0 /root/project/suratIjin/scripts/cron-storage-cleanup.sh >/dev/null 2>&1
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="${PROJECT_ROOT}/storage"
LOG_FILE="${LOG_DIR}/cleanup.log"

mkdir -p "$LOG_DIR"

# Rotasi log jika ukuran melebihi 5 MB
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv "$LOG_FILE" "${LOG_FILE}.old"
fi

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================================" >> "$LOG_FILE"
echo "[${TIMESTAMP}] Memulai pembersihan berkas yatim di background..." >> "$LOG_FILE"

cd "$PROJECT_ROOT"

if npm run storage:clean >> "$LOG_FILE" 2>&1; then
  FINISH_TIME="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[${FINISH_TIME}] Pembersihan selesai dengan sukses." >> "$LOG_FILE"
else
  EXIT_CODE=$?
  FINISH_TIME="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[${FINISH_TIME}] Pembersihan gagal dengan kode error: ${EXIT_CODE}" >> "$LOG_FILE"
fi

echo "========================================================" >> "$LOG_FILE"
