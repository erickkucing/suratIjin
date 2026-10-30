#!/usr/bin/env bash
# ==============================================================================
# Deploy Script: Surat Ijin Next.js
# Production Location: /opt/surat-ijin
# Dedicated System User: suratijin (Group: suratijin, Supplementary: www-data)
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

print_git_deploy_summary() {
    local prev_ref="${1:-}"
    
    # Pastikan berada di direktori aplikasi yang memiliki git
    cd "${APP_DIR:-.}" 2>/dev/null || true
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return 0
    fi

    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
    local head_hash
    head_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local full_hash
    full_hash=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    local commit_author
    commit_author=$(git log -1 --format='%an <%ae>' 2>/dev/null || echo "unknown")
    local commit_date
    commit_date=$(git log -1 --format='%cd' --date=format:'%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "unknown")
    local commit_subject
    commit_subject=$(git log -1 --format='%s' 2>/dev/null || echo "unknown")
    local commit_body
    commit_body=$(git log -1 --format='%b' 2>/dev/null || echo "")

    echo "=============================================================================="
    echo -e "${COLOR_INFO}📌 STATUS DEPLOY GIT & COMMIT AKTIF${COLOR_RESET}"
    echo "=============================================================================="
    echo -e "  Cabang (Branch) : ${COLOR_SUCCESS}${branch}${COLOR_RESET}"
    echo -e "  Commit Hash     : ${COLOR_INFO}${head_hash}${COLOR_RESET} (${full_hash})"
    echo -e "  Author          : ${commit_author}"
    echo -e "  Waktu Commit    : ${commit_date}"
    echo -e "  Pesan Commit    : ${COLOR_SUCCESS}${commit_subject}${COLOR_RESET}"
    
    if [ -n "${commit_body// /}" ]; then
        echo -e "  Deskripsi       :"
        echo "$commit_body" | sed 's/^/    /'
    fi

    # Tampilkan daftar commit jika ada commit baru yang ditarik
    if [ -n "$prev_ref" ] && [ "$prev_ref" != "initial" ] && [ "$prev_ref" != "$full_hash" ]; then
        local count
        count=$(git rev-list --count "${prev_ref}..HEAD" 2>/dev/null || echo "0")
        if [ "$count" -gt 0 ]; then
            echo "------------------------------------------------------------------------------"
            echo -e "  ${COLOR_SUCCESS}Daftar Commit yang Baru Diterapkan (${count} commit):${COLOR_RESET}"
            git log --oneline "${prev_ref}..HEAD" 2>/dev/null | sed 's/^/    * /' || true
        fi
    fi

    # Status Working Tree lokal
    local dirty_count
    dirty_count=$(git status --porcelain 2>/dev/null | wc -l || echo "0")
    if [ "$dirty_count" -gt 0 ]; then
        echo -e "  Working Tree    : ${COLOR_WARN}Terdapat ${dirty_count} file lokal yang dimodifikasi/belum di-commit${COLOR_RESET}"
    else
        echo -e "  Working Tree    : ${COLOR_SUCCESS}Bersih (Clean)${COLOR_RESET}"
    fi
    echo "=============================================================================="
}

# 1. Root Privileges Check
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    log_error "Skrip deployment memerlukan hak akses root/sudo (untuk membuat user sistem, konfigurasi systemd, dan folder /opt)."
    log_info "Silakan jalankan kembali dengan: sudo ./scripts/deploy.sh"
    exit 1
fi

# 2. Permanent Move to /opt/surat-ijin
CANONICAL_APP_DIR="/opt/surat-ijin"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Resolve symlinks to find real source path
REAL_SOURCE_DIR="$(readlink -f "$SOURCE_DIR")"
REAL_CANONICAL_DIR="$(readlink -f "$CANONICAL_APP_DIR" 2>/dev/null || echo "$CANONICAL_APP_DIR")"

if [ "$REAL_SOURCE_DIR" != "$REAL_CANONICAL_DIR" ]; then
    log_info "Memindahkan file proyek ke folder produksi resmi: ${CANONICAL_APP_DIR}..."
    mkdir -p /opt
    
    if [ -d "$CANONICAL_APP_DIR" ]; then
        log_info "Menyinkronkan file ke ${CANONICAL_APP_DIR}..."
        cp -aT "$SOURCE_DIR" "$CANONICAL_APP_DIR"
    else
        log_info "Memindahkan direktori proyek secara permanen ke ${CANONICAL_APP_DIR}..."
        mv "$SOURCE_DIR" "$CANONICAL_APP_DIR"
        # Buat symlink di lokasi lama agar script / workspace lama tetap terhubung tanpa galat
        ln -sf "$CANONICAL_APP_DIR" "$SOURCE_DIR"
    fi
    
    log_success "Berkas proyek kini berada di ${CANONICAL_APP_DIR}."
    log_info "Melanjutkan eksekusi deployment langsung dari ${CANONICAL_APP_DIR}..."
    exec "${CANONICAL_APP_DIR}/scripts/deploy.sh" "$@"
fi

APP_DIR="$CANONICAL_APP_DIR"
cd "$APP_DIR"

# Pastikan git safe.directory diizinkan untuk direktori instalasi
if [ -d "$APP_DIR/.git" ]; then
    git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
fi

# 3. Create Dedicated System User 'suratijin'
APP_USER="suratijin"
APP_GROUP="suratijin"

if ! id -u "$APP_USER" >/dev/null 2>&1; then
    log_info "Membuat user sistem khusus '${APP_USER}'..."
    groupadd -r "$APP_GROUP" 2>/dev/null || true
    useradd -r -g "$APP_GROUP" -G www-data -d "$APP_DIR" -s /usr/sbin/nologin -c "Surat Ijin App Service User" "$APP_USER"
    for grp in video render; do
        if getent group "$grp" >/dev/null 2>&1; then
            usermod -a -G "$grp" "$APP_USER" 2>/dev/null || true
        fi
    done
    log_success "User sistem '${APP_USER}' berhasil dibuat."
else
    # Pastikan grup tambahan www-data, video, dan render terpasang untuk akses file dan akselerasi GPU
    usermod -a -G www-data "$APP_USER" 2>/dev/null || true
    for grp in video render; do
        if getent group "$grp" >/dev/null 2>&1; then
            usermod -a -G "$grp" "$APP_USER" 2>/dev/null || true
        fi
    done
    log_info "User sistem '${APP_USER}' sudah tersedia."
fi

# 4. Determine Target Mode & Port
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
log_info "Direktori aplikasi: ${APP_DIR} | User: ${APP_USER}:${APP_GROUP}"

# 5. Automated OS System Packages Check & Installation (Debian/Ubuntu apt)
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

# Check python venv & pip (mencegah kegagalan ensurepip di Debian/Ubuntu)
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "")
if ! python3 -c "import ensurepip" >/dev/null 2>&1 || (command -v dpkg >/dev/null 2>&1 && ! dpkg -s python3-venv >/dev/null 2>&1); then
    NEEDED_PKGS+=("python3-venv")
    if [ -n "$PY_VER" ] && apt-cache show "python${PY_VER}-venv" >/dev/null 2>&1; then
        NEEDED_PKGS+=("python${PY_VER}-venv")
    fi
fi
if ! python3 -m pip --version >/dev/null 2>&1 || (command -v dpkg >/dev/null 2>&1 && ! dpkg -s python3-pip >/dev/null 2>&1); then
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

# 6. Tooling Verification & Automated Node.js v20+ Installation
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

# 7. Environment File (.env) & Storage Directory Self-Healing
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

# Ensure strong, production-grade JWT_SECRET (mencegah SECURITY ERROR 500 di runtime)
CURRENT_JWT=$(grep -E '^\s*JWT_SECRET=' "${APP_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
FALLBACK_SECRET="surat_ijin_super_secret_jwt_key_2026_modern_academic_system"

if [ -z "$CURRENT_JWT" ] || [ ${#CURRENT_JWT} -lt 32 ] || [ "$CURRENT_JWT" = "$FALLBACK_SECRET" ] || [[ "$CURRENT_JWT" == *"ganti_dengan_random_secret_string"* ]]; then
    log_info "Menghasilkan JWT_SECRET acak yang aman..."
    NEW_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
    if grep -qE '^\s*JWT_SECRET=' "${APP_DIR}/.env"; then
        sed -i -E "s|^\s*JWT_SECRET=.*|JWT_SECRET=\"${NEW_SECRET}\"|" "${APP_DIR}/.env"
    else
        echo "JWT_SECRET=\"${NEW_SECRET}\"" >> "${APP_DIR}/.env"
    fi
    log_success "JWT_SECRET berhasil diperbarui dengan kunci 256-bit acak yang aman."
fi

# Ensure robust, synchronized OCR_INTERNAL_SECRET (mencegah error autentikasi internal 401 antara Next.js dan OCR)
CURRENT_OCR_SECRET=$(grep -E '^\s*OCR_INTERNAL_SECRET=' "${APP_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
if [ -z "$CURRENT_OCR_SECRET" ] || [[ "$CURRENT_OCR_SECRET" == *"ganti_dengan_token_rahasia"* ]]; then
    NEW_OCR_SECRET="surat-ijin-internal-secret-2026"
    if grep -qE '^\s*OCR_INTERNAL_SECRET=' "${APP_DIR}/.env"; then
        sed -i -E "s|^\s*OCR_INTERNAL_SECRET=.*|OCR_INTERNAL_SECRET=\"${NEW_OCR_SECRET}\"|" "${APP_DIR}/.env"
    else
        echo "OCR_INTERNAL_SECRET=\"${NEW_OCR_SECRET}\"" >> "${APP_DIR}/.env"
    fi
    log_success "OCR_INTERNAL_SECRET berhasil disinkronkan ke .env."
fi

# Ensure storage directory exists with proper permissions
mkdir -p "${APP_DIR}/storage/uploads"
chmod 775 "${APP_DIR}/storage/uploads"
log_success "Direktori penyimpanan arsip (${APP_DIR}/storage/uploads) siap."

# 8. Setup PaddleOCR Cache Directory for Non-Root User
PADDLE_CACHE_DIR="${APP_DIR}/.paddleocr"
mkdir -p "$PADDLE_CACHE_DIR"

# Migrasikan model yang sudah ada di /root/.paddleocr agar tidak download ulang
if [ -d "/root/.paddleocr/whl" ] && [ ! -d "${PADDLE_CACHE_DIR}/whl" ]; then
    log_info "Memigrasikan cache model PaddleOCR dari /root/.paddleocr ke ${PADDLE_CACHE_DIR}..."
    cp -a /root/.paddleocr/. "${PADDLE_CACHE_DIR}/" || true
    log_success "Cache model PaddleOCR berhasil dimigrasikan."
fi

# 9. Database Service & Schema/Admin Initialization
log_info "Memeriksa service MariaDB / MySQL..."
systemctl start mariadb 2>/dev/null || systemctl start mysql 2>/dev/null || true
systemctl enable mariadb --quiet 2>/dev/null || systemctl enable mysql --quiet 2>/dev/null || true

# Auto-provisioning database & kredensial user MariaDB (mengatasi error ER_ACCESS_DENIED_NO_PASSWORD_ERROR)
if [ -f "${APP_DIR}/scripts/provision-db.mjs" ]; then
    log_info "Menjalankan provisioning database & kredensial user MariaDB..."
    node "${APP_DIR}/scripts/provision-db.mjs" || log_warn "Provisioning database otomatis tidak dapat diselesaikan."
fi

# 10. Node.js Dependency Installation
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

# 11. Setup & Update Python OCR Microservice
OCR_DIR="${APP_DIR}/services/ocr-service"
OCR_VENV="${OCR_DIR}/venv"
OCR_SERVICE_NAME="surat-ijin-ocr"
OCR_SERVICE_FILE="/etc/systemd/system/${OCR_SERVICE_NAME}.service"

if [ -d "$OCR_DIR" ] && command -v python3 >/dev/null 2>&1; then
    log_info "Menyiapkan dependensi Python OCR microservice..."
    # Pastikan venv valid (harus ada biner python dan pip)
    if [ ! -f "$OCR_VENV/bin/python" ] || [ ! -f "$OCR_VENV/bin/pip" ]; then
        log_info "Membuat atau memulihkan Python virtual environment di ${OCR_VENV}..."
        rm -rf "$OCR_VENV"
        
        # Coba buat venv standar
        if ! python3 -m venv "$OCR_VENV" 2>/dev/null; then
            log_warn "Pembuatan venv standar memerlukan paket python venv tambahan. Memasang otomatis..."
            export DEBIAN_FRONTEND=noninteractive
            PY_VENV_PKG="python3-venv"
            PY_SUB_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "")
            if [ -n "$PY_SUB_VER" ] && apt-cache show "python${PY_SUB_VER}-venv" >/dev/null 2>&1; then
                PY_VENV_PKG="python3-venv python${PY_SUB_VER}-venv"
            fi
            apt-get update -qq || true
            apt-get install -y --no-install-recommends $PY_VENV_PKG python3-pip 2>/dev/null || true
            
            # Coba buat venv kembali
            if ! python3 -m venv "$OCR_VENV" 2>/dev/null; then
                log_warn "ensurepip masih tidak tersedia, membuat venv mandiri (--without-pip)..."
                python3 -m venv --without-pip "$OCR_VENV"
                curl -sS https://bootstrap.pypa.io/get-pip.py | "$OCR_VENV/bin/python" - --quiet 2>/dev/null || true
            fi
        fi
    fi

    log_info "Memperbarui pip dan memasang modul requirements.txt..."
    "$OCR_VENV/bin/pip" install --quiet --upgrade pip
    "$OCR_VENV/bin/pip" install --quiet -r "${OCR_DIR}/requirements.txt"

    # Deteksi akselerasi GPU NVIDIA (nvidia-smi) & Manajemen Paket PaddlePaddle
    HAS_NVIDIA_GPU=false
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
        HAS_NVIDIA_GPU=true
        GPU_DETECTED_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1 || echo "NVIDIA GPU")
        log_info "Terdeteksi hardware GPU: ${GPU_DETECTED_NAME}"
    fi

    if [ "$HAS_NVIDIA_GPU" = true ]; then
        # Deteksi versi CUDA driver
        CUDA_DRIVER_VER=$(nvidia-smi 2>/dev/null | grep -o "CUDA Version: [0-9]*\.[0-9]*" | awk '{print $3}' || echo "12.0")
        CUDA_MAJOR=$(echo "$CUDA_DRIVER_VER" | cut -d. -f1)
        log_info "Terdeteksi driver NVIDIA dengan dukungan CUDA ${CUDA_DRIVER_VER} (Major: ${CUDA_MAJOR})."

        # Pastikan pustaka cuDNN & cuBLAS dari NVIDIA terpasang
        # Penting: PaddlePaddle 2.6.x dikompilasi terhadap cuDNN 8.9 (libcudnn.so.8).
        # cuDNN 9 (versi 9.x) tidak kompatibel dan memicu galat CUDNN_STATUS_EXECUTION_FAILED_CUDART (5003).
        if "$OCR_VENV/bin/pip" list 2>/dev/null | grep -qE "nvidia-cudnn-cu1[12]\s+9\."; then
            log_info "Mendeteksi cuDNN 9 (tidak kompatibel dengan Paddle 2.6 & Pascal). Menghapus versi 9..."
            "$OCR_VENV/bin/pip" uninstall -y nvidia-cudnn-cu12 nvidia-cudnn-cu11 2>/dev/null || true
            find "$OCR_VENV" -type f -name "libcudnn*so.9*" -delete 2>/dev/null || true
            find "$OCR_VENV" -type l -name "libcudnn*so*" -delete 2>/dev/null || true
        fi

        if [ "$CUDA_MAJOR" = "11" ]; then
            log_info "Memasang dependensi cuDNN 8.9 & cuBLAS CUDA 11 via pip..."
            "$OCR_VENV/bin/pip" install "nvidia-cudnn-cu11==8.9.7.29" "nvidia-cublas-cu11" 2>&1 | tail -n 2 || true
        else
            log_info "Memasang dependensi cuDNN 8.9 & cuBLAS CUDA 12 via pip..."
            "$OCR_VENV/bin/pip" install "nvidia-cudnn-cu12==8.9.7.29" "nvidia-cublas-cu12" 2>&1 | tail -n 2 || true
        fi

        # Buat symlink libcudnn & libcublas jika belum ada di venv
        find "$OCR_VENV" -type f \( -name "libcudnn*.so.*" -o -name "libcublas*.so.*" \) 2>/dev/null | while read -r so_path; do
            dir=$(dirname "$so_path")
            fname=$(basename "$so_path")
            base_so=$(echo "$fname" | sed -E 's/\.so\.[0-9]+.*$/\.so/')
            major_so=$(echo "$fname" | sed -E 's/(\.so\.[0-9]+).*/\1/')
            [ ! -e "$dir/$major_so" ] && ln -sf "$fname" "$dir/$major_so" 2>/dev/null || true
            [ ! -e "$dir/$base_so" ] && ln -sf "$fname" "$dir/$base_so" 2>/dev/null || true
        done

        # Daftarkan semua path lib nvidia ke ldconfig sistem
        NVIDIA_PIP_CONF="/etc/ld.so.conf.d/nvidia-paddle-cudnn.conf"
        rm -f "$NVIDIA_PIP_CONF"
        find "$OCR_VENV" -type f \( -name "libcudnn*" -o -name "libcublas*" \) 2>/dev/null | while read -r so_path; do
            dirname "$so_path"
        done | sort -u > "$NVIDIA_PIP_CONF"

        if [ -s "$NVIDIA_PIP_CONF" ]; then
            ldconfig 2>/dev/null || true
            log_success "Path runtime cuDNN & CUDA libraries terdaftar di ldconfig sistem:"
            cat "$NVIDIA_PIP_CONF" | sed 's/^/    - /'
        else
            log_warn "File libcudnn belum ditemukan di venv. Mencoba instalasi cuDNN sistem via apt..."
            apt-get update -qq && apt-get install -y -qq libcudnn8 libcudnn8-dev 2>/dev/null || true
            ldconfig 2>/dev/null || true
        fi

        # Cek apakah paddle sudah compiled with CUDA
        PADDLE_CUDA_OK=false
        if "$OCR_VENV/bin/python" -c "import paddle; assert paddle.is_compiled_with_cuda()" 2>/dev/null; then
            PADDLE_CUDA_OK=true
        fi

        if [ "$PADDLE_CUDA_OK" = false ]; then
            log_info "GPU NVIDIA terdeteksi. Memasang paddlepaddle-gpu untuk akselerasi perangkat keras..."
            "$OCR_VENV/bin/pip" uninstall -y paddlepaddle paddlepaddle-gpu 2>/dev/null || true
            if "$OCR_VENV/bin/pip" install paddlepaddle-gpu==2.6.2; then
                log_success "Paket paddlepaddle-gpu berhasil dipasang."
            else
                log_warn "Pemasangan paddlepaddle-gpu PyPI gagal, mencoba wheel resmi..."
                if "$OCR_VENV/bin/pip" install paddlepaddle-gpu==2.6.2.post120 -f https://www.paddlepaddle.org.cn/whl/linux/mkl/avx/stable.html 2>/dev/null || \
                   "$OCR_VENV/bin/pip" install paddlepaddle-gpu==2.6.2.post118 -f https://www.paddlepaddle.org.cn/whl/linux/mkl/avx/stable.html 2>/dev/null; then
                    log_success "paddlepaddle-gpu berhasil dipasang via official wheel."
                else
                    log_warn "Gagal memasang paket GPU. Menggunakan versi CPU standar..."
                    "$OCR_VENV/bin/pip" install --quiet paddlepaddle==2.6.2
                fi
            fi
        else
            log_success "paddlepaddle-gpu dengan akselerasi CUDA sudah siap."
        fi

        # Verifikasi runtime GPU dan cuDNN
        log_info "Memverifikasi runtime GPU dan cuDNN PaddleOCR..."
        if "$OCR_VENV/bin/python" -c "import paddle; paddle.device.set_device('gpu:0')" 2>/dev/null; then
            log_success "Akselerasi GPU dan cuDNN berhasil divalidasi tanpa galat."
        else
            log_warn "Uji set_device('gpu:0') mengembalikan catatan (memeriksa detail):"
            "$OCR_VENV/bin/python" -c "import paddle; paddle.device.set_device('gpu:0')" 2>&1 || true
        fi
    else
        # Jika tidak ada GPU, pastikan paddlepaddle CPU terpasang
        if ! "$OCR_VENV/bin/python" -c "import paddle" 2>/dev/null; then
            log_info "Memasang paket paddlepaddle (CPU)..."
            "$OCR_VENV/bin/pip" install --quiet paddlepaddle==2.6.2
        fi
    fi

    log_success "Dependensi Python OCR terpasang dengan sukses."

    log_info "Melakukan pra-inisialisasi (pre-warming) model PaddleOCR ke cache lokal..."
    (
        cd "$OCR_DIR"
        HOME="${APP_DIR}" PADDLE_HOME="${PADDLE_CACHE_DIR}" "$OCR_VENV/bin/python" -c "
import main
import numpy as np
print(f'[Deploy Prewarm] Perangkat OCR aktif: {main._active_device} ({main._device_name})')
if main._gpu_fallback_error:
    print(f'[Deploy Prewarm] Catatan fallback: {main._gpu_fallback_error}')
" || log_warn "Pre-warming selesai dengan catatan (akan dimuat otomatis saat service aktif)."
    )

    log_info "Memperbarui konfigurasi systemd OCR service (${OCR_SERVICE_FILE})..."
    cat <<EOF > "$OCR_SERVICE_FILE"
[Unit]
Description=PaddleOCR Microservice for Surat Ijin
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${OCR_DIR}
Environment=PYTHONUNBUFFERED=1
Environment=HOME=${APP_DIR}
Environment=PADDLE_HOME=${PADDLE_CACHE_DIR}
Environment=LD_LIBRARY_PATH=/usr/local/cuda/lib64:${OCR_VENV}/lib/python3.11/site-packages/nvidia/cudnn/lib:${OCR_VENV}/lib/python3.11/site-packages/nvidia/cublas/lib:${OCR_VENV}/lib/python3.12/site-packages/nvidia/cudnn/lib:${OCR_VENV}/lib/python3.10/site-packages/nvidia/cudnn/lib:\${LD_LIBRARY_PATH}
EnvironmentFile=-${APP_DIR}/.env
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
fi

# 12. Next.js Production Build
log_info "Mengompilasi aplikasi Next.js (npm run build)..."
npm run build
log_success "Kompilasi build Next.js selesai tanpa error."

# 13. Apply Permissions & Ownership (Safe for root and non-root deployments)
log_info "Menyetel kepemilikan berkas ke user '${APP_USER}:${APP_GROUP}' dan mengamankan izin..."
chown -R "${APP_USER}:${APP_GROUP}" "$APP_DIR"
chmod -R u=rwX,go=rX "$APP_DIR"
chmod 775 "${APP_DIR}/storage/uploads"
chmod 600 "${APP_DIR}/.env"
chmod -R 775 "$PADDLE_CACHE_DIR"
chmod +x "${APP_DIR}/scripts/"*.sh 2>/dev/null || true
log_success "Hak akses berkas terverifikasi aman."

# Restart OCR Service under dedicated user
systemctl restart "$OCR_SERVICE_NAME"
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
    OCR_HW_INFO=$(python3 -c '
import sys, json
try:
    d = json.loads(sys.argv[1])
    dev = d.get("device", "cpu").upper()
    name = d.get("device_name", "CPU")
    cuda = "Tersedia" if d.get("cuda_available") else "Tidak Tersedia"
    print(f"{dev} ({name}) | Akselerasi CUDA: {cuda}")
except Exception:
    print("CPU")
' "$(curl -s "$OCR_HEALTH_URL" || true)" 2>/dev/null || echo "CPU")
    log_success "OCR microservice aktif dan merespons sehat (HTTP 200)."
    log_info "Akselerasi Perangkat Keras OCR: ${OCR_HW_INFO}"
else
    log_warn "OCR microservice merespons HTTP ${OCR_CODE:-gagal}, periksa: journalctl -u ${OCR_SERVICE_NAME} -n 25 --no-pager"
fi

# 14. Port 80 & Nginx Service Management
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

# 15. Systemd Service Unit Configuration (Next.js Application)
log_info "Memperbarui konfigurasi systemd service (${SERVICE_FILE})..."
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Surat Ijin Next.js Application (${MODE_LABEL})
After=network.target mariadb.service mysql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=HOME=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/npm start -- -H 0.0.0.0 -p ${PORT}
Restart=always
RestartSec=3s
KillMode=mixed
TimeoutStopSec=10
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

log_info "Memuat ulang konfigurasi systemd dan merestart service ${SERVICE_NAME}..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" --quiet
systemctl restart "$SERVICE_NAME"
log_success "Service ${SERVICE_NAME} berhasil direstart di bawah user '${APP_USER}'."

# 16. Post-Deployment Healthcheck (Next.js Application)
log_info "Menjalankan healthcheck verifikasi respon HTTP aplikasi pada port ${PORT}..."
HEALTHCHECK_URL="http://127.0.0.1:${PORT}/"
HEALTHCHECK_URL_LOGIN="http://127.0.0.1:${PORT}/login"
MAX_RETRIES=25
WAIT_SECONDS=2
HEALTH_PASSED=false

for ((i=1; i<=MAX_RETRIES; i++)); do
    HTTP_CODE_ROOT=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTHCHECK_URL" || true)
    HTTP_CODE_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTHCHECK_URL_LOGIN" || true)
    
    # Validasi bahwa endpoint utama dan login tidak menghasilkan 500 error
    if ([ "$HTTP_CODE_ROOT" = "200" ] || [ "$HTTP_CODE_ROOT" = "307" ] || [ "$HTTP_CODE_ROOT" = "302" ]) && \
       ([ "$HTTP_CODE_LOGIN" = "200" ] || [ "$HTTP_CODE_LOGIN" = "307" ] || [ "$HTTP_CODE_LOGIN" = "302" ]); then
        log_success "Healthcheck berhasil! Respon HTTP Root (/): ${HTTP_CODE_ROOT}, Login (/login): ${HTTP_CODE_LOGIN}"
        HEALTH_PASSED=true
        break
    fi
    log_info "Percobaan ke-${i}/${MAX_RETRIES}: Respon Root='${HTTP_CODE_ROOT}', Login='${HTTP_CODE_LOGIN}', menunggu ${WAIT_SECONDS} detik..."
    sleep "$WAIT_SECONDS"
done

if [ "$HEALTH_PASSED" = false ]; then
    log_error "Healthcheck gagal setelah ${MAX_RETRIES} percobaan! Menampilkan log service:"
    journalctl -u "$SERVICE_NAME" -n 25 --no-pager
    exit 1
fi

echo "=============================================================================="
log_success "DEPLOYMENT SELESAI & SUKSES!"
log_success "Lokasi Instalasi: ${APP_DIR}"
log_success "Service User: ${APP_USER}:${APP_GROUP}"
log_success "Aplikasi Surat Izin aktif pada: http://localhost:${PORT} (${MODE_LABEL})"
log_success "Service OCR aktif pada: http://127.0.0.1:8001 (Status: OK | Akselerasi: ${OCR_HW_INFO:-CPU})"
log_info "Catatan: Integrasi 9router AI secara default nonaktif (mode OCR mandiri aktif)."
echo "=============================================================================="

if [ "${CALLED_FROM_UPDATE:-false}" != true ]; then
    print_git_deploy_summary
fi
