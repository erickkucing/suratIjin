import Redis, { type RedisOptions } from "ioredis";

// ==========================================
// 1. Types & Global Singleton State
// ==========================================

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface RedisGlobalState {
  client: Redis | null;
  currentUrl: string | null;
  isConnected: boolean;
  circuitBreaker: {
    state: CircuitBreakerState;
    failures: number;
    openedAt: number;
  };
  initPromise?: Promise<boolean> | null;
}

const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 3,
  COOLDOWN_MS: 30000,
};

const globalForRedis = globalThis as unknown as {
  __suratIjinRedisState?: RedisGlobalState;
};

const state: RedisGlobalState = globalForRedis.__suratIjinRedisState ?? {
  client: null,
  currentUrl: null,
  isConnected: false,
  circuitBreaker: {
    state: "CLOSED",
    failures: 0,
    openedAt: 0,
  },
  initPromise: null,
};

// Always attach state to globalThis to ensure single instance across Next.js bundles and server actions
globalForRedis.__suratIjinRedisState = state;

// ==========================================
// 2. Circuit Breaker Internal Helpers
// ==========================================

function recordSuccess(): void {
  if (state.circuitBreaker.failures > 0 || state.circuitBreaker.state !== "CLOSED") {
    state.circuitBreaker.state = "CLOSED";
    state.circuitBreaker.failures = 0;
    state.circuitBreaker.openedAt = 0;
  }
}

function recordFailure(error: unknown): void {
  state.circuitBreaker.failures += 1;
  const now = Date.now();

  if (state.circuitBreaker.state === "CLOSED") {
    if (state.circuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
      state.circuitBreaker.state = "OPEN";
      state.circuitBreaker.openedAt = now;
      console.warn(
        `[Redis CircuitBreaker] Sirkuit OPEN setelah ${state.circuitBreaker.failures} error berturut-turut. Soft fallback aktif.`
      );
    }
  } else if (state.circuitBreaker.state === "HALF_OPEN") {
    state.circuitBreaker.state = "OPEN";
    state.circuitBreaker.openedAt = now;
    console.warn("[Redis CircuitBreaker] Probe HALF_OPEN gagal. Sirkuit kembali OPEN.");
  }
}

function canExecute(): boolean {
  if (state.circuitBreaker.state === "CLOSED") {
    return true;
  }

  const now = Date.now();
  if (now - state.circuitBreaker.openedAt >= CIRCUIT_BREAKER_CONFIG.COOLDOWN_MS) {
    state.circuitBreaker.state = "HALF_OPEN";
    return true;
  }

  return false;
}

// ==========================================
// 3. Client & Status Public Getters
// ==========================================

export function getRedisClient(): Redis | null {
  if (!isRedisConnected()) {
    return null;
  }
  return state.client;
}

export function isRedisConnected(): boolean {
  if (!state.client || !state.isConnected) return false;
  if (state.circuitBreaker.state === "OPEN") {
    const elapsed = Date.now() - state.circuitBreaker.openedAt;
    if (elapsed < CIRCUIT_BREAKER_CONFIG.COOLDOWN_MS) {
      return false;
    }
  }
  return true;
}

// ==========================================
// 4. Cache Helper Wrappers (Soft Fallback)
// ==========================================

export async function getCache<T>(key: string): Promise<T | null> {
  if (!isRedisConnected() || !state.client || !canExecute()) {
    return null;
  }

  try {
    const raw = await state.client.get(key);
    recordSuccess();

    if (raw === null || raw === undefined) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  } catch (error) {
    recordFailure(error);
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> {
  if (value === undefined) {
    return false;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }

  if (!isRedisConnected() || !state.client || !canExecute()) {
    return false;
  }

  try {
    if (typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      await state.client.set(key, serialized, "EX", Math.floor(ttlSeconds));
    } else {
      await state.client.set(key, serialized);
    }

    recordSuccess();
    return true;
  } catch (error) {
    recordFailure(error);
    return false;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  if (!isRedisConnected() || !state.client || !canExecute()) {
    return false;
  }

  try {
    await state.client.del(key);
    recordSuccess();
    return true;
  } catch (error) {
    recordFailure(error);
    return false;
  }
}

export async function deleteCachePattern(pattern: string): Promise<number> {
  if (!isRedisConnected() || !state.client || !canExecute()) {
    return 0;
  }

  try {
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await state.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys && keys.length > 0) {
        const count = await state.client.del(...keys);
        deletedCount += typeof count === "number" ? count : keys.length;
      }
    } while (cursor !== "0");

    recordSuccess();
    return deletedCount;
  } catch (error) {
    recordFailure(error);
    return 0;
  }
}

export async function redisIncr(
  key: string,
  ttlSeconds: number
): Promise<number | null> {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return null;
  }

  if (!isRedisConnected() || !state.client || !canExecute()) {
    return null;
  }

  try {
    const results = await state.client
      .pipeline()
      .incr(key)
      .expire(key, Math.floor(ttlSeconds))
      .exec();

    if (!results || !Array.isArray(results) || results.length < 2) {
      return null;
    }

    const [incrErr, count] = results[0];
    if (incrErr) {
      throw incrErr;
    }

    const [expireErr] = results[1];
    if (expireErr) {
      throw expireErr;
    }

    const num = typeof count === "number" ? count : Number(count);
    recordSuccess();
    return Number.isFinite(num) ? num : null;
  } catch (error) {
    recordFailure(error);
    return null;
  }
}

// ==========================================
// 5. Test, Initialize & Disconnect
// ==========================================

export async function testRedisConnection(
  url: string
): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const trimmed = url ? url.trim() : "";
  if (!trimmed) {
    return {
      connected: false,
      latencyMs: 0,
      error: "URL Redis tidak boleh kosong",
    };
  }

  let testClient: Redis | null = null;
  try {
    testClient = new Redis(trimmed, {
      connectTimeout: 3000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    testClient.on("error", () => {});

    const startTime = performance.now();
    await testClient.connect();
    const reply = await testClient.ping();
    const latencyMs = Math.round(performance.now() - startTime);

    if (reply !== "PONG") {
      throw new Error(`Respons ping tidak valid: ${reply}`);
    }

    return {
      connected: true,
      latencyMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      latencyMs: 0,
      error: msg,
    };
  } finally {
    if (testClient) {
      try {
        await testClient.quit();
      } catch {
        testClient.disconnect();
      }
    }
  }
}

export async function initializeRedis(url: string): Promise<boolean> {
  const trimmedUrl = url ? url.trim() : "";
  if (!trimmedUrl) {
    return false;
  }

  if (
    state.client &&
    state.currentUrl === trimmedUrl &&
    state.isConnected &&
    state.client.status === "ready"
  ) {
    return true;
  }

  if (state.initPromise && state.currentUrl === trimmedUrl) {
    return state.initPromise;
  }

  if (state.initPromise) {
    try {
      await state.initPromise;
    } catch {}
    if (
      state.client &&
      state.currentUrl === trimmedUrl &&
      state.isConnected &&
      state.client.status === "ready"
    ) {
      return true;
    }
  }

  const doInit = async (): Promise<boolean> => {
    if (state.client) {
      await disconnectRedis();
    }

    try {
      state.currentUrl = trimmedUrl;
      const options: RedisOptions = {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        commandTimeout: 1000,
        enableOfflineQueue: false,
        lazyConnect: true,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      };

      const client = new Redis(trimmedUrl, options);

      client.on("ready", () => {
        state.isConnected = true;
        recordSuccess();
      });

      client.on("error", (err) => {
        state.isConnected = false;
        recordFailure(err);
      });

      client.on("close", () => {
        state.isConnected = false;
      });

      client.on("end", () => {
        state.isConnected = false;
      });

      state.client = client;

      await client.connect();
      state.isConnected = true;
      return true;
    } catch (error) {
      recordFailure(error);
      state.isConnected = false;
      if (state.client) {
        state.client.disconnect();
        state.client = null;
        state.currentUrl = null;
      }
      return false;
    } finally {
      state.initPromise = null;
    }
  };

  state.initPromise = doInit();
  return state.initPromise;
}

export async function disconnectRedis(): Promise<void> {
  state.initPromise = null;
  const client = state.client;
  state.client = null;
  state.currentUrl = null;
  state.isConnected = false;
  state.circuitBreaker.state = "CLOSED";
  state.circuitBreaker.failures = 0;
  state.circuitBreaker.openedAt = 0;

  if (client) {
    client.removeAllListeners();
    client.on("error", () => {});
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

export function _resetRedisStateForTesting(): void {
  state.initPromise = null;
  if (state.client) {
    try {
      state.client.disconnect();
    } catch {}
  }
  state.client = null;
  state.currentUrl = null;
  state.isConnected = false;
  state.circuitBreaker.state = "CLOSED";
  state.circuitBreaker.failures = 0;
  state.circuitBreaker.openedAt = 0;
}
