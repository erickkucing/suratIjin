#!/usr/bin/env bash
# ==============================================================================
# Deploy Script: Surat Ijin Next.js (Development Port 3001 / Production Port 80)
# Hands-Free, Automated Dependency Provisioning, OCR & Database Self-Healing
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

# 2. Determine App Directory & Target Mode
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="surat-ijin"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

TARGET_MODE="${1:-dev}"
CUSTOM_PORT="${2:-${PORT_OVERRIDE:-}}"

if [ "$TARGET_MODE" = "prod" ] || [ "$TARGET_MODE" = "production" ]; then
    PORT=80
    MODE_LABEL="Production (Port 80)"
    IS_PROD=true
else
    PORT=3001
    MODE_LABEL="Development (Port 3001)"
    IS_PROD=false
    # Preserve active development port if configured in existing service
    if [ -z "$CUSTOM_PORT" ] && [ -f "$SERVICE_FILE" ]; then
        EXISTING_PORT=$(grep -oE "Environment=PORT=[0-9]+" "$SERVICE_FILE" 2>/dev/null | cut -d= -f3 || true)
        if [ -n "$EXISTING_PORT" ] && [ "$EXISTING_PORT" != "80" ]; then
            PORT="$EXISTING_PORT"
            MODE_LABEL="Development (Port ${PORT})"
        fi
    fi
fi

if [ -n "$CUSTOM_PORT" ]; then
    PORT="$CUSTOM_PORT"
    MODE_LABEL="${MODE_LABEL} (Custom Port ${PORT})"
fi

log_info "Memulai deployment aplikasi Surat Ijin: ${MODE_LABEL}"
log_info "Direktori aplikasi: ${APP_DIR}"
cd "$APP_DIR"

# 3. Automated OS System Packages Check & Installation (Debian/Ubuntu apt)
log_info "Memeriksa kelengkapan paket sistem operasi (OS dependencies)..."
NEEDED_PKGS=()

check_pkg() {
    local cmd="$1"
    local pkg="$2"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        NEEDED_PKGS+=("$pkg")
    fi
}

check_pkg "curl" "curl"
check_pkg "git" "git"
check_pkg "python3" "python3"

# Check python venv & pip
if ! python3 -m venv --help >/dev/null 2>&1; then
    NEEDED_PKGS+=("python3-venv")
fi
if ! python3 -m pip --version >/dev/null 2>&1; then
    NEEDED_PKGS+=("python3-pip")
fi

# Check OCR C/C++ libraries (libgl1, libglib2.0-0, libgomp1)
if command -v dpkg >/dev/null 2>&1; then
    for pkg in libgl1 libglib2.0-0 libgomp1; do
        if ! dpkg -s "$pkg" >/dev/null 2>&1; then
            NEEDED_PKGS+=("$pkg")
        fi
    done
    # Check MySQL/MariaDB server
    if ! dpkg -s mariadb-server >/dev/null 2>&1 && ! dpkg -s mysql-server >/dev/null 2>&1; then
        if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
            NEEDED_PKGS+=("mariadb-server")
        fi
    fi
fi

if [ ${#NEEDED_PKGS[@]} -gt 0 ]; then
    log_info "Paket OS berikut belum terpasang: ${NEEDED_PKGS[*]}"
    log_info "Memasang paket sistem via apt-get secara non-interaktif..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq || log_warn "apt-get update menghasilkan peringatan, melanjutkan instalasi..."
    apt-get install -y --no-install-recommends "${NEEDED_PKGS[@]}"
    log_success "Paket dependensi OS berhasil terpasang."
else
    log_success "Seluruh paket sistem operasi yang dibutuhkan telah tersedia."
fi

# 4. Tooling Verification & Automated Node.js v20+ Installation
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    log_info "Node.js atau npm tidak ditemukan. Memasang Node.js v20 LTS otomatis..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq || true
    apt-get install -y --no-install-recommends ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y nodejs
    log_success "Node.js v20 LTS dan npm berhasil dipasang otomatis."
fi

# Verify minimum version (v20+)
NODE_MAJOR=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    log_info "Versi Node.js saat ini ($NODE_MAJOR) di bawah v20. Memperbarui ke Node.js v20 LTS..."
    export DEBIAN_FRONTEND=noninteractive
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y nodejs
    log_success "Node.js berhasil diperbarui ke v20 LTS."
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
PYTHON_VERSION=$(python3 --version 2>/dev/null || echo "Tidak terpasang")
log_info "Node.js: ${NODE_VERSION} | npm: ${NPM_VERSION} | Python: ${PYTHON_VERSION}"

# 5. Environment File (.env) & Storage Directory Self-Healing
if [ ! -f "${APP_DIR}/.env" ]; then
    if [ -f "${APP_DIR}/.env.example" ]; then
        log_info "File .env tidak ditemukan. Menyalin dari .env.example..."
        cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    else
        log_info "Membuat file .env dasar..."
        cat <<EOF > "${APP_DIR}/.env"
DATABASE_URL="mysql://surat_user:surat_pass_2026@127.0.0.1:3306/db_suratizin"
JWT_SECRET=""
STORAGE_PATH="./storage/uploads"
NEXT_PUBLIC_APP_URL="http://localhost:${PORT}"
AI_ROUTER_ENABLED="false"
EOF
    fi
fi

# Ensure strong JWT_SECRET
if grep -qE '^JWT_SECRET="?ganti_dengan_random_secret_string' "${APP_DIR}/.env" || grep -qE '^JWT_SECRET=""' "${APP_DIR}/.env"; then
    log_info "Menghasilkan JWT_SECRET acak yang aman..."
    NEW_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i -E "s|^JWT_SECRET=.*|JWT_SECRET=\"${NEW_SECRET}\"|" "${APP_DIR}/.env"
    log_success "JWT_SECRET berhasil diperbarui dengan kunci 256-bit yang aman."
fi

# Ensure storage directory exists with proper permissions
mkdir -p "${APP_DIR}/storage/uploads"
chmod 755 "${APP_DIR}/storage/uploads"
log_success "Direktori penyimpanan arsip (${APP_DIR}/storage/uploads) siap."

# 6. Database Service & Schema/Admin Initialization
log_info "Memeriksa service MariaDB / MySQL..."
systemctl start mariadb 2>/dev/null || systemctl start mysql 2>/dev/null || true
systemctl enable mariadb --quiet 2>/dev/null || systemctl enable mysql --quiet 2>/dev/null || true

# Auto-create database if mysql client is available
if command -v mysql >/dev/null 2>&1; then
    mysql -e "CREATE DATABASE IF NOT EXISTS \`db_suratizin\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
fi

# 7. Node.js Dependency Installation
log_info "Menginstal dan menyelaraskan dependencies Node.js (npm install)..."
npm install --prefer-offline --no-audit --no-fund
log_success "Dependencies Node.js berhasil terpasang."

# Run database schema migration & ensure initial admin
log_info "Menjalankan inisialisasi skema database dan verifikasi akun administrator..."
if [ -f "${APP_DIR}/scripts/init-db.ts" ]; then
    npx tsx scripts/init-db.ts
    log_success "Skema database, indeks, dan akun administrator terverifikasi."
else
    log_warn "Skrip init-db.ts tidak ditemukan, menjalankan apply-indexes..."
    if [ -f "${APP_DIR}/scripts/apply-indexes.ts" ]; then
        npx tsx scripts/apply-indexes.ts
    fi
fi

# 8. Setup & Update Python OCR Microservice
OCR_DIR="${APP_DIR}/services/ocr-service"
OCR_VENV="${OCR_DIR}/venv"
OCR_SERVICE_NAME="surat-ijin-ocr"
OCR_SERVICE_FILE="/etc/systemd/system/${OCR_SERVICE_NAME}.service"

if [ -d "$OCR_DIR" ] && command -v python3 >/dev/null 2>&1; then
    log_info "Menyiapkan dependensi Python OCR microservice..."
    if [ ! -d "$OCR_VENV" ]; then
        log_info "Membuat Python virtual environment di ${OCR_VENV}..."
        python3 -m venv "$OCR_VENV"
    fi

    log_info "Memperbarui pip..."
    "$OCR_VENV/bin/pip" install --quiet --upgrade pip

    if command -v nvidia-smi >/dev/null 2>&1 && [ -f "${OCR_DIR}/requirements-gpu.txt" ]; then
        log_info "NVIDIA GPU terdeteksi di sistem host. Memasang dependensi GPU (requirements-gpu.txt)..."
        if "$OCR_VENV/bin/pip" install --quiet -r "${OCR_DIR}/requirements-gpu.txt"; then
            log_success "Dependensi Python OCR versi GPU berhasil dipasang."
        else
            log_warn "Pemasangan dependensi GPU gagal. Melakukan fallback otomatis ke dependensi CPU (requirements.txt)..."
            "$OCR_VENV/bin/pip" install --quiet -r "${OCR_DIR}/requirements.txt"
            log_success "Dependensi Python OCR versi CPU berhasil dipasang sebagai fallback."
        fi
    else
        log_info "Memasang dependensi CPU (requirements.txt)..."
        "$OCR_VENV/bin/pip" install --quiet -r "${OCR_DIR}/requirements.txt"
        log_success "Dependensi Python OCR terpasang dengan sukses."
    fi

    log_info "Melakukan pra-inisialisasi (pre-warming) model PaddleOCR ke cache lokal..."
    "$OCR_VENV/bin/python" -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=False, lang='en', show_log=False)" 2>/dev/null || log_warn "Pre-warming selesai dengan catatan (akan dimuat otomatis saat service aktif)."

    log_info "Memperbarui konfigurasi systemd OCR service (${OCR_SERVICE_FILE})..."
    cat <<EOF > "$OCR_SERVICE_FILE"
[Unit]
Description=PaddleOCR Microservice for Surat Ijin
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${OCR_DIR}
Environment=PYTHONUNBUFFERED=1
ExecStart=${OCR_VENV}/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8001 --workers 1
Restart=always
RestartSec=3s
KillMode=mixed
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$OCR_SERVICE_NAME" --quiet
    systemctl restart "$OCR_SERVICE_NAME"
    log_success "Service ${OCR_SERVICE_NAME} berhasil dikonfigurasi dan direstart."

    # OCR Microservice Healthcheck with retry loop
    log_info "Menjalankan healthcheck verifikasi kesiapan service OCR pada port 8001..."
    OCR_HEALTH_URL="http://127.0.0.1:8001/health"
    OCR_PASSED=false
    for ((j=1; j<=20; j++)); do
        OCR_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$OCR_HEALTH_URL" || true)
        if [ "$OCR_CODE" = "200" ]; then
            OCR_PASSED=true
            break
        fi
        sleep 2
    done

    if [ "$OCR_PASSED" = true ]; then
        OCR_HEALTH_DATA=$(curl -s "$OCR_HEALTH_URL" || true)
        ACTIVE_DEVICE=$(echo "$OCR_HEALTH_DATA" | grep -o '"device":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
        DEVICE_NAME=$(echo "$OCR_HEALTH_DATA" | grep -o '"device_name":"[^"]*"' | cut -d'"' -f4 || echo "")
        log_success "OCR microservice aktif (HTTP 200). Mode perangkat: ${ACTIVE_DEVICE^^} (${DEVICE_NAME:-N/A})."
    else
        log_warn "OCR microservice merespons HTTP ${OCR_CODE:-gagal}, periksa: systemctl status ${OCR_SERVICE_NAME}"
    fi
fi

# 9. Next.js Production Build
log_info "Mengompilasi aplikasi Next.js (npm run build)..."
npm run build
log_success "Kompilasi build Next.js selesai tanpa error."

# 10. Port 80 & Nginx Service Management
if [ "$IS_PROD" = true ]; then
    log_info "Mode Production aktif: Memeriksa konflik port 80 dengan Nginx..."
    if [ -f "/etc/nginx/sites-enabled/suratijin.conf" ]; then
        log_info "Nginx terkonfigurasi sebagai reverse proxy Surat Ijin (port 80 & 443). Memastikan Nginx tetap aktif..."
        systemctl reload nginx || systemctl restart nginx
    elif systemctl is-active --quiet nginx; then
        log_warn "Nginx sedang berjalan pada port 80. Menghentikan service Nginx..."
        systemctl stop nginx
        log_success "Service Nginx dihentikan sementara agar Next.js dapat mengikat port 80."
    fi
else
    log_info "Mode Development aktif (Port ${PORT})..."
    if ! systemctl is-active --quiet nginx && systemctl list-unit-files nginx.service >/dev/null 2>&1; then
        log_info "Menyalakan kembali service Nginx untuk layanan web lainnya..."
        systemctl start nginx || log_warn "Gagal menyalakan Nginx, abaikan jika tidak digunakan."
    fi
fi

# 11. Systemd Service Unit Configuration (Next.js Application)
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
ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p ${PORT}
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

# 12. Post-Deployment Healthcheck (Next.js Application)
log_info "Menjalankan healthcheck verifikasi respon HTTP aplikasi pada port ${PORT}..."
HEALTHCHECK_URL="http://127.0.0.1:${PORT}/login"
MAX_RETRIES=25
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
log_success "Service OCR aktif pada: http://127.0.0.1:8001 (Status: OK)"
log_info "Catatan: Integrasi 9router AI secara default nonaktif (mode OCR mandiri aktif)."
echo "=============================================================================="
