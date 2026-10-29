"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Critical root global error captured:", error.message);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen flex items-center justify-center p-6 bg-stone-100 text-stone-900 font-sans antialiased">
        <main
          role="main"
          className="bg-white p-8 sm:p-10 rounded-2xl max-w-md w-full text-center space-y-6 shadow-md border border-stone-200"
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
            <AlertTriangle className="w-8 h-8" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-red-600">
              Kesalahan Sistem Kritis
            </p>
            <h1 className="text-2xl font-extrabold text-stone-900">
              Terjadi Kendala Sistem
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              Layanan mengalami gangguan sementara. Silakan coba memuat ulang halaman.
            </p>
            {error.digest && (
              <p className="text-xs text-stone-400 font-mono">
                Kode Referensi: {error.digest}
              </p>
            )}
          </div>

          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
