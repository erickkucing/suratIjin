import { headers } from "next/headers";
import {
  isRedisConnected,
  getRedisClient,
  deleteCache,
  deleteCachePattern,
  redisIncr,
} from "./redis";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// Global in-memory storage for fallback sliding window rate limiting
const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired in-memory entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // Unref timer in Node.js environment so it does not block process exit
  if (timer && typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}

/**
 * Extracts client IP from Next.js Request, Headers, or Next headers()
 */
function sanitizeIp(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length > 0 && trimmed.length <= 45 && /^[a-fA-F0-9:.]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export async function getClientIp(requestOrHeaders?: Request | Headers | null): Promise<string> {
  let headerObj: Headers | null = null;

  if (requestOrHeaders instanceof Request) {
    headerObj = requestOrHeaders.headers;
  } else if (requestOrHeaders instanceof Headers) {
    headerObj = requestOrHeaders;
  } else {
    try {
      headerObj = await headers();
    } catch {
      headerObj = null;
    }
  }

  if (headerObj) {
    const cfConnectingIp = headerObj.get("cf-connecting-ip");
    if (cfConnectingIp) {
      const sanitized = sanitizeIp(cfConnectingIp);
      if (sanitized) return sanitized;
    }

    const xRealIp = headerObj.get("x-real-ip");
    if (xRealIp) {
      const sanitized = sanitizeIp(xRealIp);
      if (sanitized) return sanitized;
    }

    const xForwardedFor = headerObj.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0];
      if (firstIp) {
        const sanitized = sanitizeIp(firstIp);
        if (sanitized) return sanitized;
      }
    }
  }

  return "127.0.0.1";
}

export interface RateLimitCheckResult {
  isBlocked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
  retryAfterMinutes: number;
  errorMessage?: string;
}

export interface RateLimitBucketConfig {
  maxAttempts?: number;
  windowMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function formatRedisRateKey(key: string): string {
  return key.startsWith("ratelimit:") ? key : `ratelimit:${key}`;
}

/**
 * Checks whether a key is currently rate-limited without incrementing counter.
 * Uses Redis if connected; otherwise falls back 100% to in-memory store.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS
): Promise<RateLimitCheckResult> {
  if (isRedisConnected()) {
    try {
      const client = getRedisClient();
      if (client) {
        const redisKey = formatRedisRateKey(key);
        const results = await client.pipeline().get(redisKey).ttl(redisKey).exec();

        if (results && results.length >= 2) {
          const [getErr, rawVal] = results[0];
          const [ttlErr, rawTtl] = results[1];

          if (!getErr && !ttlErr) {
            if (rawVal === null || rawVal === undefined) {
              return {
                isBlocked: false,
                remainingAttempts: maxAttempts,
                retryAfterSeconds: 0,
                retryAfterMinutes: 0,
              };
            }

            const count = Number(rawVal);
            const ttl = Number(rawTtl);

            if (Number.isFinite(count)) {
              if (ttl === -2) {
                // Key expired in Redis
                return {
                  isBlocked: false,
                  remainingAttempts: maxAttempts,
                  retryAfterSeconds: 0,
                  retryAfterMinutes: 0,
                };
              }

              const isBlocked = count >= maxAttempts;
              const retryAfterSeconds = ttl > 0 ? ttl : Math.max(1, Math.ceil(windowMs / 1000));
              const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

              return {
                isBlocked,
                remainingAttempts: Math.max(0, maxAttempts - count),
                retryAfterSeconds,
                retryAfterMinutes,
                errorMessage: isBlocked
                  ? `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${retryAfterMinutes} menit.`
                  : undefined,
              };
            }
          }
        }
      }
    } catch {
      // Redis operation failed; fall through to in-memory fallback
    }
  }

  // --- In-memory fallback ---
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    if (record && now > record.resetTime) {
      rateLimitStore.delete(key);
    }
    return {
      isBlocked: false,
      remainingAttempts: maxAttempts,
      retryAfterSeconds: 0,
      retryAfterMinutes: 0,
    };
  }

  const isBlocked = record.count >= maxAttempts;
  const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return {
    isBlocked,
    remainingAttempts: Math.max(0, maxAttempts - record.count),
    retryAfterSeconds,
    retryAfterMinutes,
    errorMessage: isBlocked
      ? `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${retryAfterMinutes} menit.`
      : undefined,
  };
}

/**
 * Records a failed attempt for a given key and returns current status.
 * Uses Redis INCR with TTL sliding window if connected; falls back to in-memory store.
 */
export async function recordFailedAttempt(
  key: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS
): Promise<RateLimitCheckResult> {
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  if (isRedisConnected()) {
    try {
      const redisKey = formatRedisRateKey(key);
      const count = await redisIncr(redisKey, ttlSeconds);

      if (count !== null && Number.isFinite(count)) {
        const isBlocked = count >= maxAttempts;
        const retryAfterSeconds = ttlSeconds;
        const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

        return {
          isBlocked,
          remainingAttempts: Math.max(0, maxAttempts - count),
          retryAfterSeconds,
          retryAfterMinutes,
          errorMessage: isBlocked
            ? `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${retryAfterMinutes} menit.`
            : undefined,
        };
      }
    } catch {
      // Redis operation failed; fall through to in-memory fallback
    }
  }

  // --- In-memory fallback ---
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
  } else {
    record.count += 1;
  }

  rateLimitStore.set(key, record);

  const isBlocked = record.count >= maxAttempts;
  const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return {
    isBlocked,
    remainingAttempts: Math.max(0, maxAttempts - record.count),
    retryAfterSeconds,
    retryAfterMinutes,
    errorMessage: isBlocked
      ? `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${retryAfterMinutes} menit.`
      : undefined,
  };
}

/**
 * Clears rate limit counter for a key upon successful authentication.
 * Clears both in-memory store and Redis cache.
 */
export async function resetRateLimit(key: string): Promise<void> {
  rateLimitStore.delete(key);

  if (isRedisConnected()) {
    try {
      const redisKey = formatRedisRateKey(key);
      await deleteCache(redisKey);
    } catch {
      // Redis delete error ignored; in-memory is already cleared
    }
  }
}

/**
 * Dual-bucket rate limit check: checks both an IP-scoped bucket and a Target-scoped bucket concurrently.
 * Protects against distributed / spoofed brute-force attacks targeting a single account or class.
 */
export async function checkDualRateLimit(
  ipKey: string,
  targetKey: string,
  ipConfig: RateLimitBucketConfig = { maxAttempts: DEFAULT_MAX_ATTEMPTS, windowMs: DEFAULT_WINDOW_MS },
  targetConfig: RateLimitBucketConfig = { maxAttempts: DEFAULT_MAX_ATTEMPTS, windowMs: DEFAULT_WINDOW_MS }
): Promise<RateLimitCheckResult> {
  const ipMaxAttempts = ipConfig.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const ipWindowMs = ipConfig.windowMs ?? DEFAULT_WINDOW_MS;
  const targetMaxAttempts = targetConfig.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const targetWindowMs = targetConfig.windowMs ?? DEFAULT_WINDOW_MS;

  const [ipCheck, targetCheck] = await Promise.all([
    checkRateLimit(ipKey, ipMaxAttempts, ipWindowMs),
    checkRateLimit(targetKey, targetMaxAttempts, targetWindowMs),
  ]);

  if (ipCheck.isBlocked) return ipCheck;
  if (targetCheck.isBlocked) return targetCheck;

  return ipCheck.remainingAttempts <= targetCheck.remainingAttempts ? ipCheck : targetCheck;
}

/**
 * Records failed attempt across both IP-scoped and Target-scoped buckets concurrently.
 */
export async function recordDualFailedAttempt(
  ipKey: string,
  targetKey: string,
  ipConfig: RateLimitBucketConfig = { maxAttempts: DEFAULT_MAX_ATTEMPTS, windowMs: DEFAULT_WINDOW_MS },
  targetConfig: RateLimitBucketConfig = { maxAttempts: DEFAULT_MAX_ATTEMPTS, windowMs: DEFAULT_WINDOW_MS }
): Promise<RateLimitCheckResult> {
  const ipMaxAttempts = ipConfig.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const ipWindowMs = ipConfig.windowMs ?? DEFAULT_WINDOW_MS;
  const targetMaxAttempts = targetConfig.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const targetWindowMs = targetConfig.windowMs ?? DEFAULT_WINDOW_MS;

  const [ipResult, targetResult] = await Promise.all([
    recordFailedAttempt(ipKey, ipMaxAttempts, ipWindowMs),
    recordFailedAttempt(targetKey, targetMaxAttempts, targetWindowMs),
  ]);

  if (ipResult.isBlocked) return ipResult;
  if (targetResult.isBlocked) return targetResult;

  return ipResult.remainingAttempts <= targetResult.remainingAttempts ? ipResult : targetResult;
}

/**
 * Resets both IP-scoped and Target-scoped rate limit buckets upon successful auth.
 */
export async function resetDualRateLimit(ipKey: string, targetKey: string): Promise<void> {
  await Promise.all([
    resetRateLimit(ipKey),
    resetRateLimit(targetKey),
  ]);
}

/**
 * For testing purposes: clears the entire in-memory store and initiates Redis cleanup.
 * Synchronous return preserves compatibility with existing non-async test hooks.
 */
export function _clearRateLimitStoreForTesting(): void {
  rateLimitStore.clear();
  if (isRedisConnected()) {
    deleteCachePattern("ratelimit:*").catch(() => {});
  }
}

/**
 * For testing purposes: awaits full cleanup of both in-memory store and Redis keys.
 */
export async function _clearAllRateLimitsForTesting(): Promise<void> {
  rateLimitStore.clear();
  if (isRedisConnected()) {
    try {
      await deleteCachePattern("ratelimit:*");
    } catch {}
  }
}
