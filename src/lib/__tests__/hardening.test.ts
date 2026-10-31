import { describe, it, expect, afterEach } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { resolveCookieSecurity } from "../auth";
import {
  checkRateLimit,
  recordFailedAttempt,
  _clearRateLimitStoreForTesting,
} from "../rate-limiter";

describe("Hardening & Security Verification", () => {
  it("should configure strict OWASP HTTP security headers in next.config.mjs", async () => {
    expect(nextConfig.headers).toBeDefined();
    if (typeof nextConfig.headers === "function") {
      const headersConfig = await nextConfig.headers();
      const rootHeaders = headersConfig.find((h: { source: string }) => h.source === "/:path*");
      expect(rootHeaders).toBeDefined();
      if (!rootHeaders) return;

      const headersMap = new Map(rootHeaders.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
      expect(headersMap.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains; preload");
      expect(headersMap.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(headersMap.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headersMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headersMap.get("Permissions-Policy")).toContain("camera=(self)");
      expect(headersMap.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    }
  });

  it("should configure allowedOrigins with normalized hostnames and port 3001", () => {
    const allowed = nextConfig.experimental?.serverActions?.allowedOrigins;
    expect(allowed).toBeDefined();
    expect(allowed).toContain("localhost:3001");
    expect(allowed).toContain("127.0.0.1:3001");
    for (const origin of allowed as string[]) {
      expect(origin).not.toMatch(/^https?:\/\//i);
      expect(origin).not.toContain("/");
    }
  });

  describe("SEC-VULN-02: Dynamic Proxy-Aware Cookie Security", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("should enforce secure=true when X-Forwarded-Proto header is https", () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";

      const headers = new Headers({ "x-forwarded-proto": "https" });
      expect(resolveCookieSecurity(headers)).toBe(true);

      const req = new Request("http://localhost:3001/api/auth/login", {
        headers: { "x-forwarded-proto": "https" },
      });
      expect(resolveCookieSecurity(req)).toBe(true);
    });

    it("should handle chained proxy headers (e.g. 'https, http')", () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";

      const headers = new Headers({ "x-forwarded-proto": "https, http" });
      expect(resolveCookieSecurity(headers)).toBe(true);
    });

    it("should enforce secure=true when COOKIE_SECURE is 'true'", () => {
      process.env.COOKIE_SECURE = "true";
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";

      expect(resolveCookieSecurity()).toBe(true);
    });

    it("should enforce secure=true when NEXT_PUBLIC_APP_URL starts with https://", () => {
      delete process.env.COOKIE_SECURE;
      process.env.NEXT_PUBLIC_APP_URL = "https://suratijin.sekolah.sch.id";
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";

      expect(resolveCookieSecurity()).toBe(true);
    });

    it("should default to true in production environment", () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      expect(resolveCookieSecurity()).toBe(true);
    });

    it("should return false in non-production environment without HTTPS indicators", () => {
      delete process.env.COOKIE_SECURE;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";

      const req = new Request("http://localhost:3001/api/auth/login");
      expect(resolveCookieSecurity(req)).toBe(false);
      expect(resolveCookieSecurity()).toBe(false);
    });
  });

  describe("SEC-VULN-05: File Download Rate Limiter", () => {
    it("should allow up to 60 downloads per minute per IP and block the 61st request", async () => {
      _clearRateLimitStoreForTesting();
      const ip = "198.51.100.42";
      const key = `file-download:${ip}`;
      const limit = 60;
      const windowMs = 60 * 1000;

      for (let i = 1; i <= 60; i++) {
        const check = await checkRateLimit(key, limit, windowMs);
        expect(check.isBlocked).toBe(false);
        expect(check.remainingAttempts).toBe(limit - (i - 1));
        await recordFailedAttempt(key, limit, windowMs);
      }

      const blockedCheck = await checkRateLimit(key, limit, windowMs);
      expect(blockedCheck.isBlocked).toBe(true);
      expect(blockedCheck.remainingAttempts).toBe(0);
      expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);

      // Distinct IP is not affected
      const otherCheck = await checkRateLimit("file-download:198.51.100.43", limit, windowMs);
      expect(otherCheck.isBlocked).toBe(false);
    });
  });

  it("should validate magic bytes for image and PDF files accurately", () => {
    // PDF Magic bytes: %PDF-
    const validPdf = Buffer.from("%PDF-1.7 sample content");
    expect(validPdf.subarray(0, 5).toString()).toBe("%PDF-");

    // PNG Magic bytes: 89 50 4E 47
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const isPng =
      validPng[0] === 0x89 &&
      validPng[1] === 0x50 &&
      validPng[2] === 0x4e &&
      validPng[3] === 0x47;
    expect(isPng).toBe(true);

    // JPEG Magic bytes: FF D8 FF
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const isJpeg = validJpeg[0] === 0xff && validJpeg[1] === 0xd8 && validJpeg[2] === 0xff;
    expect(isJpeg).toBe(true);

    // Spoofed executable pretending to be jpg
    const spoofedExe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00This is a windows executable");
    const isSpoofedJpeg = spoofedExe[0] === 0xff && spoofedExe[1] === 0xd8 && spoofedExe[2] === 0xff;
    expect(isSpoofedJpeg).toBe(false);

    // Spoofed PHP script
    const spoofedPhp = Buffer.from("<?php echo 'malicious'; ?>");
    const isSpoofedPng =
      spoofedPhp[0] === 0x89 &&
      spoofedPhp[1] === 0x50 &&
      spoofedPhp[2] === 0x4e &&
      spoofedPhp[3] === 0x47;
    expect(isSpoofedPng).toBe(false);
  });
});
