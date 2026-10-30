import { describe, it, expect, vi, beforeEach } from "vitest";
import * as settingsModule from "@/lib/system-settings";

describe("Web App Manifest (PWA)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should generate valid default manifest object with standalone display and fallback icons", async () => {
    vi.spyOn(settingsModule, "getSystemSettings").mockResolvedValue({
      ...settingsModule.DEFAULT_SYSTEM_SETTINGS,
      appName: "Sistem Surat Izin Siswa",
      logoUrl: null,
    });

    const { default: manifest } = await import("../manifest");
    const result = await manifest();

    expect(result.name).toBe("Sistem Surat Izin Siswa");
    expect(result.short_name).toBe("Sistem Surat Izin Siswa");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
    expect(result.orientation).toBe("any");
    expect(result.theme_color).toBe("#B54826");
    expect(result.background_color).toBe("#FDFBF7");

    expect(Array.isArray(result.icons)).toBe(true);
    expect(result.icons?.length).toBeGreaterThanOrEqual(3);

    const icon192 = result.icons?.find((i) => i.sizes === "192x192");
    expect(icon192?.src).toBe("/icons/icon-192x192.png");

    const icon512 = result.icons?.find((i) => i.sizes === "512x512" && i.purpose === "any");
    expect(icon512?.src).toBe("/icons/icon-512x512.png");

    const maskable = result.icons?.find((i) => i.purpose === "maskable");
    expect(maskable?.src).toBe("/icons/maskable-icon-512x512.png");
  });

  it("should synchronize appName and icons with admin custom settings", async () => {
    vi.spyOn(settingsModule, "getSystemSettings").mockResolvedValue({
      ...settingsModule.DEFAULT_SYSTEM_SETTINGS,
      appName: "SMK Negeri 1 Surabaya",
      logoUrl: "/api/files/system/logo-1793278901234.png",
    });

    const { default: manifest } = await import("../manifest");
    const result = await manifest();

    expect(result.name).toBe("SMK Negeri 1 Surabaya");
    expect(result.short_name).toBe("SMK Negeri 1 Surabaya");

    const icon192 = result.icons?.find((i) => i.sizes === "192x192");
    expect(icon192?.src).toBe("/api/files/system/icon-192-1793278901234.png");
    expect(icon192?.purpose).toBe("any");

    const icon512 = result.icons?.find((i) => i.sizes === "512x512" && i.purpose === "any");
    expect(icon512?.src).toBe("/api/files/system/icon-512-1793278901234.png");

    const maskable = result.icons?.find((i) => i.purpose === "maskable");
    expect(maskable?.src).toBe("/api/files/system/icon-512-1793278901234.png");
  });
});
