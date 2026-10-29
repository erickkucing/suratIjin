import React from "react";
import Link from "next/link";
import { FileQuestion, ArrowLeft, LogIn } from "lucide-react";

export default function NotFound() {
  return (
    <main
      id="main-content"
      role="main"
      className="min-h-screen flex items-center justify-center p-6 bg-[var(--canvas)] text-[var(--ink)]"
    >
      <div className="card-paper p-8 sm:p-10 rounded-2xl max-w-md w-full text-center space-y-6 shadow-sm border border-[var(--border)]">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--accent-bg)] flex items-center justify-center text-[var(--primary)]">
          <FileQuestion className="w-8 h-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
            Kode 404
          </p>
          <h1 className="text-2xl font-extrabold font-heading text-[var(--ink)]">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
            Halaman atau tautan portal kelas yang Anda tuju tidak tersedia, telah dipindahkan, atau dinonaktifkan.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Kembali ke Beranda</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--ink)] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
          >
            <LogIn className="w-4 h-4 text-[var(--ink-muted)]" aria-hidden="true" />
            <span>Masuk Petugas</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
