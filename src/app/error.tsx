"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error securely to client console for diagnostics without exposing backend data
    console.error("Application error boundary captured:", error.message);
  }, [error]);

  return (
    <main
      id="main-content"
      role="main"
      className="min-h-screen flex items-center justify-center p-6 bg-[var(--canvas)] text-[var(--ink)]"
    >
      <div className="card-paper p-8 sm:p-10 rounded-2xl max-w-md w-full text-center space-y-6 shadow-sm border border-[var(--border)]">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-8 h-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Terjadi Kesalahan
          </p>
          <h1 className="text-2xl font-extrabold font-heading text-[var(--ink)]">
            Gagal Memuat Halaman
          </h1>
          <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
            Terjadi kendala saat memproses permintaan Anda. Anda dapat mencoba memuat ulang halaman ini.
          </p>
          {error.digest && (
            <p className="text-xs text-[var(--ink-muted)] font-mono opacity-70">
              ID Masalah: {error.digest}
            </p>
          )}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Coba Lagi</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--ink)] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
          >
            <Home className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden="true" />
            <span>Beranda</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
