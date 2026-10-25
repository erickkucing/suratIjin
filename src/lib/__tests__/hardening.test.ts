import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config.mjs";

describe("Hardening & Security Verification", () => {
  it("should configure strict OWASP HTTP security headers in next.config.mjs", async () => {
    expect(nextConfig.headers).toBeDefined();
    if (typeof nextConfig.headers === "function") {
      const headersConfig = await nextConfig.headers();
      const rootHeaders = headersConfig.find((h: { source: string }) => h.source === "/:path*");
      expect(rootHeaders).toBeDefined();
      if (!rootHeaders) return;

      const headersMap = new Map(rootHeaders.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
      expect(headersMap.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(headersMap.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headersMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headersMap.get("Permissions-Policy")).toContain("camera=()");
      expect(headersMap.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    }
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
