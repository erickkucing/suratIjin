import { headers } from "next/headers";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// Global in-memory storage for sliding window rate limiting
const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired entries every 5 minutes to prevent memory leaks
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
    const xForwardedFor = headerObj.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }

    const xRealIp = headerObj.get("x-real-ip");
    if (xRealIp?.trim()) return xRealIp.trim();

    const cfConnectingIp = headerObj.get("cf-connecting-ip");
    if (cfConnectingIp?.trim()) return cfConnectingIp.trim();
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

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks whether a key is currently rate-limited without incrementing counter
 */
export function checkRateLimit(
  key: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS
): RateLimitCheckResult {
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
 * Records a failed attempt for a given key and returns current status
 */
export function recordFailedAttempt(
  key: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  windowMs = DEFAULT_WINDOW_MS
): RateLimitCheckResult {
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
 * Clears rate limit counter for a key upon successful authentication
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * For testing purposes: clears the entire in-memory store
 */
export function _clearRateLimitStoreForTesting(): void {
  rateLimitStore.clear();
}
