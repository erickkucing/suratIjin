import type { MetadataRoute } from "next";
import { getSystemSettings } from "@/lib/system-settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let appName = "Sistem Surat Izin & Presensi Siswa";
  let shortName = "Surat Izin";
  let icons: MetadataRoute.Manifest["icons"] = [
    {
      src: "/icons/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/maskable-icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];

  try {
    const settings = await getSystemSettings();
    if (settings?.appName?.trim()) {
      appName = settings.appName.trim();
      shortName = appName;
    }

    if (settings?.logoUrl) {
      const isCustomLogoPattern = /logo-(\d+)\.png$/.test(settings.logoUrl);
      const icon192 = isCustomLogoPattern
        ? settings.logoUrl.replace(/logo-(\d+)\.png$/, "icon-192-$1.png")
        : settings.logoUrl;
      const icon512 = isCustomLogoPattern
        ? settings.logoUrl.replace(/logo-(\d+)\.png$/, "icon-512-$1.png")
        : settings.logoUrl;

      icons = [
        {
          src: icon192,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: icon512,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: icon512,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ];
    }
  } catch {
    // Fallback if db is unavailable during build
  }

  return {
    name: appName,
    short_name: shortName,
    description: "Aplikasi Rekapitulasi Presensi dan Surat Izin Siswa",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FDFBF7",
    theme_color: "#B54826",
    icons,
  };
}
