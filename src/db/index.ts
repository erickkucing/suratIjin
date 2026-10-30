import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

const globalForDb = globalThis as unknown as {
  conn: mysql.Pool | undefined;
};

const poolUri =
  process.env.DATABASE_URL ||
  "mysql://surat_user:surat_pass_2026@127.0.0.1:3306/db_suratizin";
const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || "15", 10);
const maxIdle = parseInt(process.env.DB_MAX_IDLE || "10", 10);
const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || "60000", 10);
const queueLimit = parseInt(process.env.DB_QUEUE_LIMIT || "50", 10);

const pool =
  globalForDb.conn ??
  mysql.createPool({
    uri: poolUri,
    waitForConnections: true,
    connectionLimit,
    maxIdle,
    idleTimeout,
    queueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

if (process.env.NODE_ENV !== "production") globalForDb.conn = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
