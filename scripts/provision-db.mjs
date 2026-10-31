#!/usr/bin/env node
// ==============================================================================
// Auto-Provisioning MariaDB Database & User Credentials
// Mencegah dan memperbaiki error ER_ACCESS_DENIED_NO_PASSWORD_ERROR (errno 1698)
// ==============================================================================
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(/^\s*DATABASE_URL=["']?([^"'\r\n]+)/m);
  if (match) dbUrl = match[1];
}

if (!dbUrl) {
  console.log("[INFO] DATABASE_URL tidak ditemukan di environment maupun .env, melewati provisioning database.");
  process.exit(0);
}

let u;
try {
  u = new URL(dbUrl);
} catch (e) {
  console.warn("[WARN] Format DATABASE_URL tidak valid:", e.message);
  process.exit(0);
}

const user = decodeURIComponent(u.username);
const pass = decodeURIComponent(u.password);
const host = u.hostname || "127.0.0.1";
const port = u.port || "3306";
const db = decodeURIComponent(u.pathname.replace(/^\//, ""));

// Hanya tangani provisioning jika database lokal
const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1" || !host;
if (!isLocal) {
  console.log(`[INFO] Database terkonfigurasi di remote host (${host}), melewati provisioning lokal.`);
  process.exit(0);
}

const mysqlBin = fs.existsSync("/usr/bin/mariadb")
  ? "/usr/bin/mariadb"
  : fs.existsSync("/usr/bin/mysql")
  ? "/usr/bin/mysql"
  : null;

if (!mysqlBin) {
  console.warn("[WARN] Binary mariadb/mysql tidak ditemukan di sistem.");
  process.exit(0);
}

function testUserConnection(targetHost) {
  try {
    const args = ["-u", user, "-h", targetHost];
    if (pass) args.push(`-p${pass}`);
    if (port && port !== "3306") args.push("-P", port);
    args.push("-e", "SELECT 1;");
    execFileSync(mysqlBin, args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// 1. Cek apakah user sudah bisa connect
const canConnect = testUserConnection(host);
if (canConnect) {
  console.log(`[INFO] Kredensial database user '${user}' sudah aktif dan dapat terhubung.`);
  try {
    const args = ["-u", user, "-h", host];
    if (pass) args.push(`-p${pass}`);
    if (port && port !== "3306") args.push("-P", port);
    args.push("-e", `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    execFileSync(mysqlBin, args, { stdio: "pipe" });
  } catch {}
  process.exit(0);
}

console.log(`[INFO] Menyiapkan database '${db}' dan mengonfigurasi user '${user}' via root socket...`);

const escapeSql = (s) => s.replace(/'/g, "''");
const escapeId = (s) => s.replace(/`/g, "``");

let sql = `CREATE DATABASE IF NOT EXISTS \`${escapeId(db)}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;

if (user && user !== "root") {
  sql += `
CREATE USER IF NOT EXISTS '${escapeSql(user)}'@'localhost' IDENTIFIED BY '${escapeSql(pass)}';
ALTER USER '${escapeSql(user)}'@'localhost' IDENTIFIED BY '${escapeSql(pass)}';
GRANT ALL PRIVILEGES ON \`${escapeId(db)}\`.* TO '${escapeSql(user)}'@'localhost';

CREATE USER IF NOT EXISTS '${escapeSql(user)}'@'127.0.0.1' IDENTIFIED BY '${escapeSql(pass)}';
ALTER USER '${escapeSql(user)}'@'127.0.0.1' IDENTIFIED BY '${escapeSql(pass)}';
GRANT ALL PRIVILEGES ON \`${escapeId(db)}\`.* TO '${escapeSql(user)}'@'127.0.0.1';

FLUSH PRIVILEGES;
`;
}

try {
  execFileSync(mysqlBin, ["-e", sql], { stdio: "pipe" });
  console.log(`[SUCCESS] Database '${db}' dan kredensial user '${user}' berhasil disiapkan di MariaDB/MySQL.`);
} catch (err) {
  try {
    execFileSync(mysqlBin, ["-u", "root", "-proot", "-e", sql], { stdio: "pipe" });
    console.log(`[SUCCESS] Database '${db}' dan kredensial user '${user}' berhasil disiapkan via root:root.`);
  } catch (err2) {
    console.warn(`[WARN] Eksekusi root SQL gagal: ${err.message}`);
  }
}

// Uji coba koneksi ulang setelah konfigurasi
if (testUserConnection(host) || testUserConnection("127.0.0.1") || testUserConnection("localhost")) {
  console.log(`[SUCCESS] Verifikasi koneksi user '${user}' berhasil.`);
} else {
  console.warn(`[WARN] User '${user}' masih belum dapat terhubung. Periksa konfigurasi MariaDB.`);
}
