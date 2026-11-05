"use client";

import React, { useEffect } from "react";

interface PwaSplashScreenProps {
  appName: string;
  logoUrl?: string;
  schoolName?: string;
}

export function PwaSplashScreen({
  appName,
  logoUrl = "/icons/icon-192x192.png",
  schoolName = "Sistem Presensi Siswa",
}: PwaSplashScreenProps) {
  useEffect(() => {
    const splash = document.getElementById("pwa-splash");
    if (!splash) return;

    // Hanya proses bila class pwa-standalone-active terpasang di root <html>
    if (!document.documentElement.classList.contains("pwa-standalone-active")) {
      return;
    }

    const dismiss = () => {
      splash.style.opacity = "0";
      splash.style.pointerEvents = "none";
      setTimeout(() => {
        splash.style.display = "none";
        document.documentElement.classList.remove("pwa-standalone-active");
      }, 300);
    };

    // Dismiss saat dokumen selesai dimuat / dihidrasi
    if (document.readyState === "complete") {
      dismiss();
    } else {
      window.addEventListener("load", dismiss, { once: true });
      // Batas aman maksimum agar tidak pernah mengunci UI
      const timer = setTimeout(dismiss, 2500);
      return () => {
        window.removeEventListener("load", dismiss);
        clearTimeout(timer);
      };
    }
  }, []);

  return (
    <div
      id="pwa-splash"
      role="status"
      aria-live="polite"
      aria-label={`Memuat ${appName}`}
      className="fixed inset-0 z-[99999] w-full h-[100dvh] bg-[#B54826] text-white flex flex-col justify-between items-center px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] select-none transition-opacity duration-300 ease-out"
    >
      {/* Spacer atas untuk penyeimbang visual */}
      <div className="w-full h-4" aria-hidden="true" />

      {/* Area Tengah: Logo & Nama Aplikasi Full-Screen */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-6 text-center">
        {/* Logo Badge Container */}
        <div className="w-24 h-24 rounded-3xl bg-white p-3.5 flex items-center justify-center shadow-2xl shadow-black/20 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl || "/icons/icon-192x192.png"}
            alt={appName}
            width={68}
            height={68}
            className="w-full h-full object-contain rounded-2xl"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/icons/icon-192x192.png";
            }}
          />
        </div>

        {/* Title */}
        <h1 className="font-[family-name:var(--font-nunito)] font-extrabold text-2xl text-white tracking-tight leading-snug max-w-[280px]">
          {appName}
        </h1>

        {/* Subtitle / School Name */}
        {schoolName && (
          <p className="text-sm text-white/90 mt-2 font-medium tracking-wide line-clamp-2 max-w-[260px]">
            {schoolName}
          </p>
        )}
      </div>

      {/* Area Bawah: Micro Indeterminate Loader */}
      <div className="mt-auto flex flex-col items-center gap-3 text-center pb-2">
        <div
          className="w-36 h-1 bg-white/20 rounded-full overflow-hidden relative"
          aria-hidden="true"
        >
          <div className="splash-loader-bar h-full bg-white rounded-full absolute top-0" />
        </div>

        <span className="sr-only">Sedang memuat aplikasi...</span>
      </div>
    </div>
  );
}
