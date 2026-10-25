import { describe, it, expect, vi } from "vitest";

describe("Web App Manifest (PWA)", () => {
  it("should generate valid manifest object with standalone display and any orientation", async () => {
    const { default: manifest } = await import("../manifest");
    const result = await manifest();

    expect(result.name).toBeDefined();
    expect(result.short_name).toBe("Surat Izin");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
    expect(result.orientation).toBe("any");
    expect(result.theme_color).toBe("#B54826");
    expect(result.background_color).toBe("#FDFBF7");

    expect(Array.isArray(result.icons)).toBe(true);
    expect(result.icons?.length).toBeGreaterThanOrEqual(3);

    const sizes = result.icons?.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    const maskable = result.icons?.find((i) => i.purpose === "maskable");
    expect(maskable).toBeDefined();
  });
});
