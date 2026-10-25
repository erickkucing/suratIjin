"use client";

import { useState, useEffect } from "react";
import { X, User, Lock, Eye, EyeOff, Check, Loader2, UserCheck, School, AlertCircle } from "lucide-react";
import { UserSessionPayload } from "@/lib/auth";
import { updateSelfProfileAction } from "@/actions/auth";
import { toTitleCase } from "@/lib/string-utils";

interface TeacherProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserSessionPayload;
  classNameTitle?: string;
  onOpenClassSettings?: () => void;
  onSuccess: (newDisplayName: string) => void;
}

export function TeacherProfileModal({
  isOpen,
  onClose,
  user,
  classNameTitle,
  onOpenClassSettings,
  onSuccess,
}: TeacherProfileModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayName(user.displayName);
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setMessage(null);
    }
  }, [isOpen, user]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ text: "Kata sandi baru dan konfirmasi tidak cocok.", isError: true });
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      const res = await updateSelfProfileAction({
        displayName: displayName.trim(),
        newPassword: newPassword.trim() || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || "Gagal memperbarui profil.");
      }

      setMessage({ text: "Profil berhasil diperbarui.", isError: false });
      onSuccess(res.displayName || displayName.trim());

      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md my-6 bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="text-base sm:text-lg font-bold font-heading">
                Profil &amp; Akun Saya
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                {user.role === "superadmin" ? "Superadmin" : "Wali Kelas"} &bull; @{user.username}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer"
            aria-label="Tutup dialog profil"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {message && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-semibold ${
                message.isError
                  ? "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                  : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username (Read Only) */}
            <div>
              <label htmlFor="profile-username" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                Username Login
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="profile-username"
                  type="text"
                  readOnly
                  disabled
                  value={user.username}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] font-mono cursor-not-allowed select-all"
                />
              </div>
              <p className="text-[11px] text-[var(--ink-subtle)] mt-1">
                Username login unik dan tidak dapat diubah sendiri.
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label htmlFor="profile-display-name" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                Nama Lengkap &amp; Gelar
              </label>
              <input
                id="profile-display-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(toTitleCase(e.target.value))}
                placeholder="Contoh: Erick S.Kom"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
              <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                Nama ini tampil pada rekapitulasi presensi dan portal wali murid.
              </p>
            </div>

            {/* Password Baru */}
            <div>
              <label htmlFor="profile-password" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                Ganti Kata Sandi (Opsional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="profile-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Kosongkan jika password tetap"
                  minLength={6}
                  className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                  title={showPassword ? "Sembunyikan password" : "Lihat password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                Minimal 6 karakter. Langsung aktif untuk sesi login berikutnya.
              </p>
            </div>

            {/* Konfirmasi Password Baru */}
            {newPassword.length > 0 && (
              <div>
                <label htmlFor="profile-confirm-password" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                  Ulangi Kata Sandi Baru
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="profile-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru"
                    minLength={6}
                    className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                    title={showConfirmPassword ? "Sembunyikan password" : "Lihat password"}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <div className="mt-1">
                    {newPassword === confirmPassword ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Password cocok
                      </span>
                    ) : (
                      <span className="text-[11px] text-red-500 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Password belum cocok
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Link to Class Settings */}
            {classNameTitle && onOpenClassSettings && (
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <School className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-[var(--ink)] block">
                      Kelas Saat Ini: {classNameTitle}
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      Ubah nama kelas &amp; link portal wali murid
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenClassSettings();
                  }}
                  className="touch-target px-3 py-1 text-xs font-bold rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas)] text-[var(--primary)] transition-colors cursor-pointer"
                >
                  Ubah Kelas
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="touch-target px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  !displayName.trim() ||
                  (Boolean(newPassword) &&
                    (newPassword.length < 6 || newPassword !== confirmPassword))
                }
                className="touch-target flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Simpan Profil</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
