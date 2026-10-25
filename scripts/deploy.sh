#!/usr/bin/env bash
# ==============================================================================
# Deploy Script: Surat Ijin Next.js (Development Port 3000 / Production Port 80)
# ==============================================================================
set -euo pipefail

# ANSI Colors
COLOR_RESET="\033[0m"
COLOR_INFO="\033[36m"
COLOR_SUCCESS="\033[32m"
COLOR_WARN="\033[33m"
COLOR_ERROR="\033[31m"

log_info() {
    echo -e "${COLOR_INFO}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO]${COLOR_RESET} $1"
}

log_success() {
    echo -e "${COLOR_SUCCESS}[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS]${COLOR_RESET} $1"
}

log_warn() {
    echo -e "${COLOR_WARN}[$(date +'%Y-%m-%d %H:%M:%S')] [WARN]${COLOR_RESET} $1"
}

log_error() {
    echo -e "${COLOR_ERROR}[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR]${COLOR_RESET} $1" >&2
}

# 1. Root Privileges Check
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    log_error "Skrip deployment memerlukan hak akses root. Jalankan dengan sudo atau sebagai root."
    exit 1
fi

# 2. Determine Target Mode
TARGET_MODE="${1:-dev}"
APP_DIR="/root/project/suratIjin"
SERVICE_NAME="surat-ijin"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$TARGET_MODE" = "prod" ] || [ "$TARGET_MODE" = "production" ]; then
    PORT=80
    MODE_LABEL="Production (Port 80)"
    IS_PROD=true
else
    PORT=3000
    MODE_LABEL="Development (Port 3000)"
    IS_PROD=false
fi

log_info "Memulai proses deployment ke lingkungan: ${MODE_LABEL}"
log_info "Direktori aplikasi: ${APP_DIR}"

if [ ! -d "$APP_DIR" ]; then
    log_error "Direktori ${APP_DIR} tidak ditemukan!"
    exit 1
fi

cd "$APP_DIR"

# 3. Environment & Tooling Verification
log_info "Memeriksa ketersediaan Node.js dan npm..."
if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js tidak terpasang di sistem!"
    exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
    log_error "npm tidak terpasang di sistem!"
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
log_info "Node.js: ${NODE_VERSION} | npm: ${NPM_VERSION}"

# 4. Dependency Installation
log_info "Menginstal dan menyelaraskan dependencies (npm install)..."
npm install --prefer-offline --no-audit --no-fund
log_success "Dependencies berhasil terpasang."

# 5. Database Schema & Index Verification
log_info "Memeriksa dan menerapkan indeks database unik..."
if [ -f "${APP_DIR}/scripts/apply-indexes.ts" ]; then
    npx tsx scripts/apply-indexes.ts
    log_success "Indeks database terverifikasi."
else
    log_warn "Skrip scripts/apply-indexes.ts tidak ditemukan, melewati tahap ini."
fi

# 6. Next.js Production Build
log_info "Mengompilasi aplikasi Next.js (npm run build)..."
npm run build
log_success "Kompilasi build Next.js selesai tanpa error."

# 7. Port 80 & Nginx Service Management
if [ "$IS_PROD" = true ]; then
    log_info "Mode Production aktif: Memeriksa konflik port 80 dengan Nginx..."
    if systemctl is-active --quiet nginx; then
        log_warn "Nginx sedang berjalan pada port 80. Menghentikan service Nginx..."
        systemctl stop nginx
        log_success "Service Nginx dihentikan sementara agar Next.js dapat mengikat port 80."
    fi
else
    log_info "Mode Development aktif (Port 3000)..."
    if ! systemctl is-active --quiet nginx && systemctl list-unit-files nginx.service >/dev/null 2>&1; then
        log_info "Menyalakan kembali service Nginx untuk layanan web lainnya..."
        systemctl start nginx || log_warn "Gagal menyalakan Nginx, abaikan jika tidak digunakan."
    fi
fi

# 8. Systemd Service Unit Configuration
log_info "Memperbarui konfigurasi systemd service (${SERVICE_FILE})..."
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Surat Ijin Next.js Application (${MODE_LABEL})
After=network.target mariadb.service mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/npm start -- -H 0.0.0.0 -p ${PORT}
Restart=always
RestartSec=3s
KillMode=mixed
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

log_info "Memuat ulang konfigurasi systemd dan merestart service ${SERVICE_NAME}..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" --quiet
systemctl restart "$SERVICE_NAME"
log_success "Service ${SERVICE_NAME} berhasil direstart."

# 9. Post-Deployment Healthcheck
log_info "Menjalankan healthcheck verifikasi respon HTTP pada port ${PORT}..."
HEALTHCHECK_URL="http://127.0.0.1:${PORT}/login"
MAX_RETRIES=20
WAIT_SECONDS=2
HEALTH_PASSED=false

for ((i=1; i<=MAX_RETRIES; i++)); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTHCHECK_URL" || true)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "302" ]; then
        log_success "Healthcheck berhasil! Respon HTTP ${HTTP_CODE} dari ${HEALTHCHECK_URL}"
        HEALTH_PASSED=true
        break
    fi
    log_info "Percobaan ke-${i}/${MAX_RETRIES}: Respon '${HTTP_CODE}', menunggu ${WAIT_SECONDS} detik..."
    sleep "$WAIT_SECONDS"
done

if [ "$HEALTH_PASSED" = false ]; then
    log_error "Healthcheck gagal setelah ${MAX_RETRIES} percobaan! Menampilkan log service:"
    journalctl -u "$SERVICE_NAME" -n 25 --no-pager
    exit 1
fi

echo "=============================================================================="
log_success "DEPLOYMENT SELESAI & SUKSES!"
log_success "Aplikasi Surat Izin aktif pada: http://localhost:${PORT} (${MODE_LABEL})"
echo "=============================================================================="
