import type { Metadata, Viewport } from "next";
import { Nunito, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getSystemSettings } from "@/lib/system-settings";
import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider";
import { PwaSplashScreen } from "@/components/pwa-splashscreen";

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
      statusBarStyle: "black-translucent",
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
                overflow-x: hidden;
                max-width: 100%;
                width: 100%;
              }
              html.dark, html.dark body {
                background-color: var(--canvas, #171413);
                color: var(--ink, #f5efea);
              }
              html.pwa-standalone-active,
              html.pwa-standalone-active body {
                background-color: #B54826 !important;
              }
              #pwa-splash {
                display: none !important;
              }
              html.pwa-standalone-active #pwa-splash {
                display: flex !important;
              }
              @keyframes splash-bar-indeterminate {
                0% { left: -40%; width: 35%; }
                50% { left: 25%; width: 60%; }
                100% { left: 100%; width: 40%; }
              }
              .splash-loader-bar {
                animation: splash-bar-indeterminate 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
              }
              @media (prefers-reduced-motion: reduce) {
                #pwa-splash {
                  transition: none !important;
                }
                .splash-loader-bar {
                  animation: none !important;
                  left: 0 !important;
                  width: 100% !important;
                }
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

                var isTestParam = window.location.search.indexOf('splash=1') !== -1;
                var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
                var hasShown = sessionStorage.getItem('pwa_splash_shown');
                if (isTestParam || (isStandalone && !hasShown)) {
                  document.documentElement.classList.add('pwa-standalone-active');
                  if (!isTestParam) {
                    sessionStorage.setItem('pwa_splash_shown', '1');
                  }
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <PwaSplashScreen
          appName={settings.appName || "Sistem Surat Izin & Presensi Siswa"}
          logoUrl={settings.logoUrl || "/icons/icon-192x192.png"}
          schoolName={settings.footerText?.replace(/\.$/, "") || "Sistem Presensi Siswa"}
        />
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </body>
    </html>
  );
}
