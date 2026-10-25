export interface RemoteDbConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  connectionUri?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  serverVersion?: string;
  databaseName?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Parses a MySQL connection string URI into structured parameters.
 * Pure utility function without any Node.js dependencies (safe for client & server).
 */
export function parseDbUrl(uri: string): RemoteDbConfig {
  try {
    const url = new URL(uri);
    const host = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : 3306;
    const user = decodeURIComponent(url.username || "");
    const password = decodeURIComponent(url.password || "");
    const database = url.pathname.replace(/^\//, "");
    const sslParam = url.searchParams.get("ssl");
    const ssl = sslParam === "true" || sslParam === "1" || url.searchParams.has("sslaccept");

    return {
      host,
      port,
      user,
      password,
      database,
      ssl,
      connectionUri: uri,
    };
  } catch {
    return { connectionUri: uri };
  }
}

/**
 * Builds a valid MySQL connection URI from structured config.
 * Pure utility function without any Node.js dependencies (safe for client & server).
 */
export function buildDbUrl(config: RemoteDbConfig): string {
  if (config.connectionUri && (!config.host || !config.database)) {
    return config.connectionUri;
  }

  const host = config.host || "127.0.0.1";
  const port = config.port || 3306;
  const user = encodeURIComponent(config.user || "");
  const password = encodeURIComponent(config.password || "");
  const database = config.database || "";
  const auth = user ? `${user}:${password}@` : "";
  const sslQuery = config.ssl ? "?ssl=true" : "";

  return `mysql://${auth}${host}:${port}/${database}${sslQuery}`;
}
