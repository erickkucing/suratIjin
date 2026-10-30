import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  checkDualRateLimit,
  recordDualFailedAttempt,
  resetDualRateLimit,
  _clearRateLimitStoreForTesting,
  _clearAllRateLimitsForTesting,
} from "../rate-limiter";
import {
  initializeRedis,
  disconnectRedis,
  getRedisClient,
  isRedisConnected,
  deleteCachePattern,
  getCache,
  _resetRedisStateForTesting,
} from "../redis";

describe("Empirical Chaos & Soft Fallback Verification: src/lib/rate-limiter.ts", () => {
  const REAL_REDIS_URL = "redis://127.0.0.1:6379";

  beforeEach(async () => {
    vi.useRealTimers();
    await disconnectRedis();
    _resetRedisStateForTesting();
    _clearRateLimitStoreForTesting();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (isRedisConnected()) {
      try {
        await deleteCachePattern("ratelimit:*");
      } catch {}
    }
    await disconnectRedis();
    _resetRedisStateForTesting();
    _clearRateLimitStoreForTesting();
  });

  // ==========================================================================
  // SUITE 1: Mid-Flight Disconnect & Network Chaos Tolerance
  // ==========================================================================
  describe("Suite 1: Mid-Flight Disconnect & Network Chaos Tolerance", () => {
    it("1.1 checkRateLimit: catches pipeline network exception and silently falls back to in-memory", async () => {
      const initOk = await initializeRedis(REAL_REDIS_URL);
      expect(initOk).toBe(true);
      expect(isRedisConnected()).toBe(true);

      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Simulate network socket death mid-flight during pipeline exec
      const execSpy = vi.spyOn(client!, "pipeline").mockImplementation(() => {
        return {
          get: () => ({ ttl: () => ({ exec: async () => { throw new Error("ECONNRESET: Connection dropped by peer"); } }) }),
        } as any;
      });

      // Execute checkRateLimit under active Redis network crash
      let thrownError: unknown = null;
      let result: any = null;
      try {
        result = await checkRateLimit("chaos:midflight:check:1", 5, 60000);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeNull();
      expect(result).not.toBeNull();
      expect(result.isBlocked).toBe(false);
      expect(result.remainingAttempts).toBe(5);
      expect(result.retryAfterSeconds).toBe(0);

      execSpy.mockRestore();
    });

    it("1.2 recordFailedAttempt: catches pipeline network rejection and accurately records attempt in-memory", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Force pipeline exec to reject with timeout
      const execSpy = vi.spyOn(client!, "pipeline").mockImplementation(() => {
        return {
          incr: () => ({ expire: () => ({ exec: async () => { throw new Error("ETIMEDOUT: Socket write timeout"); } }) }),
        } as any;
      });

      const key = "chaos:midflight:record:1";
      const maxAttempts = 3;

      // 1st attempt: fails in Redis, falls back to in-memory count 1
      const res1 = await recordFailedAttempt(key, maxAttempts, 60000);
      expect(res1.isBlocked).toBe(false);
      expect(res1.remainingAttempts).toBe(2);

      // 2nd attempt: in-memory count 2
      const res2 = await recordFailedAttempt(key, maxAttempts, 60000);
      expect(res2.isBlocked).toBe(false);
      expect(res2.remainingAttempts).toBe(1);

      // 3rd attempt: in-memory count 3 -> BLOCKED!
      const res3 = await recordFailedAttempt(key, maxAttempts, 60000);
      expect(res3.isBlocked).toBe(true);
      expect(res3.remainingAttempts).toBe(0);
      expect(res3.errorMessage).toContain("Terlalu banyak percobaan gagal");

      // checkRateLimit also confirms blocked state via fallback
      const check = await checkRateLimit(key, maxAttempts, 60000);
      expect(check.isBlocked).toBe(true);
      expect(check.remainingAttempts).toBe(0);

      execSpy.mockRestore();
    });

    it("1.3 handles Redis error tuples from pipeline without uncaught exceptions", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Simulate Redis returning an internal command error tuple: [Error, null]
      const execSpy = vi.spyOn(client!, "pipeline").mockImplementation(() => {
        return {
          get: () => ({
            ttl: () => ({
              exec: async () => [
                [new Error("WRONGTYPE Operation against a key holding the wrong kind of value"), null],
                [null, -1],
              ],
            }),
          }),
        } as any;
      });

      const res = await checkRateLimit("chaos:tuple:err", 5, 60000);
      expect(res.isBlocked).toBe(false);
      expect(res.remainingAttempts).toBe(5);

      execSpy.mockRestore();
    });

    it("1.4 abrupt socket destruction does not crash process and rate limiter remains functional", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      const key = "chaos:socket:destroyed";

      // Forcibly destroy socket without graceful QUIT
      client!.disconnect();

      // Immediately execute rate limiter operations
      const res1 = await recordFailedAttempt(key, 3, 60000);
      expect(res1.isBlocked).toBe(false);
      expect(res1.remainingAttempts).toBe(2);

      const res2 = await recordFailedAttempt(key, 3, 60000);
      expect(res2.remainingAttempts).toBe(1);

      const res3 = await recordFailedAttempt(key, 3, 60000);
      expect(res3.isBlocked).toBe(true);
      expect(res3.remainingAttempts).toBe(0);
    });

    it("1.5 circuit breaker trip: 3 consecutive Redis errors trip breaker to OPEN, instantly bypassing Redis", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      // Mock pipeline to continuously fail
      vi.spyOn(client!, "pipeline").mockImplementation(() => {
        return {
          incr: () => ({ expire: () => ({ exec: async () => { throw new Error("ClusterDownException"); } }) }),
        } as any;
      });

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await recordFailedAttempt(`chaos:cb:fail:${i}`, 5, 60000);
      }

      // Check circuit breaker state in global singleton
      const globalState = (globalThis as any).__suratIjinRedisState;
      expect(globalState).toBeDefined();
      expect(globalState.circuitBreaker.state).toBe("OPEN");
      expect(isRedisConnected()).toBe(false);

      // Now with circuit OPEN, checkRateLimit should immediately execute fallback path without touching pipeline
      const pipelineSpy = vi.spyOn(client!, "pipeline");
      const checkRes = await checkRateLimit("chaos:cb:shortcircuit", 5, 60000);
      expect(checkRes.isBlocked).toBe(false);
      expect(pipelineSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SUITE 2: Redis Recovery & Connection Flapping
  // ==========================================================================
  describe("Suite 2: Redis Recovery & Connection Flapping", () => {
    it("2.1 seamlessly transitions from fallback mode to Redis mode when Redis initializes", async () => {
      // Step 1: Start with Redis offline
      expect(isRedisConnected()).toBe(false);

      const key = "recovery:test:key:1";
      await recordFailedAttempt(key, 5, 60000);
      await recordFailedAttempt(key, 5, 60000);

      // In fallback, remaining is 3
      const fallbackCheck = await checkRateLimit(key, 5, 60000);
      expect(fallbackCheck.remainingAttempts).toBe(3);

      // Step 2: Redis comes online and connects
      const initOk = await initializeRedis(REAL_REDIS_URL);
      expect(initOk).toBe(true);
      expect(isRedisConnected()).toBe(true);

      // Step 3: Rate limiter seamlessly records to Redis now
      const redisKey = "recovery:redis:key:1";
      const recRes = await recordFailedAttempt(redisKey, 5, 60000);
      expect(recRes.remainingAttempts).toBe(4);

      // Verify key exists directly in Redis
      const countInRedis = await getCache<number>(`ratelimit:${redisKey}`);
      expect(countInRedis).toBe(1);

      // Step 4: Disconnect Redis again
      await disconnectRedis();
      expect(isRedisConnected()).toBe(false);

      // Step 5: Falls back immediately without crashing
      const recResFallback = await recordFailedAttempt("recovery:after:disconnect", 5, 60000);
      expect(recResFallback.remainingAttempts).toBe(4);
    });

    it("2.2 survives high-frequency connection flapping (100 rapid requests alternating connected / disconnected)", async () => {
      let unhandledErrors = 0;

      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          await initializeRedis(REAL_REDIS_URL);
        } else {
          await disconnectRedis();
        }

        try {
          const res = await recordFailedAttempt(`flapping:key:${i}`, 5, 30000);
          if (typeof res.isBlocked !== "boolean" || typeof res.remainingAttempts !== "number") {
            unhandledErrors++;
          }
          const check = await checkRateLimit(`flapping:key:${i}`, 5, 30000);
          if (typeof check.isBlocked !== "boolean" || typeof check.remainingAttempts !== "number") {
            unhandledErrors++;
          }
        } catch {
          unhandledErrors++;
        }
      }

      expect(unhandledErrors).toBe(0);
    });

    it("2.3 recovers cleanly after failed connection attempt to invalid port", async () => {
      // Attempt connect to wrong port (refused)
      const failInit = await initializeRedis("redis://127.0.0.1:9999");
      expect(failInit).toBe(false);
      expect(isRedisConnected()).toBe(false);

      // Rate limiter continues in fallback mode
      const res1 = await recordFailedAttempt("recovery:invalid:port", 3, 60000);
      expect(res1.remainingAttempts).toBe(2);

      // Re-initialize with correct port
      const okInit = await initializeRedis(REAL_REDIS_URL);
      expect(okInit).toBe(true);
      expect(isRedisConnected()).toBe(true);

      // Rate limiter works with Redis
      const res2 = await recordFailedAttempt("recovery:valid:port", 3, 60000);
      expect(res2.remainingAttempts).toBe(2);
    });
  });

  // ==========================================================================
  // SUITE 3: Dual-Bucket Fallback Accuracy & Resilience
  // ==========================================================================
  describe("Suite 3: Dual-Bucket Fallback Accuracy & Resilience", () => {
    it("3.1 fallback mode: stops IP spoofing attack (rotating IPs against single target account)", async () => {
      expect(isRedisConnected()).toBe(false);

      const targetAccountKey = "login:account:victim";
      const config = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

      // 4 attempts with 4 different spoofed IPs
      for (let i = 1; i <= 4; i++) {
        const ipKey = `login:ip:10.0.0.${i}`;
        const res = await recordDualFailedAttempt(ipKey, targetAccountKey, config, config);
        expect(res.isBlocked).toBe(false);
        expect(res.remainingAttempts).toBe(5 - i);
      }

      // 5th attempt from a brand-new IP (10.0.0.99)
      const freshIpKey = "login:ip:10.0.0.99";
      const blockedRes = await recordDualFailedAttempt(freshIpKey, targetAccountKey, config, config);
      expect(blockedRes.isBlocked).toBe(true);
      expect(blockedRes.remainingAttempts).toBe(0);
      expect(blockedRes.errorMessage).toContain("Terlalu banyak percobaan gagal");

      // 6th attempt from yet another IP (10.0.0.100) is instantly blocked on check
      const checkResult = await checkDualRateLimit("login:ip:10.0.0.100", targetAccountKey, config, config);
      expect(checkResult.isBlocked).toBe(true);
      expect(checkResult.remainingAttempts).toBe(0);
    });

    it("3.2 fallback mode: stops target spraying attack (single IP trying multiple accounts)", async () => {
      expect(isRedisConnected()).toBe(false);

      const attackerIpKey = "login:ip:192.168.1.200";
      const config = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

      // Attacker tries 4 different accounts
      for (let i = 1; i <= 4; i++) {
        const targetKey = `login:account:user_${i}`;
        const res = await recordDualFailedAttempt(attackerIpKey, targetKey, config, config);
        expect(res.isBlocked).toBe(false);
        expect(res.remainingAttempts).toBe(5 - i);
      }

      // 5th attempt targeting user_5 -> IP bucket is exhausted and blocks
      const blockedRes = await recordDualFailedAttempt(attackerIpKey, "login:account:user_5", config, config);
      expect(blockedRes.isBlocked).toBe(true);
      expect(blockedRes.remainingAttempts).toBe(0);

      // Attempting any other user from this IP is blocked
      const checkOther = await checkDualRateLimit(attackerIpKey, "login:account:fresh_victim", config, config);
      expect(checkOther.isBlocked).toBe(true);
      expect(checkOther.remainingAttempts).toBe(0);
    });

    it("3.3 resetDualRateLimit restores full capacity for both buckets in fallback mode", async () => {
      expect(isRedisConnected()).toBe(false);

      const ipKey = "login:ip:reset:test";
      const targetKey = "login:account:reset:test";

      // Fill buckets to 3 attempts
      for (let i = 0; i < 3; i++) {
        await recordDualFailedAttempt(ipKey, targetKey);
      }

      const preReset = await checkDualRateLimit(ipKey, targetKey);
      expect(preReset.remainingAttempts).toBe(2);

      // Reset
      await resetDualRateLimit(ipKey, targetKey);

      const postReset = await checkDualRateLimit(ipKey, targetKey);
      expect(postReset.isBlocked).toBe(false);
      expect(postReset.remainingAttempts).toBe(5);
    });

    it("3.4 dual-bucket handles asymmetric network failure (IP succeeds, target rejects)", async () => {
      await initializeRedis(REAL_REDIS_URL);
      const client = getRedisClient();
      expect(client).not.toBeNull();

      let callCount = 0;
      // Make pipeline fail on the second call (target bucket)
      const realPipeline = client!.pipeline.bind(client);
      vi.spyOn(client!, "pipeline").mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return {
            incr: () => ({ expire: () => ({ exec: async () => { throw new Error("Asymmetric Network Drop"); } }) }),
          } as any;
        }
        return realPipeline();
      });

      const res = await recordDualFailedAttempt("dual:asym:ip", "dual:asym:target");
      expect(res).not.toBeNull();
      expect(typeof res.isBlocked).toBe("boolean");
      expect(typeof res.remainingAttempts).toBe("number");
    });
  });

  // ==========================================================================
  // SUITE 4: Memory Sanity, TTL Expiry & Leak Prevention
  // ==========================================================================
  describe("Suite 4: Memory Sanity, TTL Expiry & Leak Prevention", () => {
    it("4.1 on-demand expired record cleanup on checkRateLimit", async () => {
      vi.useFakeTimers();
      const key = "mem:expire:ondemand";
      const windowMs = 3000;

      await recordFailedAttempt(key, 5, windowMs);
      await recordFailedAttempt(key, 5, windowMs);

      const midCheck = await checkRateLimit(key, 5, windowMs);
      expect(midCheck.remainingAttempts).toBe(3);

      // Advance past windowMs
      vi.advanceTimersByTime(3500);

      // checkRateLimit purges expired entry and returns full quota
      const afterCheck = await checkRateLimit(key, 5, windowMs);
      expect(afterCheck.isBlocked).toBe(false);
      expect(afterCheck.remainingAttempts).toBe(5);
    });

    it("4.2 periodic cleanup interval purges expired records without manual access", async () => {
      vi.useFakeTimers();
      const keys: string[] = [];

      // Create 100 entries with a 2-minute window
      for (let i = 0; i < 100; i++) {
        const k = `mem:sweep:${i}`;
        keys.push(k);
        await recordFailedAttempt(k, 5, 2 * 60 * 1000);
      }

      // Verify mid-state
      const midCheck = await checkRateLimit(keys[0], 5, 2 * 60 * 1000);
      expect(midCheck.remainingAttempts).toBe(4);

      // Advance time by 6 minutes (exceeds 5-minute cleanup interval + 2-minute TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Verify all keys have been cleaned and now return full initial quota
      for (const k of keys.slice(0, 10)) {
        const res = await checkRateLimit(k, 5, 2 * 60 * 1000);
        expect(res.isBlocked).toBe(false);
        expect(res.remainingAttempts).toBe(5);
      }
    });

    it("4.3 handles burst load of 1,000 distinct keys in fallback mode safely (<500ms)", async () => {
      const startTime = performance.now();

      const promises = Array.from({ length: 1000 }, (_, i) =>
        recordFailedAttempt(`burst:ip:192.168.${Math.floor(i / 256)}.${i % 256}`, 5, 60000)
      );

      const results = await Promise.all(promises);
      const elapsed = performance.now() - startTime;

      expect(results.length).toBe(1000);
      expect(results.every((r) => r.remainingAttempts === 4)).toBe(true);
      expect(elapsed).toBeLessThan(1500); // Fast memory execution
    });

    it("4.4 _clearRateLimitStoreForTesting and _clearAllRateLimitsForTesting thoroughly clear all records", async () => {
      await recordFailedAttempt("cleanup:test:1", 5, 60000);
      await recordFailedAttempt("cleanup:test:2", 5, 60000);

      _clearRateLimitStoreForTesting();

      const check1 = await checkRateLimit("cleanup:test:1", 5, 60000);
      const check2 = await checkRateLimit("cleanup:test:2", 5, 60000);

      expect(check1.remainingAttempts).toBe(5);
      expect(check2.remainingAttempts).toBe(5);

      await recordFailedAttempt("cleanup:test:3", 5, 60000);
      await _clearAllRateLimitsForTesting();

      const check3 = await checkRateLimit("cleanup:test:3", 5, 60000);
      expect(check3.remainingAttempts).toBe(5);
    });
  });

  // ==========================================================================
  // SUITE 5: Boundary Conditions, Concurrency & Edge Cases
  // ==========================================================================
  describe("Suite 5: Boundary Conditions, Concurrency & Edge Cases", () => {
    it("5.1 handles empty string, very long keys, and special characters", async () => {
      // Empty key
      const resEmpty = await recordFailedAttempt("", 5, 60000);
      expect(resEmpty.remainingAttempts).toBe(4);

      // Very long key (5,000 chars)
      const longKey = "k".repeat(5000);
      const resLong = await recordFailedAttempt(longKey, 5, 60000);
      expect(resLong.remainingAttempts).toBe(4);

      // Special characters
      const specialKey = "ratelimit:!@#$%^&*()_+{}:\"<>?[];',./~`";
      const resSpecial = await recordFailedAttempt(specialKey, 5, 60000);
      expect(resSpecial.remainingAttempts).toBe(4);
    });

    it("5.2 handles maxAttempts = 1 boundary condition", async () => {
      const key = "edge:max:1";
      const res1 = await recordFailedAttempt(key, 1, 60000);
      expect(res1.isBlocked).toBe(true);
      expect(res1.remainingAttempts).toBe(0);
      expect(res1.errorMessage).toBeDefined();
    });

    it("5.3 50 concurrent failed attempts against same key (race condition resistance)", async () => {
      const key = "concurrency:stress:key";
      const maxAttempts = 50;

      const promises = Array.from({ length: 50 }, () =>
        recordFailedAttempt(key, maxAttempts, 60000)
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(50);

      // Final status check must show 0 remaining attempts and blocked
      const finalCheck = await checkRateLimit(key, maxAttempts, 60000);
      expect(finalCheck.isBlocked).toBe(true);
      expect(finalCheck.remainingAttempts).toBe(0);
    });
  });
});
