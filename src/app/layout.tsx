import type { Metadata, Viewport } from "next";
import { Nunito, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getSystemSettings } from "@/lib/system-settings";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSystemSettings();
  return {
    title: settings.appName || "Sistem Surat Izin & Ketidakhadiran Siswa",
    description:
      "Arsip surat izin, sakit, dan rekap ketidakhadiran siswa untuk Wali Kelas dan Wali Murid",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Surat Izin",
    },
    icons: {
      icon: settings.logoUrl || "/icons/icon-192x192.png",
      apple: "/icons/icon-192x192.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
  themeColor: "#B54826",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSystemSettings();

  return (
    <html
      lang="id"
      data-theme={settings.themeColor}
      className={`${nunito.variable} ${plusJakartaSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        {settings.logoUrl && (
          <link rel="icon" href={settings.logoUrl} key="dynamic-favicon" />
        )}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                font-family: var(--font-jakarta), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #FBF7F2;
                color: #231F1E;
              }
              html.dark, html.dark body {
                background-color: #181514;
                color: #F5EFEA;
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var saved = localStorage.getItem('surat_theme');
                if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
