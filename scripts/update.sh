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

print_git_deploy_summary() {
    local prev_ref="${1:-}"
    
    # Pastikan berada di repositori git
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

# 0. Root / Sudo Privilege Elevation
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        log_info "Mengeksekusi auto-update dengan hak akses sudo..."
        exec sudo "$0" "$@"
    else
        log_error "Skrip update memerlukan hak akses root atau sudo (untuk mengelola systemd service dan port)."
        exit 1
    fi
fi

APP_DIR="$(readlink -f "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)")"
SERVICE_FILE="/etc/systemd/system/surat-ijin.service"

if [ ! -d "$APP_DIR" ]; then
    log_error "Direktori ${APP_DIR} tidak ditemukan!"
    exit 1
fi

cd "$APP_DIR"

# Pastikan git safe.directory diizinkan untuk direktori instalasi dan path alternatif
for d in "$APP_DIR" "/opt/surat-ijin" "/root/project/suratIjin"; do
    if [ -d "$d/.git" ]; then
        git config --global --add safe.directory "$d" 2>/dev/null || true
    fi
done

# 1. Determine Target Mode & Custom Port
EXPLICIT_MODE="${1:-}"
CUSTOM_PORT="${2:-}"

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
if git remote 2>/dev/null | grep -q "^origin$"; then
    HAS_REMOTE=true
    log_info "Mengambil commit terbaru dari remote origin..."
    if git fetch origin; then
        if git show-ref --verify --quiet "refs/remotes/origin/${CURRENT_BRANCH}"; then
            INCOMING_COMMITS=$(git rev-list --count "HEAD..origin/${CURRENT_BRANCH}" 2>/dev/null || echo "0")
            
            if [ "$INCOMING_COMMITS" -gt 0 ]; then
                log_info "Ditemukan ${INCOMING_COMMITS} commit baru di remote origin/${CURRENT_BRANCH}..."
                
                # Stash tracked working tree changes before rebase
                if [ -n "$(git status --porcelain -uno)" ]; then
                    log_warn "Menyimpan perubahan lokal ke stash sebelum rebase..."
                    STASH_NAME="auto-update-backup-$(date +%s)"
                    git stash push -m "$STASH_NAME"
                    STASHED=true
                fi

                log_info "Menerapkan commit terbaru via git pull --rebase origin ${CURRENT_BRANCH}..."
                if ! git pull --rebase origin "$CURRENT_BRANCH"; then
                    log_error "Konflik Git terdeteksi saat rebase! Membatalkan rebase untuk menjaga integritas data..."
                    git rebase --abort 2>/dev/null || true
                    if [ "$STASHED" = true ]; then
                        log_info "Memulihkan perubahan stash lokal..."
                        git stash pop 2>/dev/null || true
                    fi
                    exit 1
                fi
                log_success "Git rebase berhasil diselesaikan tanpa konflik."

                if [ "$STASHED" = true ]; then
                    log_info "Mengembalikan perubahan lokal dari stash..."
                    git stash pop 2>/dev/null || log_warn "Periksa git status untuk penyesuaian stash."
                    STASHED=false
                fi
            else
                LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "HEAD")
                log_info "Kode lokal sudah mutakhir dengan origin/${CURRENT_BRANCH} (${LOCAL_COMMIT:0:7}, tidak ada commit baru di remote)."
            fi
        fi
    else
        log_warn "Gagal melakukan git fetch origin. Melanjutkan deployment dengan kode lokal..."
    fi
else
    log_info "Remote 'origin' belum terkonfigurasi. Melanjutkan deployment kode lokal..."
fi

# 3. Trigger Deployment Script
log_info "Mengeksekusi skrip deploy (${TARGET_MODE})..."
DEPLOY_SCRIPT="${APP_DIR}/scripts/deploy.sh"

if [ ! -x "$DEPLOY_SCRIPT" ]; then
    chmod +x "$DEPLOY_SCRIPT"
fi

DEPLOY_ARGS=("$TARGET_MODE")
if [ -n "$CUSTOM_PORT" ]; then
    DEPLOY_ARGS+=("$CUSTOM_PORT")
fi

export CALLED_FROM_UPDATE=true
if ! "$DEPLOY_SCRIPT" "${DEPLOY_ARGS[@]}"; then
    log_error "Deployment gagal! Memulai proses rollback ke commit sebelumnya (${PREV_COMMIT:0:7})..."
    if [ "$PREV_COMMIT" != "initial" ] && [ "$HAS_REMOTE" = true ]; then
        git reset --hard "$PREV_COMMIT"
    fi
    if [ "$STASHED" = true ]; then
        git stash pop || true
    fi
    exit 1
fi

# 4. Restore Stash if was stashed
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

# 5. Display Git Deployment & Commit Status Banner
print_git_deploy_summary "$PREV_COMMIT"
