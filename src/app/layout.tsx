import type { Metadata, Viewport } from "next";
import { Nunito, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getSystemSettings } from "@/lib/system-settings";
import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";

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
  const appName = settings.appName || "Sistem Surat Izin & Ketidakhadiran Siswa";
  const shortName = settings.appName || "Surat Izin";

  let appleIcon = "/icons/icon-192x192.png";
  if (settings.logoUrl) {
    appleIcon = /logo-(\d+)\.png$/.test(settings.logoUrl)
      ? settings.logoUrl.replace(/logo-(\d+)\.png$/, "apple-icon-$1.png")
      : settings.logoUrl;
  }

  return {
    title: appName,
    description:
      "Arsip surat izin, sakit, dan rekap ketidakhadiran siswa untuk Wali Kelas dan Wali Murid",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: shortName,
    },
    icons: {
      icon: settings.logoUrl || "/icons/icon-192x192.png",
      apple: appleIcon,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: "#B54826",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSystemSettings();
  const appleIcon = settings.logoUrl
    ? (/logo-(\d+)\.png$/.test(settings.logoUrl)
      ? settings.logoUrl.replace(/logo-(\d+)\.png$/, "apple-icon-$1.png")
      : settings.logoUrl)
    : "/icons/icon-192x192.png";

  return (
    <html
      lang="id"
      data-theme={settings.themeColor}
      data-bg-theme={settings.bgTheme || "warm-zinc"}
      className={`${nunito.variable} ${plusJakartaSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        {settings.logoUrl && (
          <>
            <link rel="icon" href={settings.logoUrl} key="dynamic-favicon" />
            <link rel="apple-touch-icon" href={appleIcon} key="dynamic-apple-touch-icon" />
          </>
        )}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                font-family: var(--font-jakarta, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
                background-color: var(--canvas, #f5efeb);
                color: var(--ink, #231f1e);
                overflow-x: clip;
                max-width: 100vw;
                width: 100%;
              }
              html.dark, html.dark body {
                background-color: var(--canvas, #171413);
                color: var(--ink, #f5efea);
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
                localStorage.removeItem('app_bg_theme');
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </body>
    </html>
  );
}
