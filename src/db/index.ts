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

const poolUri = process.env.DATABASE_URL || "mysql://root:@localhost:3306/db_suratizin";

const pool =
  globalForDb.conn ??
  mysql.createPool({
    uri: poolUri,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

if (process.env.NODE_ENV !== "production") globalForDb.conn = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
