"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, User, School, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { loginAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    try {
      const res = await loginAction(formData);
      if (!res.success) {
        setErrorMessage(res.error || "Gagal masuk. Periksa kembali username dan password.");
        return;
      }
      router.push(res.redirectUrl || nextPath);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan koneksi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 bg-[var(--surface)]">
      {errorMessage && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5"
          >
            Nama Pengguna (Username)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--ink-muted)]">
              <User className="w-4 h-4" />
            </div>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="cth: erick / wildwina"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5"
          >
            Kata Sandi (Password)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--ink-muted)]">
              <Lock className="w-4 h-4" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi..."
              className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="touch-target w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-sm font-bold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          <span>Masuk ke Dashboard</span>
        </button>
      </form>

      {/* Parent Portal Directory Link */}
      <div className="pt-4 border-t border-[var(--border)] text-center">
        <p className="text-xs text-[var(--ink-muted)] mb-2">
          Bapak/Ibu Orang Tua atau Wali Murid?
        </p>
        <Link
          href="/portal/xii-tkj-2"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--board)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] rounded"
        >
          Buka Portal Wali Murid Kelas XII TKJ 2 &rarr;
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--canvas)] text-[var(--ink)]">
      {/* Top Bar */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--board)] text-white shadow-xs">
            <School className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold font-heading text-[var(--ink)]">
              Sistem Surat Izin Siswa
            </h1>
            <p className="text-xs text-[var(--ink-muted)]">Arsip Digital &amp; Rekapitulasi Presensi</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md card-paper-elevated rounded-2xl overflow-hidden">
          {/* Card Chalkboard Banner */}
          <div className="p-6 bg-[var(--board)] text-white text-center">
            <h2 className="text-xl font-bold font-heading">Selamat Datang</h2>
            <p className="mt-1 text-xs text-emerald-100">
              Masuk sebagai Wali Kelas atau Superadmin
            </p>
          </div>

          <Suspense
            fallback={
              <div className="p-8 text-center text-sm text-[var(--ink-muted)]">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--board)]" />
                Memuat formulir login...
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[var(--ink-muted)]">
        &copy; {new Date().getFullYear()} Sistem Surat Izin &amp; Ketidakhadiran Siswa. Dibuat untuk kenyamanan guru dan orang tua.
      </footer>
    </div>
  );
}
