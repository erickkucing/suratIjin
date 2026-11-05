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

    // Langsung dismiss begitu dokumen selesai dimuat / dihidrasi
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
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-[var(--canvas)] select-none transition-opacity duration-300 ease-out"
    >
      <div className="card-paper bg-[var(--surface-elevated)] border border-[var(--border)] rounded-3xl p-8 flex flex-col items-center max-w-[320px] w-[88%] shadow-sm text-center">
        {/* Logo Container */}
        <div className="w-20 h-20 rounded-2xl bg-white dark:bg-[var(--surface)] border border-[var(--border)] p-2.5 flex items-center justify-center mb-4 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl || "/icons/icon-192x192.png"}
            alt={appName}
            width={64}
            height={64}
            className="w-full h-full object-contain rounded-xl"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/icons/icon-192x192.png";
            }}
          />
        </div>

        {/* Title */}
        <h1 className="font-[family-name:var(--font-nunito)] font-extrabold text-xl text-[var(--ink)] tracking-tight leading-snug">
          {appName}
        </h1>

        {/* Subtitle */}
        {schoolName && (
          <p className="text-xs text-[var(--ink-muted)] mt-1 font-medium line-clamp-1">
            {schoolName}
          </p>
        )}

        {/* Micro Indeterminate Indicator */}
        <div
          className="w-28 h-1 bg-[var(--canvas-subtle)] rounded-full overflow-hidden mt-6 relative"
          aria-hidden="true"
        >
          <div className="splash-loader-bar h-full bg-[var(--primary)] rounded-full absolute top-0" />
        </div>

        <span className="sr-only">Sedang memuat aplikasi...</span>
      </div>
    </div>
  );
}
