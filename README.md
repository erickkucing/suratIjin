# Sistem Surat Izin & Presensi Siswa Modern

> Solusi terpadu pencatatan presensi, arsip surat izin digital, dan rekapitulasi kehadiran siswa berbasis web modern untuk Wali Kelas, Wali Murid, dan Administrator Sekolah.

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1.7-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.38-C5F74F?style=flat-square&logo=drizzle)](https://orm.drizzle.team/)
[![MySQL 8+](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=flat-square&logo=mysql)](https://www.mysql.com/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0-green?style=flat-square&logo=vitest)](https://vitest.dev/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-orange?style=flat-square&logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

---

## Daftar Isi

1. [Gambaran Umum & Nilai Utama](#gambaran-umum--nilai-utama)
2. [Fitur Unggulan](#fitur-unggulan)
3. [Arsitektur & Alur Kerja Sistem](#arsitektur--alur-kerja-sistem)
4. [Prasyarat Sistem](#prasyarat-sistem)
5. [Instalasi Cepat (Quickstart)](#instalasi-cepat-quickstart)
6. [Panduan Deployment Otomatis](#panduan-deployment-otomatis)
   - [Deploy Mode Development (Port 3000)](#1-deploy-mode-development-port-3000)
   - [Deploy Mode Production (Port 80)](#2-deploy-mode-production-port-80)
   - [Pembaruan Otomatis (Auto-Update)](#3-pembaruan-otomatis-auto-update)
   - [Konfigurasi Systemd Service Manual](#4-konfigurasi-systemd-service-manual)
   - [Konfigurasi Nginx Reverse Proxy (Opsional)](#5-konfigurasi-nginx-reverse-proxy-opsional)
7. [Panduan Penggunaan Lengkap (Tutorial Peran)](#panduan-penggunaan-lengkap-tutorial-peran)
   - [Peran 1: Administrator (Superadmin)](#peran-1-administrator-superadmin)
   - [Peran 2: Wali Kelas](#peran-2-wali-kelas)
   - [Peran 3: Orang Tua / Wali Murid](#peran-3-orang-tua--wali-murid)
8. [Struktur Direktori Proyek](#struktur-direktori-proyek)
9. [Basis Data & Migrasi](#basis-data--migrasi)
10. [Pengujian & Verifikasi Kualitas](#pengujian--verifikasi-kualitas)
11. [Hardening & Keamanan Sistem](#hardening--keamanan-sistem)

---

## Gambaran Umum & Nilai Utama

Sistem Surat Izin Siswa dirancang untuk menggantikan pencatatan izin kertas konvensional yang rentan hilang, tercecer, dan sulit direkap. Aplikasi ini memberikan pengalaman pencatatan presensi yang cepat, transparan, dan dapat diakses dari perangkat ponsel maupun komputer.

### Nilai Utama:
- **Efisien**: Catat izin, sakit, dan alpa siswa dalam hitungan detik dengan kompresi foto otomatis di peramban.
- **Transparan**: Portal publik bagi wali murid untuk memantau rekap absensi anak secara mandiri tanpa harus login akun resmi.
- **Akurat**: Ekspor rekapitulasi bulanan dan semesteran ke format PDF dan Excel resmi dengan logo sekolah proporsional.
- **Aman**: Dilengkapi proteksi anti brute-force rate limiter, validasi magic bytes berkas unggahan, dan header HTTP keamanan OWASP.
- **Ringan & Cepat**: Dibangun dengan Next.js 15 App Router, React 19, Tailwind CSS v4, dan Drizzle ORM yang responsif dan hemat sumber daya.

---

## Fitur Unggulan

### 1. Modul Wali Kelas
- **Papan Rekapitulasi Cerdas**: Ringkasan total siswa, persentase kehadiran, jumlah sakit, izin, dan alpa dalam satu layar.
- **Pencatatan Cepat Berkas Surat**: Formulir pencatatan dengan kompresi gambar otomatis (WebP/JPEG/PNG/HEIC) sebelum diunggah ke server.
- **Lightbox Surat Digital**: Pratinjau berkas surat izin/dokter secara instan tanpa perlu meninggalkan halaman utama, lengkap dengan tombol unduh.
- **Papan Apresiasi Kehadiran 100%**: Daftar otomatis siswa teladan yang tidak memiliki catatan ketidakhadiran selama periode berjalan.
- **Template Pesan WhatsApp Satu Klik**: Tombol salin format pesan rekapitulasi harian siap kirim ke grup WhatsApp wali murid.
- **Ekspor Dokumen Resmi**:
  - **PDF Rekapitulasi**: Menggunakan format tabel resmi lengkap dengan kop surat, logo sekolah proporsional, data statistik, dan tanda tangan digital.
  - **Excel Rekapitulasi**: Format spreadsheet lengkap dengan pewarnaan status, rumus rekapitulasi, dan logo instansi.
- **Manajemen Siswa (Roster)**: Tambah siswa satu per satu atau impor massal melalui template Excel.
- **Manajemen Profil Guru Mandiri**: Edit nama lengkap, NIP/identitas, dan ubah kata sandi akun secara mandiri.
- **Pengaturan Portal Kelas**: Atur apakah wali murid diwajibkan memasukkan PIN atau bisa langsung melihat rekapitulasi, serta opsi izin akses berkas foto surat.

### 2. Modul Wali Murid (Portal Mandiri)
- **Akses Tautan Ramah**: Akses mudah via URL slug kelas (misal: `/portal/xii-tkj-2`).
- **Proteksi PIN Fleksibel**: Dapat diproteksi kata sandi kelas atau dibuka langsung tanpa sandi sesuai kebijakan wali kelas.
- **Pencarian Cepat Siswa**: Filter nama dan NIS siswa untuk melihat riwayat kehadiran anak secara transparan.
- **Akses Berkas Digital**: Pratinjau surat izin yang telah diunggah jika diizinkan oleh wali kelas.

### 3. Modul Administrator (Superadmin)
- **Manajemen Akun Guru**: Tambah, ubah, nonaktifkan akun guru, serta penugasan kelas binaan.
- **Manajemen Kelas & Tahun Ajaran**: Buat kelas baru, kelola slug URL, dan sesuaikan tahun ajaran/semester.
- **Pengaturan Identitas Instansi**: Kustomisasi nama instansi, logo sekolah, dan tema warna utama aplikasi.
- **Migrasi & Sinkronisasi Database**: Alat migrasi skema tabel dan transfer data ke server database jarak jauh (remote MySQL).

### 4. Aspek Teknis & PWA
- **Progressive Web App (PWA)**: Dilengkapi Web App Manifest (`manifest.json`) dan ikon adaptif sehingga dapat dipasang ke layar utama ponsel (Android / iOS).
- **Desain Ramah Aksesibilitas (WCAG 2.2 AA)**: Kontras warna terverifikasi dengan rasio tinggi, dukungan navigasi keyboard, dan tema gelap (Dark Mode).

---

## Arsitektur & Alur Kerja Sistem

### Diagram Arsitektur Komponen

```mermaid
flowchart TD
    subgraph Klien["Perangkat Pengguna"]
        WM["Wali Murid (Mobile / Desktop Browser)"]
        WK["Wali Kelas (Mobile / Desktop Browser)"]
        SA["Superadmin (Desktop Browser)"]
    end

    subgraph Gerbang["Web Server & Reverse Proxy"]
        NGX["Nginx (Opsional: Port 80/443 SSL)"]
        PM["Next.js Server (Port 3000 / Port 80)"]
    end

    subgraph Inti["Next.js 15 App Router"]
        RL["In-Memory Rate Limiter (Anti Brute-Force)"]
        AUTH["JOSE JWT Session & Password Security (Bcrypt)"]
        ACTIONS["Server Actions & API Routes"]
        STATIC["Storage Engine (Berkas Unggahan Surat)"]
    end

    subgraph Data["Penyimpanan & Database"]
        ORM["Drizzle ORM Engine"]
        MYSQL[("MySQL 8.0 Database (db_suratizin)")]
        DISK[("Disk Storage (/storage/uploads)")]
    end

    WM -->|Akses Portal /portal/slug| NGX
    WK -->|Login & Dashboard /dashboard| NGX
    SA -->|Admin Panel /admin| NGX
    NGX --> PM
    PM --> RL
    RL --> AUTH
    AUTH --> ACTIONS
    ACTIONS --> ORM
    ACTIONS --> STATIC
    ORM --> MYSQL
    STATIC --> DISK
```

### Diagram Alur Pencatatan & Akses Surat

```mermaid
sequenceDiagram
    autonumber
    actor OT as Orang Tua / Wali Murid
    actor WK as Wali Kelas
    participant APP as Surat Ijin App
    participant DB as MySQL Database
    participant FS as Media Storage

    OT->>WK: Mengirim surat fisik / foto izin via WhatsApp
    WK->>APP: Buka Dashboard & Klik "+ Catat Ketidakhadiran"
    WK->>APP: Pilih Siswa, Status (Sakit/Izin/Alpa), & Unggah Berkas
    Note over APP: Kompresi gambar otomatis (WebP/JPEG/PNG) di browser
    APP->>FS: Simpan berkas surat terkompresi
    APP->>DB: Catat riwayat kehadiran ke database
    APP-->>WK: Notifikasi presensi tersimpan sukses
    WK->>APP: Klik "Salin Pesan WhatsApp"
    WK->>OT: Kirim ringkasan presensi harian ke WhatsApp Grup
    OT->>APP: Akses link /portal/slug
    APP-->>OT: Tampilkan riwayat presensi & status kehadiran 100%
```

---

## Prasyarat Sistem

Sebelum menginstal aplikasi ini di server atau komputer lokal, pastikan perangkat telah memenuhi prasyarat berikut:

- **Sistem Operasi**: Linux (Ubuntu 20.04/22.04/24.04 LTS direkomendasikan) atau macOS / Windows dengan WSL2.
- **Node.js**: Versi `20.x` LTS atau lebih baru.
- **NPM**: Versi `10.x` atau lebih baru.
- **MySQL / MariaDB**: MySQL versi `8.0+` atau MariaDB `10.5+`.
- **Git**: Versi `2.30+`.
- **Nginx** (opsional): Digunakan jika ingin menggunakan konfigurasi reverse proxy dengan SSL/HTTPS.

---

## Instalasi Cepat (Quickstart)

Ikuti langkah-langkah di bawah ini untuk menjalankan aplikasi dalam waktu kurang dari 5 menit:

### 1. Kloning Repositori
```bash
git clone git@github.com:erickkucing/suratIjin.git
cd suratIjin
```

### 2. Pasang Dependensi
```bash
npm install
```

### 3. Buat Database MySQL
Masuk ke terminal MySQL:
```sql
CREATE DATABASE db_suratizin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'surat_user'@'localhost' IDENTIFIED BY 'surat_pass_2026';
GRANT ALL PRIVILEGES ON db_suratizin.* TO 'surat_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Konfigurasi Environment File
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Sesuaikan nilai `DATABASE_URL` dan `JWT_SECRET` di dalam berkas `.env`:
```env
DATABASE_URL="mysql://surat_user:surat_pass_2026@127.0.0.1:3306/db_suratizin"
JWT_SECRET="masukkan_string_acak_panjang_minimal_32_karakter_di_sini"
STORAGE_PATH="./storage/uploads"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 5. Inisialisasi Skema & Data Awal (Seed)
Terapkan skema tabel ke database dan masukkan data pengguna awal:
```bash
# Sinkronkan skema tabel Drizzle ORM ke MySQL
npm run db:push

# Pasang indeks performa dan constraint integritas data
npx tsx scripts/apply-indexes.ts

# Masukkan data bawaan (Akun admin, wali kelas, kelas contoh, dan siswa)
npm run db:seed
```

### 6. Jalankan Server Development
```bash
npm run dev
```
Buka peramban di `http://localhost:3000`.

---

## Panduan Deployment Otomatis

Aplikasi ini telah dilengkapi dengan skrip deployment otomatis cerdas yang mengatur instalasi dependensi, build produksi, konfigurasi systemd service, pengaturan port, hingga pembaruan Nginx secara mandiri.

Semua skrip berada di dalam folder `scripts/`:
- `scripts/deploy.sh`: Skrip instalasi dan deployment ke port 3000 (dev) atau port 80 (prod).
- `scripts/update.sh`: Skrip pembaruan otomatis dari repositori Git dengan fitur anti konflik rebase dan auto reload.

### 1. Deploy Mode Development (Port 3000)
Gunakan mode ini jika Anda ingin menjalankan aplikasi di port 3000 (misalnya di belakang Nginx reverse proxy):

```bash
sudo bash scripts/deploy.sh dev
```

**Alur kerja skrip mode dev:**
1. Memverifikasi hak akses root dan ketersediaan Node.js / NPM / MySQL.
2. Memeriksa file `.env`, membuat folder penyimpanan `storage/uploads/`.
3. Menjalankan `npm install --prefer-offline`.
4. Mengaplikasikan migrasi database dan indeks performa.
5. Menjalankan kompilasi Next.js (`npm run build`).
6. Membuat dan mengaktifkan service systemd: `/etc/systemd/system/surat-ijin.service` pada port 3000.
7. Memastikan Nginx aktif jika terpasang di server.
8. Melakukan uji health check HTTP hingga server siap merespons.

---

### 2. Deploy Mode Production (Port 80)
Gunakan mode ini jika server didedikasikan langsung untuk aplikasi Surat Izin dan ingin mengikat langsung ke port HTTP 80:

```bash
sudo bash scripts/deploy.sh prod
```

**Karakteristik khusus mode prod:**
- Menghentikan dan menonaktifkan service Nginx agar port 80 bebas dari konflik `EADDRINUSE`.
- Mengonfigurasi `surat-ijin.service` untuk berjalan langsung pada port 80 (`-H 0.0.0.0 -p 80`).
- Menjalankan health check otomatis ke `http://127.0.0.1:80`.

---

### 3. Pembaruan Otomatis (Auto-Update)
Jika terdapat pembaruan kode di GitHub, Anda cukup menjalankan satu perintah pembaruan:

```bash
sudo bash scripts/update.sh
```

**Fitur keamanan pada skrip update:**
- **Auto-Detect Target**: Secara otomatis mengenali apakah service saat ini berjalan di mode port 80 atau port 3000.
- **Safe Stash**: Menyimpan perubahan konfigurasi lokal yang belum ter-commit dan mengabaikan skrip internal dari stash.
- **Safe Rebase**: Menjalankan `git pull --rebase origin <branch>`.
- **Auto Rollback**: Jika kompilasi build gagal, skrip secara otomatis membatalkan git commit ke titik aman sebelumnya dan menjaga service lama tetap aktif tanpa downtime.
- **Auto Restart**: Me-reload daemon systemd dan me-restart `surat-ijin.service`.

> [!TIP]
> Anda dapat menambahkan skrip ini ke Cron Job server untuk pembaruan harian terjadwal jika diinginkan:
> ```bash
> # Jalankan pembaruan otomatis setiap hari pukul 02:00 WIB
> 0 2 * * * root /root/project/suratIjin/scripts/update.sh >> /var/log/surat-ijin-update.log 2>&1
> ```

---

### 4. Konfigurasi Systemd Service Manual

Jika ingin mengelola unit service systemd secara manual, file konfigurasi terletak di `/etc/systemd/system/surat-ijin.service`:

```ini
[Unit]
Description=Surat Ijin Next.js Application
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/project/suratIjin
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start -- -H 0.0.0.0 -p 3000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=surat-ijin

[Install]
WantedBy=multi-user.target
```

**Perintah Pengelolaan Service:**
```bash
# Cek status service
sudo systemctl status surat-ijin

# Restart service
sudo systemctl restart surat-ijin

# Hentikan service
sudo systemctl stop surat-ijin

# Lihat log real-time
sudo journalctl -u surat-ijin -f
```

---

### 5. Konfigurasi Nginx Reverse Proxy (Opsional)

Jika Anda menjalankan aplikasi di mode port 3000 dan ingin mengarahkan domain sekolah dengan SSL/HTTPS melalui Nginx:

Buat file konfigurasi `/etc/nginx/sites-available/surat-ijin`:
```nginx
server {
    listen 80;
    server_name izin.sekolah.sch.id;

    # Batas ukuran upload foto bukti surat (hingga 12MB)
    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan konfigurasi:
```bash
sudo ln -s /etc/nginx/sites-available/surat-ijin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Panduan Penggunaan Lengkap (Tutorial Peran)

### Data Kredensial Awal (Default Seed)

Setelah menjalankan `npm run db:seed`, akun berikut siap digunakan:

| Peran | Username | Kata Sandi Bawaan | Akses Halaman |
|---|---|---|---|
| **Superadmin** | `admin` | `feelgood6969` | `/admin` & `/dashboard` |
| **Superadmin (Legacy)** | `wildwina` | `feelgood6969` | `/admin` & `/dashboard` |
| **Wali Kelas** | `erick` | `feelgood6969` | `/dashboard` (Kelas: XII TKJ 2) |
| **Wali Murid** | *(Tanpa Username)* | PIN: `123456` | `/portal/xii-tkj-2` |

---

### Peran 1: Administrator (Superadmin)

Administrator memiliki hak akses tertinggi untuk mengelola seluruh ekosistem sekolah.

#### 1. Masuk ke Aplikasi
1. Buka halaman `/login`.
2. Masukkan username `admin` dan kata sandi `feelgood6969`.
3. Klik tombol **Masuk ke Sistem**.
4. Setelah berhasil masuk, Anda akan diarahkan ke panel admin di `/admin`.

#### 2. Mengelola Kelas
- **Menambah Kelas Baru**: Klik tab **Data Kelas**, tekan tombol **+ Tambah Kelas**, isi nama kelas (misal: `X RPL 1`), slug URL (misal: `x-rpl-1`), dan tentukan wali kelas yang bertugas.
- **Mengubah Status Kelas**: Anda dapat memperbarui tahun ajaran aktif, mengganti wali kelas pengampu, atau menonaktifkan kelas yang telah lulus.

#### 3. Mengelola Akun Guru
- Buka tab **Manajemen Guru**.
- Klik tombol **+ Tambah Guru**.
- Masukkan nama lengkap guru beserta gelar, username baru, dan kata sandi awal.
- Tentukan peran akun (`wali_kelas` atau `superadmin`).

#### 4. Kustomisasi Identitas Sekolah & Logo
- Buka tab **Pengaturan Sistem**.
- Unggah file logo resmi sekolah (disarankan format PNG berlatar transparan).
- Sesuaikan nama instansi sekolah (misal: `SMK Negeri 1 Surabaya`). Logo dan nama ini akan otomatis muncul pada kop surat ekspor PDF dan Excel.
- Pilih palet warna tema instansi (Terracotta, Emerald, Ocean Blue, Burgundy, dll.).

#### 5. Migrasi & Sinkronisasi Database
- Jika ingin memindahkan basis data ke server database jarak jauh, buka tab **Database Admin**.
- Masukkan koneksi target dan jalankan runner migrasi secara visual.

---

### Peran 2: Wali Kelas

Wali Kelas menggunakan aplikasi setiap hari untuk memantau presensi dan mencatat surat izin yang diterima dari orang tua.

#### 1. Masuk ke Dashboard Kelas
1. Buka halaman `/login`, masukkan username wali kelas (contoh: `erick`).
2. Setelah masuk, Anda akan langsung berada di `/dashboard`.
3. Layar utama menampilkan:
   - Kartu statistik: Total siswa, Kehadiran %, Sakit, Izin, Alpa.
   - Grafik batang tren ketidakhadiran bulanan.
   - Papan Apresiasi Kehadiran 100%.
   - Tabel riwayat ketidakhadiran siswa dengan filter pencarian dan tanggal.

#### 2. Mencatat Surat Izin / Sakit / Alpa
1. Klik tombol utama **+ Catat Ketidakhadiran** di kanan atas.
2. Pilih nama siswa dari menu tarik-turun (dropdown).
3. Tentukan tanggal kejadian.
4. Pilih status ketidakhadiran:
   - **Izin**: Untuk izin keperluan keluarga atau urusan penting.
   - **Sakit**: Untuk kondisi medis siswa.
   - **Alpa**: Untuk ketidakhadiran tanpa keterangan.
5. Tuliskan keterangan singkat (misal: `Demam tinggi sejak malam`, `Menghadiri pernikahan keluarga`).
6. Lampirkan foto surat (bila ada):
   - Klik area unggah atau seret berkas foto/surat (PNG, JPG, WebP, HEIC dari kamera iPhone).
   - Sistem secara otomatis mengompresi gambar di browser Anda agar unggahan cepat dan hemat kuota data.
7. Pilih status surat fisik: **Sudah Dikirim** atau **Belum Dikirim**.
8. Klik tombol **Simpan Catatan Presensi**.

#### 3. Melihat & Mengunduh Bukti Surat
- Pada tabel riwayat presensi, baris yang memiliki lampiran akan menampilkan ikon pratinjau berkas.
- Klik ikon berkas untuk membuka **Lightbox Pratinjau Surat**.
- Anda dapat memperbesar gambar, memeriksa keaslian surat, atau mengklik tombol **Unduh Berkas**.

#### 4. Mengirim Ringkasan ke Grup WhatsApp
- Di samping tombol ekspor, klik tombol **Salin Pesan WhatsApp**.
- Format pesan rapi berisi rekapitulasi harian kelas akan tersalin ke papan klip (*clipboard*).
- Buka WhatsApp Web / aplikasi WhatsApp di ponsel, lalu tempel (*paste*) pesan tersebut ke grup wali murid kelas.

#### 5. Mengekspor Rekapitulasi Resmi
- **Ekspor PDF**: Klik tombol **Export PDF**. Sistem akan menghasilkan berkas dokumen PDF berformat A4 lengkap dengan kop sekolah resmi, logo proporsional, tabel rekapitulasi tanggal, dan kolom tanda tangan wali kelas.
- **Ekspor Excel**: Klik tombol **Export Excel**. Menghasilkan file spreadsheet `.xlsx` terstruktur yang siap dicetak atau dilaporkan ke bagian tata usaha / bimbingan konseling.

#### 6. Mengelola Roster Siswa
- Klik tombol **Kelola Roster**.
- Anda dapat menambahkan siswa satu per satu lengkap dengan NIS.
- **Impor Massal Excel**: Unduh format template Excel yang telah disediakan, isi data siswa, lalu unggah kembali untuk mengimpor seluruh siswa sekaligus.

#### 7. Mengatur Akses Portal Wali Murid
- Klik tombol **Pengaturan Portal**.
- Tentukan apakah portal orang tua memerlukan kata sandi / PIN:
  - **Diaktifkan**: Masukkan PIN (misal: `123456`). Wali murid wajib memasukkan PIN ini untuk membuka rekap.
  - **Dinonaktifkan**: Wali murid dapat langsung membuka link tanpa perlu memasukkan kata sandi.
- Tentukan opsi **Izinkan Melihat Berkas Surat**: Jika diaktifkan, orang tua dapat melihat foto surat yang dilampirkan.

#### 8. Edit Profil & Ganti Kata Sandi
- Klik menu akun di pojok kanan atas, lalu pilih **Profil Guru**.
- Anda dapat memperbarui nama tampilan dan mengganti kata sandi secara mandiri kapan saja.

---

### Peran 3: Orang Tua / Wali Murid

Wali murid dapat mengakses rekapitulasi kelas anak mereka dengan mudah melalui ponsel pintar tanpa perlu registrasi akun baru.

#### 1. Membuka Portal Kelas
1. Buka tautan yang dibagikan oleh wali kelas melalui WhatsApp, contoh:  
   `https://izin.sekolah.sch.id/portal/xii-tkj-2`
2. Jika kelas diproteksi PIN, masukkan PIN yang diberikan wali kelas (misal: `123456`), lalu klik **Buka Papan Presensi**.
3. Jika kelas tidak menggunakan proteksi, papan informasi akan terbuka secara langsung.

#### 2. Memantau Rekapitulasi
- Wali murid dapat melihat ringkasan presensi kelas secara keseluruhan.
- Terdapat kolom pencarian untuk mengetikkan nama putra/putri guna memeriksa apakah ada catatan izin/sakit/alpa yang tercatat atas nama anak mereka.
- Melihat daftar siswa berprestasi pada **Papan Apresiasi Kehadiran 100%**.

---

## Struktur Direktori Proyek

```text
suratIjin/
├── .github/
│   └── workflows/
│       └── ci-cd.yml             # Alur otomasi CI/CD GitHub Actions (Lint, Test, Build, Deploy)
├── drizzle/                      # File migrasi dan metadata Drizzle ORM
├── public/
│   └── icons/                    # Ikon Web App PWA adaptif (48x48, 192x192, 512x512)
├── scripts/
│   ├── apply-indexes.ts          # Skrip penyusunan indeks performa database MySQL
│   ├── deploy.sh                 # Skrip deployment otomatis dev (port 3000) & prod (port 80)
│   ├── migrate-remote.ts         # Skrip runner migrasi database remote
│   └── update.sh                 # Skrip safe pull/rebase dan auto-update tanpa downtime
├── src/
│   ├── actions/                  # Server Actions (Mutasi data, autentikasi, roster, settings)
│   │   ├── __tests__/            # Unit test Server Actions
│   │   ├── admin.ts              # Aksi manajemen admin & pengguna
│   │   ├── attendance.ts         # Aksi pencatatan presensi siswa
│   │   ├── auth.ts               # Aksi autentikasi, login, logout, sesi JWT
│   │   ├── class-settings.ts     # Aksi konfigurasi portal orang tua
│   │   ├── database-admin.ts     # Aksi runner migrasi skema database
│   │   ├── roster.ts             # Aksi CRUD roster siswa & impor Excel
│   │   └── system-settings.ts    # Aksi konfigurasi identitas instansi sekolah
│   ├── app/                      # Next.js 15 App Router
│   │   ├── admin/                # Halaman dan komponen panel Superadmin
│   │   ├── api/                  # API Route Handlers (Auth, Upload, File Streaming)
│   │   ├── dashboard/            # Halaman utama dashboard presensi Wali Kelas
│   │   ├── login/                # Halaman login modern dengan proteksi rate limit
│   │   ├── portal/[slug]/        # Halaman publik Portal Orang Tua berbasis slug kelas
│   │   ├── layout.tsx            # Root layout dengan meta PWA & tema
│   │   └── manifest.ts           # Konfigurasi dinamis Web App Manifest PWA
│   ├── components/               # Komponen antarmuka pengguna (UI Components)
│   │   ├── attendance-form-modal.tsx      # Modal pencatatan presensi + kompresi gambar
│   │   ├── letter-lightbox-modal.tsx      # Modal lightbox pratinjau surat digital
│   │   ├── monthly-bar-chart.tsx          # Komponen grafik statistik Chart.js
│   │   ├── parent-portal-settings-modal.tsx # Modal pengaturan keamanan portal orang tua
│   │   ├── stat-card.tsx                  # Kartu metrik kehadiran
│   │   ├── student-roster-modal.tsx       # Modal manajemen siswa & template Excel
│   │   └── teacher-profile-modal.tsx      # Modal ubah profil guru & sandi
│   ├── db/                       # Konfigurasi database Drizzle ORM
│   │   ├── index.ts              # Inisialisasi pool koneksi MySQL2
│   │   ├── queries.ts            # Kumpulan query rekapitulasi data presensi
│   │   ├── schema.ts             # Definisi skema tabel & relasi Drizzle ORM
│   │   └── seed-legacy.ts        # Data seeder awal (Akun admin, guru, kelas, siswa)
│   └── lib/                      # Utilitas, pustaka pembantu, dan pengujian
│       ├── __tests__/            # Test suite Vitest (104 tests)
│       ├── academic-year.ts      # Logika tahun ajaran & semester otomatis
│       ├── attendance-stats.ts   # Kalkulasi agregasi presensi & apresiasi 100%
│       ├── auth.ts               # Enkripsi JWT Jose & verifikasi password Bcrypt
│       ├── export-excel.ts       # Generator dokumen Excel berlogo proporsional
│       ├── export-logo.ts        # Utilitas pemroses logo sekolah base64 & PNG
│       ├── export-pdf.ts         # Generator dokumen PDF jsPDF berlogo proporsional
│       └── rate-limiter.ts       # Sliding-window rate limiter proteksi brute-force
├── storage/
│   └── uploads/                  # Direktori berkas fisik surat izin yang diunggah
├── DESIGN.md                     # Panduan desain warna Warm Terracotta & Slate & WCAG
├── next.config.mjs               # Konfigurasi Next.js, HTTP Security Headers & Cache
└── vitest.config.ts              # Konfigurasi Vitest runner
```

---

## Basis Data & Migrasi

Aplikasi ini menggunakan skema relasional terstruktur dengan indeks performa tinggi:

### Tabel Utama:
1. `users`: Menyimpan akun superadmin dan wali kelas beserta hash password bcrypt.
2. `classes`: Menyimpan data kelas, slug unik, asosiasi wali kelas, dan pengaturan portal orang tua.
3. `students`: Menyimpan data siswa, NIS unik per kelas, dan status keaktifan siswa.
4. `attendance_records`: Menyimpan transaksi ketidakhadiran siswa dengan composite unique index `(class_id, student_id, attendance_date)` untuk mencegah pencatatan ganda pada hari yang sama.
5. `system_settings`: Menyimpan preferensi global (nama aplikasi, logo sekolah, tema warna).

### Perintah Database:
```bash
# Periksa dan dorong perubahan skema ke MySQL
npm run db:push

# Pasang indeks performa unik dan relasi
npx tsx scripts/apply-indexes.ts

# Jalankan migrasi data legacy jika diperlukan
npm run db:seed
```

---

## Pengujian & Verifikasi Kualitas

Proyek ini telah dilengkapi dengan rangkaian unit test komprehensif menggunakan **Vitest** dengan tingkat keberhasilan 100%:

```bash
# Menjalankan seluruh rangkaian unit test
npm run test:unit
```

### Rangkuman Cakupan Test Suite (20 Test Files, 104 Tests Passed):
- `auth-api.test.ts`: Pengujian endpoint login, verifikasi cookie sesi, dan pemblokiran rate limit HTTP 429.
- `auth.test.ts`: Pengujian verifikasi hash password bcrypt legacy dan token JWT.
- `rate-limiter.test.ts`: Pengujian algoritma sliding window dan isolasi IP penyerang.
- `export-pdf.test.ts` & `export-excel.test.ts`: Verifikasi pembuatan dokumen laporan beserta logo proporsional.
- `export-logo.test.ts`: Pengujian fallback logo sekolah dan perhitungan aspek rasio grafis.
- `hardening.test.ts`: Pengujian validasi magic bytes berkas unggahan dan HTTP security headers.
- `cicd-scripts.test.ts`: Pengujian integritas sintaks dan penanganan error pada skrip deploy dan update.
- `contrast.test.ts`: Verifikasi kepatuhan rasio kontras warna standar WCAG 2.2 AA.
- `manifest.test.ts`: Validasi struktur Web App Manifest PWA dan resolusi ikon.
- `academic-year.test.ts`: Pengujian kalkulasi kalender akademik otomatis.
- `attendance-stats.test.ts`: Verifikasi kalkulasi kehadiran dan algoritma apresiasi 100%.

---

## Hardening & Keamanan Sistem

Sistem ini menerapkan standar pengamanan berlapis untuk menjamin integritas data instansi pendidikan:

1. **Anti Brute-Force Rate Limiting**:
   - Menerapkan pembatasan sliding window pada endpoint autentikasi sensitif (`/api/auth/login` dan `/api/auth/unlock`).
   - Akses otomatis diblokir dengan respons `HTTP 429 Too Many Requests` dan header `Retry-After` setelah 5 kali percobaan gagal berturut-turut.
2. **Validasi Berkas Magic Bytes**:
   - Melindungi endpoint unggahan berkas (`/api/upload`) dari ekstensi palsu.
   - Sistem memverifikasi penanda byte awal berkas:
     - PDF: `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`)
     - PNG: `\x89PNG\r\n\x1a\n` (`0x89 0x50 0x4E 0x47`)
     - JPEG: `FF D8 FF`
     - WebP: `RIFF....WEBP`
   - Batas ukuran berkas maksimum dikunci pada 10MB.
3. **HTTP Security Headers OWASP**:
   - Dikonfigurasi langsung pada level `next.config.mjs`:
     - `X-Frame-Options: SAMEORIGIN` (Mencegah serangan Clickjacking).
     - `X-Content-Type-Options: nosniff` (Mencegah sniffing MIME type).
     - `Referrer-Policy: strict-origin-when-cross-origin`.
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
     - `Content-Security-Policy`: Kebijakan konten yang ketat untuk mengisolasi skrip asing.
4. **Keamanan Sesi JWT**:
   - Token disimpan dalam cookie `httpOnly`, `sameSite: lax`, dan `secure` pada lingkungan produksi.
5. **Integritas Database**:
   - Indeks unik majemuk `idx_attendance_class_student_date_unique` memastikan tidak ada data presensi siswa yang terduplikasi pada tanggal yang sama.

---

## Dukungan & Kontribusi

Jika Anda menemukan kendala atau ingin mengajukan saran fitur baru:
1. Buat issue baru di repositori GitHub: [Issues](https://github.com/erickkucing/suratIjin/issues)
2. Untuk kontribusi kode, silakan buat branch baru dan ajukan Pull Request.
