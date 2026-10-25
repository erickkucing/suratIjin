import type { MetadataRoute } from "next";
import { getSystemSettings } from "@/lib/system-settings";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let appName = "Sistem Surat Izin & Presensi Siswa";

  try {
    const settings = await getSystemSettings();
    if (settings?.appName?.trim()) {
      appName = settings.appName.trim();
    }
  } catch {
    // Fallback if db is unavailable during build
  }

  return {
    name: appName,
    short_name: "Surat Izin",
    description: "Aplikasi Rekapitulasi Presensi dan Surat Izin Siswa",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FDFBF7",
    theme_color: "#B54826",
    icons: [
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
    ],
  };
}
