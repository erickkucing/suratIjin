#!/usr/bin/env bash
# ==============================================================================
# Setup Cloudflare Tunnel Script: Surat Ijin Next.js
# Auto-installs cloudflared daemon, configures systemd service token,
# and syncs Next.js ALLOWED_ORIGINS & NEXT_PUBLIC_APP_URL
# ==============================================================================
set -euo pipefail

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
    log_error "Skrip ini memerlukan hak akses root. Jalankan dengan sudo atau sebagai root."
    exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# 2. Detect Local Next.js Backend Port
DEFAULT_PORT=3001
if [ -f "/etc/systemd/system/surat-ijin.service" ]; then
    DETECTED_PORT=$(grep -oE "Environment=PORT=[0-9]+" "/etc/systemd/system/surat-ijin.service" 2>/dev/null | cut -d= -f3 || true)
    if [ -n "$DETECTED_PORT" ]; then
        DEFAULT_PORT="$DETECTED_PORT"
    fi
fi

# 3. Parse CLI Flags
TUNNEL_TOKEN=""
DOMAIN=""
BACKEND_PORT="$DEFAULT_PORT"

for arg in "$@"; do
    case "$arg" in
        --token=*)
            TUNNEL_TOKEN="${arg#*=}"
            ;;
        --domain=*)
            DOMAIN="${arg#*=}"
            ;;
        --port=*)
            BACKEND_PORT="${arg#*=}"
            ;;
        --help|-h)
            echo "Penggunaan: sudo ./scripts/setup-cloudflare-tunnel.sh [OPSI]"
            echo ""
            echo "Opsi:"
            echo "  --token=<tunnel_token>   Cloudflare Tunnel Connector Token (dari dashboard Zero Trust)"
            echo "  --domain=<nama_domain>   Domain publik (contoh: suratijin.sekolah.sch.id)"
            echo "  --port=<port>            Port aplikasi Next.js lokal (default: ${DEFAULT_PORT})"
            echo "  --help, -h               Tampilkan bantuan ini"
            exit 0
            ;;
    esac
done

echo "=============================================================================="
echo "      SETUP & AKTIVASI CLOUDFLARE TUNNEL (HTTPS) - SURAT IJIN NEXT.JS        "
echo "=============================================================================="

# 4. Check & Install cloudflared binary
if ! command -v cloudflared >/dev/null 2>&1; then
    log_info "Paket cloudflared belum terpasang. Mengunduh paket resmi dari Cloudflare..."
    
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64)
            PKG_ARCH="amd64"
            ;;
        aarch64|arm64)
            PKG_ARCH="arm64"
            ;;
        armv7l|armhf)
            PKG_ARCH="arm"
            ;;
        *)
            PKG_ARCH="amd64"
            ;;
    esac

    DEB_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${PKG_ARCH}.deb"
    TEMP_DEB="/tmp/cloudflared.deb"

    log_info "Mengunduh ${DEB_URL}..."
    if curl -sSL -o "$TEMP_DEB" "$DEB_URL"; then
        dpkg -i "$TEMP_DEB" || apt-get install -f -y
        rm -f "$TEMP_DEB"
        log_success "Paket cloudflared berhasil dipasang: $(cloudflared --version)"
    else
        log_error "Gagal mengunduh paket cloudflared dari GitHub."
        exit 1
    fi
else
    log_success "Paket cloudflared sudah terpasang: $(cloudflared --version)"
fi

# 5. Interactive Input (jika belum via flag)
if [ -z "$DOMAIN" ]; then
    echo ""
    echo -e "${COLOR_INFO}Masukkan nama domain publik untuk aplikasi Surat Ijin di Cloudflare:${COLOR_RESET}"
    read -r -p "Domain [contoh: suratijin.sekolah.sch.id]: " INPUT_DOMAIN
    DOMAIN="${INPUT_DOMAIN:-suratijin.sekolah.sch.id}"
fi

if [ -z "$TUNNEL_TOKEN" ]; then
    echo ""
    echo -e "${COLOR_INFO}Masukkan Tunnel Connector Token dari Cloudflare Zero Trust Dashboard:${COLOR_RESET}"
    echo "(Buka Cloudflare Zero Trust > Networks > Tunnels > Buat Tunnel > Salin Token setelah 'cloudflared service install ...')"
    read -r -p "Token: " INPUT_TOKEN
    TUNNEL_TOKEN="${INPUT_TOKEN:-}"
fi

if [ -z "$TUNNEL_TOKEN" ]; then
    log_error "Tunnel Token tidak boleh kosong. Harap salin token dari Cloudflare Zero Trust Dashboard."
    exit 1
fi

# 6. Install & Configure cloudflared systemd service
log_info "Mengonfigurasi service cloudflared dengan token..."
if systemctl is-active --quiet cloudflared; then
    log_warn "Service cloudflared sedang berjalan. Menghentikan untuk pembaruan service..."
    systemctl stop cloudflared
    cloudflared service uninstall 2>/dev/null || true
fi

cloudflared service install "$TUNNEL_TOKEN"
systemctl daemon-reload
systemctl enable cloudflared --quiet
systemctl restart cloudflared

if systemctl is-active --quiet cloudflared; then
    log_success "Service cloudflared berhasil aktif dan terhubung ke Cloudflare Edge!"
else
    log_error "Service cloudflared gagal dijalankan. Periksa: systemctl status cloudflared"
    exit 1
fi

# 7. Update .env Configuration
if [ -f "${APP_DIR}/.env" ]; then
    log_info "Menyelaraskan konfigurasi .env dengan domain publik..."
    
    # Update NEXT_PUBLIC_APP_URL
    sed -i -E "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=\"https://${DOMAIN}\"|" "${APP_DIR}/.env"
    
    # Update or add ALLOWED_ORIGINS
    if grep -qE '^ALLOWED_ORIGINS=' "${APP_DIR}/.env"; then
        sed -i -E "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=\"${DOMAIN},localhost:${BACKEND_PORT},127.0.0.1:${BACKEND_PORT}\"|" "${APP_DIR}/.env"
    else
        echo "ALLOWED_ORIGINS=\"${DOMAIN},localhost:${BACKEND_PORT},127.0.0.1:${BACKEND_PORT}\"" >> "${APP_DIR}/.env"
    fi
    log_success ".env berhasil diperbarui (NEXT_PUBLIC_APP_URL: https://${DOMAIN})."
fi

# 8. Restart Next.js Service
log_info "Memuat ulang service Next.js agar membaca variabel lingkungan baru..."
systemctl restart surat-ijin
log_success "Service surat-ijin berhasil direstart."

echo ""
echo "=============================================================================="
log_success "SETUP CLOUDFLARE TUNNEL BERHASIL!"
echo "=============================================================================="
echo -e "${COLOR_INFO}PANDUAN TERAKHIR DI DASHBOARD CLOUDFLARE:${COLOR_RESET}"
echo "1. Buka dash.cloudflare.com > Zero Trust > Networks > Tunnels"
echo "2. Pilih Tunnel Anda > Tab 'Public Hostname' > Klik 'Add a public hostname'"
echo "3. Isi konfigurasi rute:"
echo "   - Subdomain & Domain : ${DOMAIN}"
echo "   - Service Type       : HTTP"
echo "   - URL                : localhost:${BACKEND_PORT}"
echo "4. Simpan (Save Hostname)."
echo ""
echo -e "${COLOR_SUCCESS}Aplikasi Surat Izin kini dapat diakses secara publik dengan HTTPS otomatis:${COLOR_RESET}"
echo "  --> https://${DOMAIN}"
echo "=============================================================================="
