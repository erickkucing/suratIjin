import mysql from "mysql2/promise";
import {
  RemoteDbConfig,
  ConnectionTestResult,
  parseDbUrl,
  buildDbUrl,
} from "./db-remote-utils";

export * from "./db-remote-utils";

/**
 * Creates a single-use connection or pool to a remote database with timeout guard.
 */
export async function createRemoteConnection(config: RemoteDbConfig): Promise<mysql.Connection> {
  const parsed = config.connectionUri && !config.host ? parseDbUrl(config.connectionUri) : config;

  const connectionOptions: mysql.ConnectionOptions = {
    host: parsed.host || "127.0.0.1",
    port: parsed.port || 3306,
    user: parsed.user || "root",
    password: parsed.password || "",
    database: parsed.database || undefined,
    connectTimeout: 5000, // 5-second safety timeout
    charset: "utf8mb4",
    ssl: parsed.ssl ? { rejectUnauthorized: false } : undefined,
  };

  return await mysql.createConnection(connectionOptions);
}

/**
 * Tests connection to a remote MySQL/MariaDB server and measures latency.
 */
export async function testRemoteConnection(config: RemoteDbConfig): Promise<ConnectionTestResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  try {
    conn = await createRemoteConnection(config);
    const latencyMs = Date.now() - startTime;

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT VERSION() AS version, DATABASE() AS current_db;"
    );

    const firstRow = rows[0] || {};
    const serverVersion = String(firstRow.version || "Unknown");
    const databaseName = firstRow.current_db ? String(firstRow.current_db) : config.database || "Default";

    return {
      success: true,
      latencyMs,
      serverVersion,
      databaseName,
    };
  } catch (err: unknown) {
    const errorObj = err as { code?: string; message?: string; errno?: number };
    let userFriendlyError = errorObj.message || "Gagal terhubung ke database remote.";

    if (errorObj.code === "ETIMEDOUT" || errorObj.code === "ECONNREFUSED") {
      userFriendlyError = `Koneksi time out atau ditolak (${errorObj.code}). Pastikan Host & Port benar dan firewall remote mengizinkan koneksi port ${config.port || 3306}.`;
    } else if (errorObj.code === "ER_ACCESS_DENIED_ERROR") {
      userFriendlyError = `Akses ditolak (Username atau Password salah). Pastikan user MySQL memiliki hak akses dari IP host ini.`;
    } else if (errorObj.code === "ER_BAD_DB_ERROR") {
      userFriendlyError = `Database '${config.database}' tidak ditemukan di server remote. Buat database terlebih dahulu di server remote.`;
    }

    return {
      success: false,
      error: userFriendlyError,
      errorCode: errorObj.code,
    };
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}
