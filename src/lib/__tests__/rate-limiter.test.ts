import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getClientIp,
  _clearRateLimitStoreForTesting,
  checkDualRateLimit,
  recordDualFailedAttempt,
  resetDualRateLimit,
} from "../rate-limiter";
import {
  initializeRedis,
  disconnectRedis,
  deleteCachePattern,
  getCache,
  isRedisConnected,
  _resetRedisStateForTesting,
} from "../redis";

describe("Rate Limiter (Anti Brute-Force)", () => {
  beforeEach(async () => {
    // Isolate in-memory tests: ensure Redis is disconnected
    await disconnectRedis();
    _resetRedisStateForTesting();
    _clearRateLimitStoreForTesting();
    vi.useRealTimers();
  });

  it("should allow initial attempts with full remaining quota", async () => {
    const key = "test:login:127.0.0.1:teacher";
    const status = await checkRateLimit(key, 5, 15 * 60 * 1000);

    expect(status.isBlocked).toBe(false);
    expect(status.remainingAttempts).toBe(5);
    expect(status.errorMessage).toBeUndefined();
  });

  it("should track failed attempts and block on 5th attempt", async () => {
    const key = "test:login:127.0.0.1:erick";

    for (let i = 1; i <= 4; i++) {
      const result = await recordFailedAttempt(key, 5, 15 * 60 * 1000);
      expect(result.isBlocked).toBe(false);
      expect(result.remainingAttempts).toBe(5 - i);
    }

    // 5th attempt
    const blockedResult = await recordFailedAttempt(key, 5, 15 * 60 * 1000);
    expect(blockedResult.isBlocked).toBe(true);
    expect(blockedResult.remainingAttempts).toBe(0);
    expect(blockedResult.errorMessage).toContain("Terlalu banyak percobaan gagal");
    expect(blockedResult.retryAfterMinutes).toBeGreaterThanOrEqual(1);

    // Subsequent check is also blocked
    const check = await checkRateLimit(key, 5, 15 * 60 * 1000);
    expect(check.isBlocked).toBe(true);
    expect(check.errorMessage).toBeDefined();
  });

  it("should reset rate limit on successful authentication", async () => {
    const key = "test:login:127.0.0.1:admin";

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await recordFailedAttempt(key, 5, 15 * 60 * 1000);
    }

    const midCheck = await checkRateLimit(key);
    expect(midCheck.remainingAttempts).toBe(1);

    // Success -> reset
    await resetRateLimit(key);

    const check = await checkRateLimit(key);
    expect(check.isBlocked).toBe(false);
    expect(check.remainingAttempts).toBe(5);
  });

  it("should automatically unblock after window expiration", async () => {
    vi.useFakeTimers();
    const key = "test:window:expired";
    const windowMs = 5000;

    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(key, 5, windowMs);
    }

    const blockedCheck = await checkRateLimit(key, 5, windowMs);
    expect(blockedCheck.isBlocked).toBe(true);

    // Advance past windowMs
    vi.advanceTimersByTime(5100);

    const afterExpire = await checkRateLimit(key, 5, windowMs);
    expect(afterExpire.isBlocked).toBe(false);
    expect(afterExpire.remainingAttempts).toBe(5);
  });

  it("should extract client IP from headers correctly", async () => {
    const reqWithForwarded = new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
    });
    const ip = await getClientIp(reqWithForwarded);
    expect(ip).toBe("203.0.113.195");

    const reqWithRealIp = new Request("http://localhost:3000", {
      headers: { "x-real-ip": "198.51.100.4" },
    });
    expect(await getClientIp(reqWithRealIp)).toBe("198.51.100.4");

    const reqWithCf = new Request("http://localhost:3000", {
      headers: {
        "cf-connecting-ip": "198.51.100.99",
        "x-forwarded-for": "10.0.0.1",
      },
    });
    expect(await getClientIp(reqWithCf)).toBe("198.51.100.99");

    const reqWithMaliciousIp = new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "malicious_script_injection_payload" },
    });
    expect(await getClientIp(reqWithMaliciousIp)).toBe("127.0.0.1");

    const reqEmpty = new Request("http://localhost:3000");
    expect(await getClientIp(reqEmpty)).toBe("127.0.0.1");
  });

  describe("SEC-FINDING-02: Dual-Bucket Rate Limiting (IP + Target Protection)", () => {
    it("should block when target account reaches max attempts even if IPs rotate (spoofing prevention)", async () => {
      const targetUserKey = "login:account:erick";
      const config = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

      // Attacker rotates 5 distinct spoofed IPs against the same account
      for (let i = 1; i <= 4; i++) {
        const spoofedIpKey = `login:ip:10.0.0.${i}`;
        const res = await recordDualFailedAttempt(spoofedIpKey, targetUserKey, config, config);
        expect(res.isBlocked).toBe(false);
      }

      // 5th attempt from yet another new IP
      const freshIpKey = "login:ip:10.0.0.99";
      const blockedRes = await recordDualFailedAttempt(freshIpKey, targetUserKey, config, config);
      expect(blockedRes.isBlocked).toBe(true);
      expect(blockedRes.errorMessage).toContain("Terlalu banyak percobaan gagal");

      // Check with a 6th new IP should immediately be blocked due to account bucket
      const check = await checkDualRateLimit("login:ip:10.0.0.100", targetUserKey, config, config);
      expect(check.isBlocked).toBe(true);
    });

    it("should reset both IP and target buckets on successful authentication", async () => {
      const ipKey = "login:ip:192.168.1.50";
      const userKey = "login:account:wildwina";

      await recordDualFailedAttempt(ipKey, userKey);
      await recordDualFailedAttempt(ipKey, userKey);

      await resetDualRateLimit(ipKey, userKey);

      const check = await checkDualRateLimit(ipKey, userKey);
      expect(check.isBlocked).toBe(false);
      expect(check.remainingAttempts).toBeGreaterThanOrEqual(5);
    });
  });

  // ==========================================================================
  // Redis-Backed Rate Limiting Path (Distributed Sliding Window)
  // ==========================================================================
  describe("Redis-Backed Rate Limiting Path (Distributed Sliding Window)", () => {
    const TEST_REDIS_URL = "redis://127.0.0.1:6379";

    beforeEach(async () => {
      await initializeRedis(TEST_REDIS_URL);
      await deleteCachePattern("ratelimit:*");
      _clearRateLimitStoreForTesting();
    });

    afterEach(async () => {
      await deleteCachePattern("ratelimit:*");
      await disconnectRedis();
      _resetRedisStateForTesting();
      _clearRateLimitStoreForTesting();
    });

    it("should allow initial attempts with full remaining quota on Redis path", async () => {
      const key = "redis:test:login:initial";
      const status = await checkRateLimit(key, 5, 60 * 1000);

      expect(status.isBlocked).toBe(false);
      expect(status.remainingAttempts).toBe(5);
      expect(status.retryAfterSeconds).toBe(0);
      expect(status.errorMessage).toBeUndefined();
    });

    it("should atomically record failed attempts via Redis INCR and block on 5th attempt", async () => {
      const key = "redis:test:login:bruteforce";
      const limit = 5;
      const windowMs = 60 * 1000;

      for (let i = 1; i <= 4; i++) {
        const res = await recordFailedAttempt(key, limit, windowMs);
        expect(res.isBlocked).toBe(false);
        expect(res.remainingAttempts).toBe(limit - i);
      }

      // 5th attempt blocks
      const blockedRes = await recordFailedAttempt(key, limit, windowMs);
      expect(blockedRes.isBlocked).toBe(true);
      expect(blockedRes.remainingAttempts).toBe(0);
      expect(blockedRes.errorMessage).toContain("Terlalu banyak percobaan gagal");
      expect(blockedRes.retryAfterMinutes).toBeGreaterThanOrEqual(1);

      // Verify persistent state in Redis
      const countInRedis = await getCache<number>(`ratelimit:${key}`);
      expect(countInRedis).toBe(5);

      // Subsequent check confirms blocked status
      const check = await checkRateLimit(key, limit, windowMs);
      expect(check.isBlocked).toBe(true);
      expect(check.remainingAttempts).toBe(0);
      expect(check.errorMessage).toBeDefined();
    });

    it("should delete rate limit key in Redis on resetRateLimit", async () => {
      const key = "redis:test:login:reset";
      const limit = 5;

      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt(key, limit, 60 * 1000);
      }

      const midCheck = await checkRateLimit(key, limit, 60 * 1000);
      expect(midCheck.remainingAttempts).toBe(2);

      // Reset
      await resetRateLimit(key);

      // Verify Redis key is deleted
      const rawInRedis = await getCache(`ratelimit:${key}`);
      expect(rawInRedis).toBeNull();

      // Check reflects full quota restored
      const afterCheck = await checkRateLimit(key, limit, 60 * 1000);
      expect(afterCheck.isBlocked).toBe(false);
      expect(afterCheck.remainingAttempts).toBe(limit);
    });

    it("should enforce dual-bucket rate limiting in Redis (account bucket blocks rotating IPs)", async () => {
      const targetUserKey = "redis:dual:target:user1";
      const config = { maxAttempts: 5, windowMs: 60 * 1000 };

      // 4 attempts with 4 distinct IPs
      for (let i = 1; i <= 4; i++) {
        const ipKey = `redis:dual:ip:10.0.1.${i}`;
        const res = await recordDualFailedAttempt(ipKey, targetUserKey, config, config);
        expect(res.isBlocked).toBe(false);
      }

      // 5th attempt from a new IP blocks due to account bucket
      const fifthIpKey = "redis:dual:ip:10.0.1.99";
      const blocked = await recordDualFailedAttempt(fifthIpKey, targetUserKey, config, config);
      expect(blocked.isBlocked).toBe(true);
      expect(blocked.errorMessage).toContain("Terlalu banyak percobaan gagal");

      // Fresh IP is also blocked on check
      const checkFresh = await checkDualRateLimit("redis:dual:ip:10.0.1.200", targetUserKey, config, config);
      expect(checkFresh.isBlocked).toBe(true);

      // Reset dual rate limit
      await resetDualRateLimit(fifthIpKey, targetUserKey);
      const afterReset = await checkDualRateLimit(fifthIpKey, targetUserKey, config, config);
      expect(afterReset.isBlocked).toBe(false);
      expect(afterReset.remainingAttempts).toBe(5);
    });

    it("should seamlessly soft-fallback to in-memory store when Redis is disconnected", async () => {
      // Disconnect Redis to trigger soft fallback
      await disconnectRedis();
      expect(isRedisConnected()).toBe(false);

      const fallbackKey = "fallback:test:key";
      const limit = 3;

      for (let i = 1; i <= 2; i++) {
        const res = await recordFailedAttempt(fallbackKey, limit, 60 * 1000);
        expect(res.isBlocked).toBe(false);
        expect(res.remainingAttempts).toBe(limit - i);
      }

      const blockedRes = await recordFailedAttempt(fallbackKey, limit, 60 * 1000);
      expect(blockedRes.isBlocked).toBe(true);
      expect(blockedRes.remainingAttempts).toBe(0);

      const check = await checkRateLimit(fallbackKey, limit, 60 * 1000);
      expect(check.isBlocked).toBe(true);

      await resetRateLimit(fallbackKey);
      const resetCheck = await checkRateLimit(fallbackKey, limit, 60 * 1000);
      expect(resetCheck.isBlocked).toBe(false);
      expect(resetCheck.remainingAttempts).toBe(limit);
    });
  });
});
