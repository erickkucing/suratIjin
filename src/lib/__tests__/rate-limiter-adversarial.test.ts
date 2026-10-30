import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getClientIp,
  checkDualRateLimit,
  recordDualFailedAttempt,
  resetDualRateLimit,
  _clearRateLimitStoreForTesting,
  _clearAllRateLimitsForTesting,
} from "../rate-limiter";
import {
  initializeRedis,
  disconnectRedis,
  deleteCachePattern,
  getRedisClient,
  isRedisConnected,
  _resetRedisStateForTesting,
} from "../redis";

describe("Adversarial Challenge & Stress Suite for src/lib/rate-limiter.ts", () => {
  const TEST_REDIS_URL = "redis://127.0.0.1:6379";

  beforeEach(async () => {
    await disconnectRedis();
    _resetRedisStateForTesting();
    _clearRateLimitStoreForTesting();
  });

  afterEach(async () => {
    await deleteCachePattern("ratelimit:*").catch(() => {});
    await disconnectRedis();
    _resetRedisStateForTesting();
    _clearRateLimitStoreForTesting();
  });

  // ==========================================================================
  // CHALLENGE 1: High Concurrency Atomic INCR & Race Conditions
  // ==========================================================================
  describe("Challenge 1: High Concurrency & Atomic Race Conditions", () => {
    it("should handle 50 concurrent failed attempts atomically in Redis without race conditions", async () => {
      await initializeRedis(TEST_REDIS_URL);
      expect(isRedisConnected()).toBe(true);

      const key = "adv:concurrency:single:key";
      const limit = 10;
      const windowMs = 60 * 1000;

      // Fire 50 simultaneous attempts
      const attempts = Array.from({ length: 50 }, () =>
        recordFailedAttempt(key, limit, windowMs)
      );

      const results = await Promise.all(attempts);

      // Verify all resolved
      expect(results.length).toBe(50);

      // Extract remaining attempts and blocked states
      const blockedCount = results.filter((r) => r.isBlocked).length;
      const unblockedCount = results.filter((r) => !r.isBlocked).length;

      // Exactly 9 should be unblocked (counts 1..9), 41 blocked (counts 10..50)
      expect(unblockedCount).toBe(9);
      expect(blockedCount).toBe(41);

      // Subsequent check confirms blocked
      const check = await checkRateLimit(key, limit, windowMs);
      expect(check.isBlocked).toBe(true);
      expect(check.remainingAttempts).toBe(0);
    });

    it("should handle 50 concurrent dual-bucket attempts on same target with rotating IPs", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const targetUserKey = "adv:concurrency:dual:target:victim";
      const config = { maxAttempts: 5, windowMs: 60 * 1000 };

      // 50 rotating IPs attacking the victim account simultaneously
      const attacks = Array.from({ length: 50 }, (_, i) => {
        const ipKey = `adv:concurrency:ip:${i}`;
        return recordDualFailedAttempt(ipKey, targetUserKey, config, config);
      });

      const results = await Promise.all(attacks);

      // Victim account bucket must enforce limit of 5
      // 4 unblocked (counts 1..4), 46 blocked (counts 5..50)
      const unblocked = results.filter((r) => !r.isBlocked);
      const blocked = results.filter((r) => r.isBlocked);

      expect(unblocked.length).toBe(4);
      expect(blocked.length).toBe(46);

      // Check with a brand new IP 999: must still be blocked due to account bucket
      const freshCheck = await checkDualRateLimit("adv:concurrency:ip:999", targetUserKey, config, config);
      expect(freshCheck.isBlocked).toBe(true);
      expect(freshCheck.remainingAttempts).toBe(0);
    });
  });

  // ==========================================================================
  // CHALLENGE 2: Boundary & Extreme Values
  // ==========================================================================
  describe("Challenge 2: Boundary & Extreme Values", () => {
    it("should immediately block on first attempt when maxAttempts is zero", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const key = "adv:boundary:zero";

      const record = await recordFailedAttempt(key, 0, 60000);
      expect(record.isBlocked).toBe(true);
      expect(record.remainingAttempts).toBe(0);

      const check = await checkRateLimit(key, 0, 60000);
      expect(check.isBlocked).toBe(true);
      expect(check.remainingAttempts).toBe(0);
    });

    it("should handle negative windowMs gracefully (ttlSeconds >= 1)", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const key = "adv:boundary:negwindow";

      const res = await recordFailedAttempt(key, 5, -5000);
      expect(res.isBlocked).toBe(false);
      expect(res.remainingAttempts).toBe(4);
      expect(res.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it("should handle special characters, unicode, and colons in rate keys", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const specialKey = "user:attacker@domain.com:login/attempt?query=1&space= +!#$:🔑";

      const res = await recordFailedAttempt(specialKey, 3, 60000);
      expect(res.isBlocked).toBe(false);
      expect(res.remainingAttempts).toBe(2);

      const check = await checkRateLimit(specialKey, 3, 60000);
      expect(check.remainingAttempts).toBe(2);

      await resetRateLimit(specialKey);
      const after = await checkRateLimit(specialKey, 3, 60000);
      expect(after.remainingAttempts).toBe(3);
    });

    it("should handle already prefixed ratelimit: keys without double prefixing", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const prefixedKey = "ratelimit:custom:prefixed:key";

      await recordFailedAttempt(prefixedKey, 5, 60000);
      const check = await checkRateLimit(prefixedKey, 5, 60000);
      expect(check.remainingAttempts).toBe(4);

      await resetRateLimit(prefixedKey);
      const after = await checkRateLimit(prefixedKey, 5, 60000);
      expect(after.remainingAttempts).toBe(5);
    });
  });

  // ==========================================================================
  // CHALLENGE 3: IP Spoofing, Header Injection & Sanitization
  // ==========================================================================
  describe("Challenge 3: IP Spoofing & Header Sanitization", () => {
    it("should reject malicious header payloads and fallback to 127.0.0.1", async () => {
      const payloads = [
        "<script>alert(1)</script>",
        "'; DROP TABLE users; --",
        "../../../../etc/passwd",
        "127.0.0.1%0d%0aSet-Cookie:admin=1",
        "2001:db8::1; rm -rf /",
        "a".repeat(100), // Exceeds max 45 chars
        "",
      ];

      for (const payload of payloads) {
        const req = new Request("http://localhost:3000", {
          headers: { "x-forwarded-for": payload },
        });
        const ip = await getClientIp(req);
        expect(ip).toBe("127.0.0.1");
      }
    });

    it("should accept valid IPv4 and IPv6 addresses", async () => {
      const validIps = [
        "192.168.1.1",
        "10.0.0.254",
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
        "::1",
        "fe80::1ff:fe23:4567:890a",
      ];

      for (const validIp of validIps) {
        const req = new Request("http://localhost:3000", {
          headers: { "x-forwarded-for": validIp },
        });
        const ip = await getClientIp(req);
        expect(ip).toBe(validIp);
      }
    });

    it("should prioritize cf-connecting-ip > x-real-ip > x-forwarded-for", async () => {
      const req = new Request("http://localhost:3000", {
        headers: {
          "cf-connecting-ip": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3, 4.4.4.4",
        },
      });
      const ip = await getClientIp(req);
      expect(ip).toBe("1.1.1.1");

      const req2 = new Request("http://localhost:3000", {
        headers: {
          "x-real-ip": "2.2.2.2",
          "x-forwarded-for": "3.3.3.3, 4.4.4.4",
        },
      });
      expect(await getClientIp(req2)).toBe("2.2.2.2");
    });
  });

  // ==========================================================================
  // CHALLENGE 4: Chaos & Mid-Flight Redis Failure (Soft Fallback)
  // ==========================================================================
  describe("Challenge 4: Chaos & Mid-Flight Redis Failure", () => {
    it("should soft-fallback when Redis throws unexpected network error during recordFailedAttempt", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Mock pipeline().exec() rejection to simulate network drop
      const origPipeline = client!.pipeline.bind(client!);
      (client as any).pipeline = vi.fn().mockReturnValue({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error("ECONNRESET: Redis connection lost")),
      });

      const key = "adv:chaos:drop:record";
      // Must NOT throw uncaught error!
      const res = await recordFailedAttempt(key, 3, 60000);
      expect(res).toBeDefined();
      expect(res.isBlocked).toBe(false);
      expect(res.remainingAttempts).toBe(2);

      // Restore pipeline
      (client as any).pipeline = origPipeline;
    });

    it("should soft-fallback when Redis returns corrupted non-numeric data", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Write corrupted string into Redis
      const key = "adv:chaos:corrupt";
      await client!.set(`ratelimit:${key}`, "CORRUPTED_STRING");

      // checkRateLimit must not crash on NaN
      const check = await checkRateLimit(key, 5, 60000);
      expect(check).toBeDefined();
      // Should fall through to in-memory fallback (which has 5 remaining)
      expect(check.remainingAttempts).toBe(5);
    });

    it("should handle Redis TTL = -1 (key exists without expiration) safely", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      const key = "adv:chaos:notll";
      // Set key with count 3 but NO ttl
      await client!.set(`ratelimit:${key}`, "3");

      const check = await checkRateLimit(key, 5, 60000);
      expect(check.isBlocked).toBe(false);
      expect(check.remainingAttempts).toBe(2);
      expect(check.retryAfterSeconds).toBe(60); // Falls back to windowMs / 1000
    });
  });

  // ==========================================================================
  // CHALLENGE 5: Cross-Account & Cross-IP Isolation
  // ==========================================================================
  describe("Challenge 5: Dual-Bucket Cross-Account & Cross-IP Isolation", () => {
    it("should ensure blocking user A does not block user B from distinct IP", async () => {
      await initializeRedis(TEST_REDIS_URL);
      const config = { maxAttempts: 3, windowMs: 60000 };

      // Attack user A from IP 1 until blocked
      for (let i = 0; i < 3; i++) {
        await recordDualFailedAttempt("adv:ip:1", "adv:acc:userA", config, config);
      }

      const checkUserA = await checkDualRateLimit("adv:ip:1", "adv:acc:userA", config, config);
      expect(checkUserA.isBlocked).toBe(true);

      // Legitimate user B from IP 2: completely unblocked
      const checkUserB = await checkDualRateLimit("adv:ip:2", "adv:acc:userB", config, config);
      expect(checkUserB.isBlocked).toBe(false);
      expect(checkUserB.remainingAttempts).toBe(3);

      // User A from IP 2: blocked (account bucket protects)
      const checkUserAFromIp2 = await checkDualRateLimit("adv:ip:2", "adv:acc:userA", config, config);
      expect(checkUserAFromIp2.isBlocked).toBe(true);

      // User B from IP 1: blocked (IP bucket protects against credential stuffing)
      const checkUserBFromIp1 = await checkDualRateLimit("adv:ip:1", "adv:acc:userB", config, config);
      expect(checkUserBFromIp1.isBlocked).toBe(true);
    });
  });

  // ==========================================================================
  // CHALLENGE 6: Testing Cleanup Methods
  // ==========================================================================
  describe("Challenge 6: Cleanup Helpers Verification", () => {
    it("should clear both in-memory and Redis keys on _clearAllRateLimitsForTesting", async () => {
      await initializeRedis(TEST_REDIS_URL);

      await recordFailedAttempt("key1", 5, 60000);
      await recordFailedAttempt("key2", 5, 60000);

      const check1 = await checkRateLimit("key1", 5, 60000);
      expect(check1.remainingAttempts).toBe(4);

      await _clearAllRateLimitsForTesting();

      const after1 = await checkRateLimit("key1", 5, 60000);
      expect(after1.remainingAttempts).toBe(5);

      const after2 = await checkRateLimit("key2", 5, 60000);
      expect(after2.remainingAttempts).toBe(5);
    });

    it("should not throw on _clearRateLimitStoreForTesting when Redis is disconnected", () => {
      expect(() => _clearRateLimitStoreForTesting()).not.toThrow();
    });
  });
});
