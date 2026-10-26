"use client";

import { useState, useEffect, useRef } from "react";
import { X, User, Lock, Eye, EyeOff, Check, Loader2, UserCheck, School, AlertCircle } from "lucide-react";
import { UserSessionPayload } from "@/lib/auth";
import { updateSelfProfileAction } from "@/actions/auth";
import { toTitleCase } from "@/lib/string-utils";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

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
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [savedPassNotice, setSavedPassNotice] = useState<string | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
  });

  useEffect(() => {
    if (isOpen) {
      setDisplayName(user.displayName);
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setMessage(null);
      setSavedPassNotice(null);
      setSaveStatus("idle");
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

  const triggerSaveIndicator = () => {
    setSaveStatus("saved");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus("idle");
    }, 2500);
  };

  const saveDisplayName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.displayName) return;
    setSaveStatus("saving");
    setMessage(null);
    try {
      const res = await updateSelfProfileAction({ displayName: trimmed });
      if (!res.success) throw new Error(res.error || "Gagal memperbarui profil.");
      user.displayName = trimmed;
      onSuccess(trimmed);
      triggerSaveIndicator();
    } catch (err: unknown) {
      setSaveStatus("idle");
      setMessage({
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan profil.",
        isError: true,
      });
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || newPassword.length < 6 || newPassword !== confirmPassword) return;
    setPasswordLoading(true);
    setSaveStatus("saving");
    setMessage(null);
    setSavedPassNotice(null);
    try {
      const res = await updateSelfProfileAction({
        displayName: displayName.trim() || user.displayName,
        newPassword: newPassword.trim(),
      });
      if (!res.success) throw new Error(res.error || "Gagal memperbarui kata sandi.");
      setNewPassword("");
      setConfirmPassword("");
      triggerSaveIndicator();
      setSavedPassNotice("Kata sandi akun Anda berhasil diperbarui ✓");
      setTimeout(() => setSavedPassNotice(null), 4000);
    } catch (err: unknown) {
      setSaveStatus("idle");
      setMessage({
        text: err instanceof Error ? err.message : "Gagal memperbarui kata sandi.",
        isError: true,
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-xs overflow-hidden sm:overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className="relative w-full max-w-md max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl border-t border-x sm:border border-[var(--border)] overflow-hidden flex flex-col"
      >
        {/* Mobile Tactile Drag Handle */}
        <div data-drag-handle className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)]">
          <div className="w-10 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header with Live Auto-save Indicator */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs shrink-0">
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

          <div className="flex items-center gap-3">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                <span className="hidden sm:inline">Menyimpan...</span>
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tersimpan</span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer"
              aria-label="Tutup dialog profil"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
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

          <div className="space-y-4">
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

            {/* Display Name - Auto saved on blur / enter */}
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
                onBlur={() => saveDisplayName(displayName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="Contoh: Erick S.Kom"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
              <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                Tersimpan otomatis saat selesai mengetik. Tampil pada rekapitulasi presensi dan portal wali murid.
              </p>
            </div>

            {/* Password Section */}
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span className="text-xs font-bold text-[var(--ink)]">
                    Ganti Kata Sandi Akun
                  </span>
                </div>
                {savedPassNotice && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in">
                    {savedPassNotice}
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                <div className="relative">
                  <input
                    id="profile-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Kata sandi baru (min. 6 karakter)"
                    minLength={6}
                    className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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

                {newPassword.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <input
                        id="profile-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ketik ulang kata sandi baru"
                        minLength={6}
                        className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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

                    <div className="flex items-center justify-between pt-1">
                      <div>
                        {confirmPassword.length > 0 && (
                          newPassword === confirmPassword ? (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Password cocok
                            </span>
                          ) : (
                            <span className="text-[11px] text-red-500 font-semibold flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Password belum cocok
                            </span>
                          )
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleSavePassword}
                        disabled={
                          passwordLoading ||
                          newPassword.length < 6 ||
                          newPassword !== confirmPassword
                        }
                        className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        {passwordLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Perbarui Sandi</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  );
}
