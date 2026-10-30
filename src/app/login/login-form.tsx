"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { loginAction } from "@/actions/auth";

interface LoginFormProps {
  nextPath?: string;
}

export function LoginForm({ nextPath = "/dashboard" }: LoginFormProps) {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => null);

      if (!data || !data.success) {
        setErrorMessage(data?.error || "Gagal masuk. Periksa kembali username dan password.");
        return;
      }

      window.location.href = data.redirectUrl || nextPath;
    } catch {
      try {
        const formData = new FormData();
        formData.append("username", username);
        formData.append("password", password);
        const res = await loginAction(formData);
        if (!res.success) {
          setErrorMessage(res.error || "Gagal masuk. Periksa kembali username dan password.");
          return;
        }
        window.location.href = res.redirectUrl || nextPath;
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan koneksi.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-5 bg-[var(--surface)]">
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-[var(--status-alpa-border)] bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] text-xs font-semibold flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-xs font-bold text-[var(--ink)] mb-1.5">
            Nama Pengguna (Username)
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]">
              <User className="w-4 h-4" />
            </span>
            <input
              id="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Masukkan username..."
              className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-bold text-[var(--ink)] mb-1.5">
            Kata Sandi
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]">
              <Lock className="w-4 h-4" />
            </span>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi..."
              className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="touch-target w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-bold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          <span>Masuk ke Dashboard</span>
        </button>
      </form>

      <div className="pt-4 border-t border-[var(--border)] text-center">
        <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
          Bapak/Ibu Orang Tua atau Wali Murid? Akses rekapitulasi kehadiran melalui tautan portal kelas yang telah dibagikan oleh Wali Kelas masing-masing.
        </p>
      </div>
    </div>
  );
}
