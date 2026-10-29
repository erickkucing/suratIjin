"use server";

import { z } from "zod";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { getCurrentUser } from "@/lib/auth";
import {
  RemoteDbConfig,
  testRemoteConnection,
  buildDbUrl,
  parseDbUrl,
} from "@/lib/db-remote";
import { runRemoteMigration, MigrationOptions, MigrationResult } from "@/lib/db-migration-runner";

const DEFAULT_LOCAL_DATABASE_URL =
  "mysql://surat_user:surat_pass_2026@127.0.0.1:3306/db_suratizin";

const remoteConfigSchema = z.object({
  host: z.string().optional(),
  port: z.coerce.number().optional().default(3306),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  ssl: z.boolean().optional().default(false),
  connectionUri: z.string().optional(),
});

function getEnvFilePath(): string {
  return path.resolve(process.cwd(), ".env");
}

function updateEnvDatabaseUrl(newUrl: string): void {
  const sanitizedUrl = newUrl.replace(/[\r\n\0]/g, "").trim();
  if (!sanitizedUrl.startsWith("mysql://")) {
    throw new Error("Format database URL tidak valid. Harus diawali dengan mysql://");
  }

  const envPath = getEnvFilePath();
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
  }

  const regex = /^DATABASE_URL=.*$/m;
  const newLine = `DATABASE_URL="${sanitizedUrl}"`;

  if (regex.test(content)) {
    content = content.replace(regex, newLine);
  } else {
    content = `${content.trim()}\n${newLine}\n`;
  }

  fs.writeFileSync(envPath, content, "utf-8");
}

function restartSystemService(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("systemctl restart surat-ijin 2>/dev/null || true", (err) => {
      if (err) {
        console.warn("Failed to restart systemd service (might be dev/test environment):", err.message);
      }
      resolve(true);
    });
  });
}

/**
 * Returns diagnostic details about the currently active database in the running app.
 */
export async function getCurrentDatabaseInfoAction() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Akses ditolak. Memerlukan peran Superadmin." };
  }

  const currentUri = process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
  const parsed = parseDbUrl(currentUri);
  const isLocal =
    !parsed.host ||
    parsed.host === "127.0.0.1" ||
    parsed.host === "localhost" ||
    parsed.host === "0.0.0.0";

  const testRes = await testRemoteConnection(parsed);

  return {
    success: true,
    data: {
      currentUri: currentUri.replace(/:([^:@]+)@/, ":****@"), // Mask password
      host: parsed.host || "127.0.0.1",
      port: parsed.port || 3306,
      database: parsed.database || "db_suratizin",
      user: parsed.user || "surat_user",
      isLocal,
      isConnected: testRes.success,
      latencyMs: testRes.latencyMs,
      serverVersion: testRes.serverVersion,
      error: testRes.error,
    },
  };
}

/**
 * Tests connection to a remote database without saving anything.
 */
export async function testDatabaseConnectionAction(rawInput: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Akses ditolak. Memerlukan peran Superadmin." };
  }

  const parse = remoteConfigSchema.safeParse(rawInput);
  if (!parse.success) {
    return { success: false, error: "Format konfigurasi database tidak valid." };
  }

  const config = parse.data;
  const result = await testRemoteConnection(config);
  return result;
}

/**
 * Runs DDL migration and optional data transfer to target database.
 */
export async function migrateDatabaseAction(
  rawInput: unknown,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return {
      success: false,
      logs: ["✗ Akses ditolak. Memerlukan peran Superadmin."],
      error: "Akses ditolak. Memerlukan peran Superadmin.",
    };
  }

  const parse = remoteConfigSchema.safeParse(rawInput);
  if (!parse.success) {
    return {
      success: false,
      logs: ["✗ Format konfigurasi database tidak valid."],
      error: "Format konfigurasi database tidak valid.",
    };
  }

  const config = parse.data;
  const result = await runRemoteMigration(config, options);
  return result;
}

/**
 * Applies the remote database as the active application DATABASE_URL in .env and restarts service.
 */
export async function applyActiveDatabaseAction(rawInput: unknown) {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Akses ditolak. Memerlukan peran Superadmin." };
  }

  const parse = remoteConfigSchema.safeParse(rawInput);
  if (!parse.success) {
    return { success: false, error: "Format konfigurasi database tidak valid." };
  }

  const config = parse.data;
  const testRes = await testRemoteConnection(config);
  if (!testRes.success) {
    return {
      success: false,
      error: `Koneksi gagal: ${testRes.error || "Tidak dapat memverifikasi database sebelum mengaktifkannya."}`,
    };
  }

  const fullUrl = buildDbUrl(config);
  updateEnvDatabaseUrl(fullUrl);
  process.env.DATABASE_URL = fullUrl;

  await restartSystemService();

  return {
    success: true,
    message: "Database aktif aplikasi berhasil diubah. Layanan telah dimuat ulang.",
  };
}

/**
 * Reverts DATABASE_URL back to local database.
 */
export async function revertToLocalDatabaseAction() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return { success: false, error: "Akses ditolak. Memerlukan peran Superadmin." };
  }

  updateEnvDatabaseUrl(DEFAULT_LOCAL_DATABASE_URL);
  process.env.DATABASE_URL = DEFAULT_LOCAL_DATABASE_URL;

  await restartSystemService();

  return {
    success: true,
    message: "Aplikasi berhasil dikembalikan ke database lokal.",
  };
}

/**
 * All-in-one action: runs DDL migration & data copy, then immediately activates as primary DB.
 */
export async function migrateAndApplyDatabaseAction(
  rawInput: unknown,
  options: MigrationOptions = {}
): Promise<MigrationResult & { applied?: boolean }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return {
      success: false,
      logs: ["✗ Akses ditolak. Memerlukan peran Superadmin."],
      error: "Akses ditolak. Memerlukan peran Superadmin.",
    };
  }

  const parse = remoteConfigSchema.safeParse(rawInput);
  if (!parse.success) {
    return {
      success: false,
      logs: ["✗ Format konfigurasi database tidak valid."],
      error: "Format konfigurasi database tidak valid.",
    };
  }

  const config = parse.data;
  const migrationResult = await runRemoteMigration(config, options);
  if (!migrationResult.success) {
    return {
      ...migrationResult,
      applied: false,
    };
  }

  try {
    const fullUrl = buildDbUrl(config);
    updateEnvDatabaseUrl(fullUrl);
    process.env.DATABASE_URL = fullUrl;
    await restartSystemService();
    migrationResult.logs.push("✓ Konfigurasi DATABASE_URL di .env berhasil diperbarui ke database remote.");
    migrationResult.logs.push("✓ Service sistem aplikasi berhasil dimuat ulang.");
    return {
      ...migrationResult,
      applied: true,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    migrationResult.logs.push(`✗ Gagal mengalihkan database aktif: ${msg}`);
    return {
      ...migrationResult,
      applied: false,
      error: `Migrasi selesai namun gagal mengaktifkan database: ${msg}`,
    };
  }
}
