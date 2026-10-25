import { describe, it, expect } from "vitest";
import {
  calculateProportionalDimensions,
  resolveExportLogo,
  DEFAULT_SCHOOL_EMBLEM_BASE64,
} from "../export-logo";

describe("Export Logo Proportional Sizing & Resolver", () => {
  it("should preserve 1:1 aspect ratio for square logos within max constraints", () => {
    const dims = calculateProportionalDimensions(240, 240, 68, 50);
    expect(dims.height).toBe(50);
    expect(dims.width).toBe(50);
    expect(dims.width / dims.height).toBeCloseTo(1.0, 2);
  });

  it("should preserve landscape aspect ratio within max constraints", () => {
    // 300x150 -> aspect ratio 2:1
    const dims = calculateProportionalDimensions(300, 150, 70, 50);
    // width=70, height=35 <= 50
    expect(dims.width).toBe(70);
    expect(dims.height).toBe(35);
    expect(dims.width / dims.height).toBeCloseTo(2.0, 2);
  });

  it("should preserve portrait aspect ratio within max constraints", () => {
    // 150x300 -> aspect ratio 0.5:1
    const dims = calculateProportionalDimensions(150, 300, 70, 50);
    // height=50, width=25 <= 70
    expect(dims.height).toBe(50);
    expect(dims.width).toBe(25);
    expect(dims.width / dims.height).toBeCloseTo(0.5, 2);
  });

  it("should fallback to default school emblem if logoUrl is null or undefined", async () => {
    const logoInfo = await resolveExportLogo(null);
    expect(logoInfo.base64).toBe(DEFAULT_SCHOOL_EMBLEM_BASE64);
    expect(logoInfo.extension).toBe("png");
    expect(logoInfo.width).toBe(240);
    expect(logoInfo.height).toBe(240);
    expect(logoInfo.aspectRatio).toBe(1.0);
  });

  it("should resolve valid base64 data URL and determine dimensions", async () => {
    // 1x1 png base64
    const testPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const logoInfo = await resolveExportLogo(testPng);
    expect(logoInfo.base64).toBe(testPng);
    expect(logoInfo.extension).toBe("png");
    expect(logoInfo.width).toBe(1);
    expect(logoInfo.height).toBe(1);
    expect(logoInfo.aspectRatio).toBe(1);
  });
});
