/**
 * Utility functions for Redis connection URL parsing and formatting.
 * Safe for both Client and Server components (no Node.js/ioredis dependencies).
 */

export interface RedisConnectionConfig {
  host: string;
  port: string;
  password: string;
}

/**
 * Parses a Redis connection string into individual connection fields.
 * Handles standard formats:
 * - redis://:password@host:port
 * - redis://user:password@host:port
 * - redis://host:port
 * - host:port or raw IP
 */
export function parseRedisConnection(rawUrl: string | null | undefined): RedisConnectionConfig {
  const defaultConfig: RedisConnectionConfig = {
    host: "127.0.0.1",
    port: "6379",
    password: "",
  };

  if (!rawUrl || !rawUrl.trim()) {
    return defaultConfig;
  }

  const clean = rawUrl.trim();

  try {
    const hasScheme = clean.startsWith("redis://") || clean.startsWith("rediss://");
    const parsed = new URL(hasScheme ? clean : `redis://${clean}`);
    const host = parsed.hostname || defaultConfig.host;
    const port = parsed.port || defaultConfig.port;
    const password = parsed.password ? decodeURIComponent(parsed.password) : "";

    return { host, port, password };
  } catch {
    // Regex fallback for non-standard URI schemes
    const match = clean.match(/^(?:rediss?:\/\/)?(?:[^:]*:([^@]+)@)?([^:/]+)(?::(\d+))?/);
    if (match) {
      return {
        host: match[2] || defaultConfig.host,
        port: match[3] || defaultConfig.port,
        password: match[1] ? decodeURIComponent(match[1]) : "",
      };
    }
    return defaultConfig;
  }
}

/**
 * Assembles individual host, port, and password fields into a standard Redis URI.
 */
export function buildRedisUrl(host: string, port: string, password?: string): string {
  const cleanHost = host.trim() || "127.0.0.1";
  const cleanPort = port.trim() || "6379";
  const cleanPass = password?.trim() || "";

  if (cleanPass) {
    return `redis://:${encodeURIComponent(cleanPass)}@${cleanHost}:${cleanPort}`;
  }

  return `redis://${cleanHost}:${cleanPort}`;
}

/**
 * Produces a masked representation of the Redis URL for UI preview (hiding plain password).
 */
export function formatMaskedRedisUrl(host: string, port: string, password?: string): string {
  const cleanHost = host.trim() || "127.0.0.1";
  const cleanPort = port.trim() || "6379";
  const cleanPass = password?.trim() || "";

  if (cleanPass) {
    return `redis://:••••••••@${cleanHost}:${cleanPort}`;
  }

  return `redis://${cleanHost}:${cleanPort}`;
}
