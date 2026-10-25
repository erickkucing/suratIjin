"use client";

import { useState, useEffect } from "react";
import { X, Lock, Share2, Eye, EyeOff, QrCode, Copy, Check, MessageSquare, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { ClassItem } from "@/db/schema";
import { updateParentAccessAction } from "@/actions/class-settings";

interface ParentPortalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classInfo: ClassItem;
  teacherName?: string;
  onSuccess: () => void;
}

export function ParentPortalSettingsModal({
  isOpen,
  onClose,
  classInfo,
  teacherName = "Wali Kelas",
  onSuccess,
}: ParentPortalSettingsModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [allowViewPhoto, setAllowViewPhoto] = useState(classInfo.parentShowLetterFile);
  const [periodTitle, setPeriodTitle] = useState(classInfo.periodTitle);
  const [academicYear, setAcademicYear] = useState(classInfo.academicYear);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/${classInfo.slug}`
    : `/portal/${classInfo.slug}`;

  useEffect(() => {
    if (isOpen) {
      setAllowViewPhoto(classInfo.parentShowLetterFile);
      setPeriodTitle(classInfo.periodTitle);
      setAcademicYear(classInfo.academicYear);
      setNewPassword("");
      setMessage(null);

      QRCode.toDataURL(portalUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: "#1F6F54",
          light: "#FFFFFF",
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("QR Code error:", err));
    }
  }, [isOpen, classInfo, portalUrl]);

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

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyWhatsApp = async () => {
    const waText = `Yth. Bapak/Ibu Wali Murid Kelas ${classInfo.name},\n\nBerikut adalah tautan Portal Papan Informasi Surat Izin & Ketidakhadiran Siswa:\n🔗 ${portalUrl}\n\nSilakan masukkan kata sandi akses yang telah dibagikan untuk melihat rekap kehadiran.\n\nTerima kasih,\n${teacherName}`;
    try {
      await navigator.clipboard.writeText(waText);
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await updateParentAccessAction({
        classId: classInfo.id,
        newPassword: newPassword.trim(),
        parentShowLetterFile: allowViewPhoto,
        periodTitle: periodTitle.trim(),
        academicYear: academicYear.trim(),
      });

      if (!res.success) {
        throw new Error(res.error);
      }

      setMessage({ text: "Pengaturan berhasil diperbarui.", isError: false });
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Gagal menyimpan pengaturan.",
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
      aria-labelledby="portal-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg my-6 bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[var(--board)] text-white">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="portal-settings-title" className="text-lg font-bold font-heading">
                Pengaturan Portal Wali Murid
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                Kelas: {classInfo.name} ({classInfo.slug})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {message && (
            <div
              className={`p-3 rounded-xl border text-sm font-medium ${
                message.isError
                  ? "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Share Links & WhatsApp */}
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-3">
            <span className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              Tautan Portal Siap Dibagikan
            </span>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={portalUrl}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="touch-target flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--canvas)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? "Tersalin" : "Salin"}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
              {qrCodeDataUrl && (
                <div className="p-2 bg-white rounded-lg border border-[var(--border)] shadow-xs">
                  <img src={qrCodeDataUrl} alt="QR Code Portal Wali Murid" className="w-28 h-28" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className="touch-target w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
                >
                  {copiedWa ? <Check className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                  <span>{copiedWa ? "Format WA Tersalin!" : "Salin Pesan WhatsApp"}</span>
                </button>
                <p className="text-[11px] text-[var(--ink-muted)]">
                  Klik tombol di atas untuk menyalin draf pesan siap kirim ke grup WhatsApp wali murid.
                </p>
              </div>
            </div>
          </div>

          {/* Form Settings */}
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <span className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
              Keamanan &amp; Hak Akses Wali Murid
            </span>

            {/* Password input */}
            <div>
              <label htmlFor="parent-pass" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                Atur Kata Sandi Akses Baru
              </label>
              <div className="relative">
                <input
                  id="parent-pass"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Kosongkan jika tidak ingin mengubah password"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  title={showPassword ? "Sembunyikan password" : "Lihat password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[var(--ink-subtle)]">
                Password digunakan oleh wali murid untuk membuka halaman portal kelas.
              </p>
            </div>

            {/* Privacy Toggle: Show Letter Photo */}
            <div className="flex items-start justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="pr-4">
                <span className="text-sm font-semibold text-[var(--ink)] block">
                  Izinkan Wali Murid Melihat Foto Surat Izin
                </span>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Secara bawaan dimatikan demi menjaga privasi medis siswa. Jika dimatikan, wali murid hanya melihat status &apos;Sudah&apos; atau &apos;Belum&apos;.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowViewPhoto}
                onClick={() => setAllowViewPhoto(!allowViewPhoto)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
                  allowViewPhoto ? "bg-[var(--board)]" : "bg-gray-300 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    allowViewPhoto ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Academic Year and Period Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="period-title" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                  Nama Periode / Semester
                </label>
                <input
                  id="period-title"
                  type="text"
                  value={periodTitle}
                  onChange={(e) => setPeriodTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                  required
                />
              </div>

              <div>
                <label htmlFor="academic-year" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                  Tahun Ajaran
                </label>
                <input
                  id="academic-year"
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="touch-target px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-sm font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={loading}
                className="touch-target flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
