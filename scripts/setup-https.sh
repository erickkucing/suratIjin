#!/usr/bin/env bash
# ==============================================================================
# Setup HTTPS & SSL Script: Surat Ijin Next.js
# Supports: Let's Encrypt (Certbot), Custom Certificate, or Self-Signed (Default)
# Configures Nginx Reverse Proxy on Port 443 with Port 80 Redirect
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

NGINX_CONF_DIR="/etc/nginx"
SITE_AVAILABLE="${NGINX_CONF_DIR}/sites-available/suratijin.conf"
SITE_ENABLED="${NGINX_CONF_DIR}/sites-enabled/suratijin.conf"
SSL_CERT_DIR="/etc/ssl/certs"
SSL_KEY_DIR="/etc/ssl/private"
mkdir -p "$SSL_CERT_DIR" "$SSL_KEY_DIR"
chmod 700 "$SSL_KEY_DIR"

# Ensure Nginx is installed
if ! command -v nginx >/dev/null 2>&1; then
    log_info "Nginx belum terpasang. Menginstal nginx via apt-get..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y nginx
fi

# Detect Backend Port from service or .env
DEFAULT_PORT=3001
if [ -f "/etc/systemd/system/surat-ijin.service" ]; then
    DETECTED_PORT=$(grep -oE "Environment=PORT=[0-9]+" "/etc/systemd/system/surat-ijin.service" 2>/dev/null | cut -d= -f3 || true)
    if [ -n "$DETECTED_PORT" ]; then
        DEFAULT_PORT="$DETECTED_PORT"
    fi
fi

# 2. Parse CLI Options or Interactive Prompts
DOMAIN=""
SSL_CHOICE=""
CUSTOM_CERT_PATH=""
CUSTOM_KEY_PATH=""
CERTBOT_EMAIL=""
BACKEND_PORT="$DEFAULT_PORT"
AUTO_SKIP=false

for arg in "$@"; do
    case "$arg" in
        --domain=*)
            DOMAIN="${arg#*=}"
            ;;
        --ssl=*)
            SSL_CHOICE="${arg#*=}"
            ;;
        --cert=*)
            CUSTOM_CERT_PATH="${arg#*=}"
            ;;
        --key=*)
            CUSTOM_KEY_PATH="${arg#*=}"
            ;;
        --port=*)
            BACKEND_PORT="${arg#*=}"
            ;;
        --email=*)
            CERTBOT_EMAIL="${arg#*=}"
            ;;
        --self-signed|--skip)
            SSL_CHOICE="3"
            AUTO_SKIP=true
            ;;
        --help|-h)
            echo "Penggunaan: sudo ./scripts/setup-https.sh [OPSI]"
            echo ""
            echo "Opsi:"
            echo "  --domain=<nama_domain>     Domain FQDN (default: suratijin.sekolah.sch.id)"
            echo "  --ssl=<1|2|3|letsencrypt|custom|self-signed>"
            echo "  --cert=<path_crt>          Path file sertifikat (jika ssl=custom)"
            echo "  --key=<path_key>           Path file private key (jika ssl=custom)"
            echo "  --port=<port>              Port backend Next.js (default: ${DEFAULT_PORT})"
            echo "  --email=<email>            Email untuk notifikasi Let's Encrypt"
            echo "  --skip, --self-signed      Lewati pilihan dan otomatis gunakan Self-Signed"
            echo "  --help, -h                 Tampilkan bantuan ini"
            exit 0
            ;;
    esac
done

echo "=============================================================================="
echo "         AKTIVASI HTTPS & SSL - APLIKASI SURAT IJIN (NGINX PROXY)            "
echo "=============================================================================="

# Interactive Domain Prompt if not set
if [ -z "$DOMAIN" ]; then
    if [ "$AUTO_SKIP" = true ]; then
        DOMAIN="suratijin.sekolah.sch.id"
    else
        echo -e "${COLOR_INFO}Masukkan nama domain / FQDN untuk aplikasi Surat Ijin:${COLOR_RESET}"
        read -r -p "Domain [default: suratijin.sekolah.sch.id]: " INPUT_DOMAIN
        DOMAIN="${INPUT_DOMAIN:-suratijin.sekolah.sch.id}"
    fi
fi
log_info "Domain target: ${DOMAIN}"
log_info "Backend upstream port: http://127.0.0.1:${BACKEND_PORT}"

# Interactive SSL Choice Prompt if not set
if [ -z "$SSL_CHOICE" ]; then
    echo ""
    echo "Pilih alternatif penyedia SSL untuk HTTPS:"
    echo "  1) Let's Encrypt (Certbot - Otomatis via domain publik)"
    echo "  2) Custom SSL Certificate (Gunakan file .crt/.pem dan .key milik Anda)"
    echo "  3) Self-Signed Certificate (Default / Langsung jadi untuk intranet & lab)"
    echo ""
    read -r -p "Pilihan Anda [1/2/3, tekan Enter untuk skip/Self-Signed]: " INPUT_CHOICE
    SSL_CHOICE="${INPUT_CHOICE:-3}"
fi

case "$SSL_CHOICE" in
    1|letsencrypt|lets_encrypt)
        SSL_MODE="letsencrypt"
        ;;
    2|custom)
        SSL_MODE="custom"
        ;;
    *)
        SSL_MODE="self-signed"
        ;;
esac

CERT_FILE="${SSL_CERT_DIR}/suratijin.crt"
KEY_FILE="${SSL_KEY_DIR}/suratijin.key"

# 3. Handle SSL Generation based on Choice
if [ "$SSL_MODE" = "self-signed" ]; then
    log_info "Membuat sertifikat Self-Signed SSL (2048-bit RSA) untuk domain: ${DOMAIN}..."
    
    OPENSSL_CNF=$(mktemp /tmp/openssl_suratijin.XXXXXX.cnf)
    cat <<EOF > "$OPENSSL_CNF"
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = ID
ST = Jawa Timur
L = Surabaya
O = Sekolah
OU = IT Lab
CN = ${DOMAIN}

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${DOMAIN}
DNS.2 = localhost
DNS.3 = *.sekolah.sch.id
IP.1 = 127.0.0.1
EOF

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -config "$OPENSSL_CNF" 2>/dev/null

    rm -f "$OPENSSL_CNF"
    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"
    log_success "Sertifikat Self-Signed berhasil dibuat di ${CERT_FILE} (berlaku 365 hari)."

elif [ "$SSL_MODE" = "custom" ]; then
    if [ -z "$CUSTOM_CERT_PATH" ]; then
        read -r -p "Masukkan path lengkap file sertifikat (.crt/.pem): " CUSTOM_CERT_PATH
    fi
    if [ -z "$CUSTOM_KEY_PATH" ]; then
        read -r -p "Masukkan path lengkap file private key (.key): " CUSTOM_KEY_PATH
    fi

    if [ ! -f "$CUSTOM_CERT_PATH" ]; then
        log_error "File sertifikat tidak ditemukan di: ${CUSTOM_CERT_PATH}"
        exit 1
    fi
    if [ ! -f "$CUSTOM_KEY_PATH" ]; then
        log_error "File private key tidak ditemukan di: ${CUSTOM_KEY_PATH}"
        exit 1
    fi

    cp "$CUSTOM_CERT_PATH" "$CERT_FILE"
    cp "$CUSTOM_KEY_PATH" "$KEY_FILE"
    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"
    log_success "File sertifikat kustom berhasil disalin ke ${CERT_FILE}."

elif [ "$SSL_MODE" = "letsencrypt" ]; then
    log_info "Menyiapkan Let's Encrypt via Certbot..."
    if ! command -v certbot >/dev/null 2>&1; then
        log_info "Menginstal certbot dan python3-certbot-nginx..."
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y certbot python3-certbot-nginx
    fi

    # Create initial self-signed placeholder so Nginx starts smoothly before certbot runs
    if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
        openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
            -keyout "$KEY_FILE" -out "$CERT_FILE" \
            -subj "/CN=${DOMAIN}" 2>/dev/null
        chmod 644 "$CERT_FILE"
        chmod 600 "$KEY_FILE"
    fi
fi

# 4. Generate Nginx Virtual Host Configuration
log_info "Membuat konfigurasi Nginx reverse proxy (${SITE_AVAILABLE})..."
cat <<EOF > "$SITE_AVAILABLE"
# ==============================================================================
# Surat Ijin Next.js - Nginx Reverse Proxy Configuration (HTTPS + HTTP Redirect)
# Domain: ${DOMAIN} -> Upstream: 127.0.0.1:${BACKEND_PORT}
# ==============================================================================

# Server block HTTP (Port 80) -> Redirect ke HTTPS (Port 443)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Server block HTTPS (Port 443)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_FILE};
    ssl_certificate_key ${KEY_FILE};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL_SURAT:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Maximum file upload size for letters & roster import
    client_max_body_size 50M;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml image/svg+xml;

    # Reverse Proxy to Next.js Upstream
    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
    }

    # Direct static file caching for uploads
    location /uploads/ {
        alias ${APP_DIR}/storage/uploads/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        access_log off;
    }
}
EOF

# 5. Enable Site & Test Nginx Configuration
log_info "Mengaktifkan konfigurasi Nginx dan memeriksa sintaks..."
ln -sf "$SITE_AVAILABLE" "$SITE_ENABLED"

if ! nginx -t; then
    log_error "Konfigurasi Nginx menghasilkan error sintaks! Membatalkan pengaktifan..."
    rm -f "$SITE_ENABLED"
    exit 1
fi

systemctl reload nginx || systemctl restart nginx
log_success "Nginx berhasil dimuat ulang dengan server block HTTPS ${DOMAIN}."

# 6. If Let's Encrypt was selected, run certbot now
if [ "$SSL_MODE" = "letsencrypt" ]; then
    log_info "Meminta sertifikat Let's Encrypt melalui Certbot untuk ${DOMAIN}..."
    mkdir -p /var/www/html
    CERTBOT_ARGS=(--nginx -d "$DOMAIN" --non-interactive --agree-tos)
    if [ -n "$CERTBOT_EMAIL" ]; then
        CERTBOT_ARGS+=(-m "$CERTBOT_EMAIL")
    else
        CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi

    if certbot certonly "${CERTBOT_ARGS[@]}"; then
        LE_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
        LE_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
        
        sed -i "s|ssl_certificate .*;|ssl_certificate ${LE_CERT};|" "$SITE_AVAILABLE"
        sed -i "s|ssl_certificate_key .*;|ssl_certificate_key ${LE_KEY};|" "$SITE_AVAILABLE"
        
        nginx -t && systemctl reload nginx
        log_success "Sertifikat resmi Let's Encrypt berhasil diterbitkan dan dipasang!"
    else
        log_warn "Certbot gagal mendapatkan sertifikat publik (mungkin domain belum mengarah ke IP publik ini)."
        log_warn "Menggunakan sertifikat Self-Signed yang telah disiapkan sebagai fallback aman."
    fi
fi

# 7. Update .env URL
if [ -f "${APP_DIR}/.env" ]; then
    log_info "Memperbarui NEXT_PUBLIC_APP_URL di file .env..."
    sed -i -E "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=\"https://${DOMAIN}\"|" "${APP_DIR}/.env"
    log_success ".env diselaraskan dengan URL HTTPS: https://${DOMAIN}"
fi

# 8. Verification Health Check
log_info "Menjalankan uji koneksi HTTPS..."
HTTPS_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/login" || true)
if [ "$HTTPS_STATUS" = "200" ] || [ "$HTTPS_STATUS" = "302" ] || [ "$HTTPS_STATUS" = "307" ]; then
    log_success "Verifikasi HTTPS sukses! Respons HTTP ${HTTPS_STATUS} dari reverse proxy Nginx."
else
    log_warn "Verifikasi HTTPS menghasilkan kode HTTP ${HTTPS_STATUS}. Periksa status Next.js dan Nginx."
fi

echo "=============================================================================="
log_success "PENGATURAN HTTPS SELESAI!"
log_success "Aplikasi Surat Izin kini dapat diakses secara aman di:"
log_success "  --> https://${DOMAIN}"
if [ "$SSL_MODE" = "self-signed" ]; then
    log_info "Catatan: Menggunakan sertifikat Self-Signed. Browser akan menampilkan peringatan keamanan normal saat pertama kali dibuka (cukup klik Lanjutkan/Proceed)."
fi
echo "=============================================================================="
