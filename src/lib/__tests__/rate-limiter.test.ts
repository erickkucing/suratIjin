import { describe, it, expect, beforeEach, vi } from "vitest";
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

describe("Rate Limiter (Anti Brute-Force)", () => {
  beforeEach(() => {
    _clearRateLimitStoreForTesting();
    vi.useRealTimers();
  });

  it("should allow initial attempts with full remaining quota", () => {
    const key = "test:login:127.0.0.1:teacher";
    const status = checkRateLimit(key, 5, 15 * 60 * 1000);

    expect(status.isBlocked).toBe(false);
    expect(status.remainingAttempts).toBe(5);
    expect(status.errorMessage).toBeUndefined();
  });

  it("should track failed attempts and block on 5th attempt", () => {
    const key = "test:login:127.0.0.1:erick";

    for (let i = 1; i <= 4; i++) {
      const result = recordFailedAttempt(key, 5, 15 * 60 * 1000);
      expect(result.isBlocked).toBe(false);
      expect(result.remainingAttempts).toBe(5 - i);
    }

    // 5th attempt
    const blockedResult = recordFailedAttempt(key, 5, 15 * 60 * 1000);
    expect(blockedResult.isBlocked).toBe(true);
    expect(blockedResult.remainingAttempts).toBe(0);
    expect(blockedResult.errorMessage).toContain("Terlalu banyak percobaan gagal");
    expect(blockedResult.retryAfterMinutes).toBeGreaterThanOrEqual(1);

    // Subsequent check is also blocked
    const check = checkRateLimit(key, 5, 15 * 60 * 1000);
    expect(check.isBlocked).toBe(true);
    expect(check.errorMessage).toBeDefined();
  });

  it("should reset rate limit on successful authentication", () => {
    const key = "test:login:127.0.0.1:admin";

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(key, 5, 15 * 60 * 1000);
    }

    expect(checkRateLimit(key).remainingAttempts).toBe(1);

    // Success -> reset
    resetRateLimit(key);

    const check = checkRateLimit(key);
    expect(check.isBlocked).toBe(false);
    expect(check.remainingAttempts).toBe(5);
  });

  it("should automatically unblock after window expiration", () => {
    vi.useFakeTimers();
    const key = "test:window:expired";
    const windowMs = 5000;

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(key, 5, windowMs);
    }

    expect(checkRateLimit(key, 5, windowMs).isBlocked).toBe(true);

    // Advance past windowMs
    vi.advanceTimersByTime(5100);

    const afterExpire = checkRateLimit(key, 5, windowMs);
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
    it("should block when target account reaches max attempts even if IPs rotate (spoofing prevention)", () => {
      const targetUserKey = "login:account:erick";
      const config = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

      // Attacker rotates 5 distinct spoofed IPs against the same account
      for (let i = 1; i <= 4; i++) {
        const spoofedIpKey = `login:ip:10.0.0.${i}`;
        const res = recordDualFailedAttempt(spoofedIpKey, targetUserKey, config, config);
        expect(res.isBlocked).toBe(false);
      }

      // 5th attempt from yet another new IP
      const freshIpKey = "login:ip:10.0.0.99";
      const blockedRes = recordDualFailedAttempt(freshIpKey, targetUserKey, config, config);
      expect(blockedRes.isBlocked).toBe(true);
      expect(blockedRes.errorMessage).toContain("Terlalu banyak percobaan gagal");

      // Check with a 6th new IP should immediately be blocked due to account bucket
      const check = checkDualRateLimit("login:ip:10.0.0.100", targetUserKey, config, config);
      expect(check.isBlocked).toBe(true);
    });

    it("should reset both IP and target buckets on successful authentication", () => {
      const ipKey = "login:ip:192.168.1.50";
      const userKey = "login:account:wildwina";

      recordDualFailedAttempt(ipKey, userKey);
      recordDualFailedAttempt(ipKey, userKey);

      resetDualRateLimit(ipKey, userKey);

      const check = checkDualRateLimit(ipKey, userKey);
      expect(check.isBlocked).toBe(false);
      expect(check.remainingAttempts).toBeGreaterThanOrEqual(5);
    });
  });
});
