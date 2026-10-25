#!/usr/bin/env bash
# ==============================================================================
# Auto-Update Script: Surat Ijin Next.js (Git Safe Pull/Rebase & Auto-Deploy)
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

APP_DIR="/root/project/suratIjin"
SERVICE_FILE="/etc/systemd/system/surat-ijin.service"

if [ ! -d "$APP_DIR" ]; then
    log_error "Direktori ${APP_DIR} tidak ditemukan!"
    exit 1
fi

cd "$APP_DIR"

# 1. Determine Target Mode (Argument or Auto-Detect Active Port)
EXPLICIT_MODE="${1:-}"
if [ -n "$EXPLICIT_MODE" ]; then
    TARGET_MODE="$EXPLICIT_MODE"
elif [ -f "$SERVICE_FILE" ] && grep -q "PORT=80" "$SERVICE_FILE"; then
    TARGET_MODE="prod"
else
    TARGET_MODE="dev"
fi

log_info "Memulai proses pembaruan otomatis (Auto-Update)..."
log_info "Mode deployment target: ${TARGET_MODE}"

# 2. Git Status Check & Safe Rebase (git-rebase-conflict-resolver)
STASHED=false
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "initial")
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
log_info "Cabang Git lokal saat ini: ${CURRENT_BRANCH}"

HAS_REMOTE=false
if git remote | grep -q "^origin$"; then
    HAS_REMOTE=true
    log_info "Mengambil commit terbaru dari remote origin..."
    if git fetch origin; then
        if git show-ref --verify --quiet "refs/remotes/origin/${CURRENT_BRANCH}"; then
            REMOTE_COMMIT=$(git rev-parse "origin/${CURRENT_BRANCH}")
            LOCAL_COMMIT=$(git rev-parse HEAD)
            
            if [ "$REMOTE_COMMIT" != "$LOCAL_COMMIT" ]; then
                log_info "Commit baru ditemukan di remote (${REMOTE_COMMIT:0:7} vs lokal ${LOCAL_COMMIT:0:7})..."
                
                # Only stash when there are actual incoming commits to rebase
                if [ -n "$(git status --porcelain -uno)" ]; then
                    log_warn "Menyimpan perubahan lokal ke stash sebelum rebase..."
                    STASH_NAME="auto-update-backup-$(date +%s)"
                    git stash push -m "$STASH_NAME" -- ":!scripts"
                    STASHED=true
                fi

                log_info "Menerapkan commit terbaru via git pull --rebase origin ${CURRENT_BRANCH}..."
                if ! git pull --rebase origin "$CURRENT_BRANCH"; then
                    log_error "Konflik Git terdeteksi saat rebase! Membatalkan rebase untuk menjaga integritas data..."
                    git rebase --abort
                    if [ "$STASHED" = true ]; then
                        log_info "Memulihkan perubahan stash lokal..."
                        git stash pop || true
                    fi
                    exit 1
                fi
                log_success "Git rebase berhasil diselesaikan tanpa konflik."

                if [ "$STASHED" = true ]; then
                    log_info "Mengembalikan perubahan lokal dari stash..."
                    git stash pop || log_warn "Periksa git status untuk penyesuaian stash."
                    STASHED=false
                fi
            else
                log_info "Kode lokal sudah mutakhir dengan origin/${CURRENT_BRANCH} (${LOCAL_COMMIT:0:7})."
            fi
        fi
    else
        log_warn "Gagal melakukan git fetch origin. Melanjutkan deployment dengan kode lokal..."
    fi
else
    log_info "Remote 'origin' belum terkonfigurasi. Melanjutkan deployment kode lokal..."
fi

# 4. Trigger Deployment Script
log_info "Mengeksekusi skrip deploy (${TARGET_MODE})..."
DEPLOY_SCRIPT="${APP_DIR}/scripts/deploy.sh"

if [ ! -x "$DEPLOY_SCRIPT" ]; then
    chmod +x "$DEPLOY_SCRIPT"
fi

if ! "$DEPLOY_SCRIPT" "$TARGET_MODE"; then
    log_error "Deployment gagal! Memulai proses rollback ke commit sebelumnya (${PREV_COMMIT:0:7})..."
    if [ "$PREV_COMMIT" != "initial" ] && [ "$HAS_REMOTE" = true ]; then
        git reset --hard "$PREV_COMMIT"
    fi
    if [ "$STASHED" = true ]; then
        git stash pop || true
    fi
    exit 1
fi

# 5. Restore Stash if was stashed
if [ "$STASHED" = true ]; then
    log_info "Mengembalikan perubahan lokal dari stash..."
    if ! git stash pop; then
        log_warn "Terdapat sedikit penyesuaian saat memulihkan stash. Cek git status."
    else
        log_success "Stash lokal berhasil dipulihkan."
    fi
fi

echo "=============================================================================="
log_success "PROSES AUTO-UPDATE BERHASIL SEPENUHNYA!"
echo "=============================================================================="
