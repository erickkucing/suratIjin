"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Lock, Unlock, Share2, Eye, EyeOff, Copy, Check, MessageSquare, Loader2, Sparkles, RotateCcw, AlertCircle } from "lucide-react";
import QRCode from "qrcode";
import { ClassItem } from "@/db/schema";
import { updateParentAccessAction } from "@/actions/class-settings";
import { getAutoAcademicPeriod, isAutoPeriod } from "@/lib/academic-year";

interface ParentPortalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classInfo: ClassItem;
  teacherName?: string;
  onSuccess: () => void;
}

// Universal clipboard function supporting non-secure origins (HTTP/LAN IP)
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (success) return true;
    } catch {}
  }
  return false;
}

export function ParentPortalSettingsModal({
  isOpen,
  onClose,
  classInfo,
  teacherName = "Wali Kelas",
  onSuccess,
}: ParentPortalSettingsModalProps) {
  const autoPeriod = useMemo(() => getAutoAcademicPeriod(), []);

  const [className, setClassName] = useState(classInfo.name);
  const [requirePassword, setRequirePassword] = useState(Boolean(classInfo.parentPasswordHash));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [allowViewPhoto, setAllowViewPhoto] = useState(classInfo.parentShowLetterFile);
  const [periodTitle, setPeriodTitle] = useState(() => {
    const isStandardTitle =
      !classInfo.periodTitle ||
      classInfo.periodTitle === "Semester Ganjil" ||
      classInfo.periodTitle === "Semester Genap";
    return isStandardTitle ? autoPeriod.periodTitle : classInfo.periodTitle;
  });
  const [academicYear, setAcademicYear] = useState(() => {
    const isStandardTitle =
      !classInfo.periodTitle ||
      classInfo.periodTitle === "Semester Ganjil" ||
      classInfo.periodTitle === "Semester Genap";
    return isStandardTitle ? autoPeriod.academicYear : (classInfo.academicYear || autoPeriod.academicYear);
  });
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const isCurrentAuto = isAutoPeriod(periodTitle, academicYear);

  const handleApplyAuto = () => {
    setPeriodTitle(autoPeriod.periodTitle);
    setAcademicYear(autoPeriod.academicYear);
  };

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/${classInfo.slug}`
    : `/portal/${classInfo.slug}`;

  useEffect(() => {
    if (isOpen) {
      setClassName(classInfo.name);
      setRequirePassword(Boolean(classInfo.parentPasswordHash));
      setAllowViewPhoto(classInfo.parentShowLetterFile);

      const isStandardTitle =
        !classInfo.periodTitle ||
        classInfo.periodTitle === "Semester Ganjil" ||
        classInfo.periodTitle === "Semester Genap";

      if (isStandardTitle) {
        setPeriodTitle(autoPeriod.periodTitle);
        setAcademicYear(autoPeriod.academicYear);
      } else {
        setPeriodTitle(classInfo.periodTitle);
        setAcademicYear(classInfo.academicYear || autoPeriod.academicYear);
      }

      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setMessage(null);

      QRCode.toDataURL(portalUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: "#264663",
          light: "#FFFFFF",
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("QR Code error:", err));
    }
  }, [isOpen, classInfo, portalUrl, autoPeriod]);

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
    const ok = await copyToClipboard(portalUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      const input = document.getElementById("portal-url-field") as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
        try {
          document.execCommand("copy");
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2000);
        } catch {}
      }
    }
  };

  const handleCopyWhatsApp = async () => {
    const accessNotice = requirePassword
      ? "Silakan masukkan kata sandi akses yang telah dibagikan untuk melihat rekap kehadiran."
      : "Tautan ini dapat langsung dibuka oleh wali murid tanpa perlu memasukkan kata sandi.";

    const waText = `Yth. Bapak/Ibu Wali Murid Kelas ${classInfo.name},\n\nBerikut adalah tautan Portal Papan Informasi Surat Izin & Ketidakhadiran Siswa:\n🔗 ${portalUrl}\n\n${accessNotice}\n\nTerima kasih,\n${teacherName}`;

    const ok = await copyToClipboard(waText);
    if (ok) {
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2000);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requirePassword) {
      if (!classInfo.parentPasswordHash && !newPassword.trim()) {
        setMessage({ text: "Kata sandi akses portal wajib diisi saat penguncian aktif.", isError: true });
        return;
      }
      if (newPassword.trim() && newPassword.trim() !== confirmPassword.trim()) {
        setMessage({ text: "Kata sandi akses dan konfirmasi tidak cocok.", isError: true });
        return;
      }
    }
    setLoading(true);
    setMessage(null);

    try {
      const res = await updateParentAccessAction({
        classId: classInfo.id,
        name: className.trim(),
        requirePassword,
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
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="portal-settings-title" className="text-lg font-bold font-heading">
                Pengaturan Kelas &amp; Portal
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                Kelas: {classInfo.name} ({classInfo.slug})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                  ? "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                  : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Share Links & WhatsApp */}
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--ink-muted)]">
                Tautan Portal Siap Dibagikan
              </span>
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                  requirePassword
                    ? "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)]"
                    : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
                }`}
              >
                {requirePassword ? "Proteksi Password" : "Akses Bebas Password"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="portal-url-field"
                type="text"
                readOnly
                value={portalUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="touch-target flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--canvas)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] shadow-xs"
                title="Salin tautan ke clipboard"
              >
                {copiedLink ? <Check className="w-4 h-4 text-[var(--status-success-fg)]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? "Tersalin!" : "Salin Link"}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
              {qrCodeDataUrl && (
                <div className="p-2 bg-white rounded-lg border border-[var(--border)] shadow-xs shrink-0">
                  <img src={qrCodeDataUrl} alt="QR Code Portal Wali Murid" className="w-28 h-28" />
                </div>
              )}
              <div className="flex-1 space-y-2 w-full">
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className="touch-target w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#36582C] hover:bg-[#2B4723] text-white text-xs font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#36582C] transition-colors"
                >
                  {copiedWa ? <Check className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                  <span>{copiedWa ? "Format WA Tersalin!" : "Salin Pesan WhatsApp"}</span>
                </button>
                <p className="text-[11px] text-[var(--ink-muted)]">
                  {requirePassword
                    ? "Menyalin pesan lengkap dengan instruksi memasukkan kata sandi."
                    : "Menyalin pesan siap kirim (wali murid langsung klik tanpa perlu password)."}
                </p>
              </div>
            </div>
          </div>

          {/* Form Settings */}
          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Class Name Edit by Wali Kelas */}
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
              <label htmlFor="class-name-input" className="block text-xs font-semibold text-[var(--ink)]">
                Nama Kelas
              </label>
              <input
                id="class-name-input"
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Contoh: XII TKJ 2"
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
              <p className="text-[11px] text-[var(--ink-muted)]">
                Wali Kelas dapat mengganti nama kelas ini kapan saja. Tautan portal tetap <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--canvas-subtle)]">/portal/{classInfo.slug}</code> agar QR Code dan tautan wali murid tidak rusak.
              </p>
            </div>

            <span className="block text-xs font-semibold text-[var(--ink-muted)]">
              Keamanan &amp; Hak Akses Wali Murid
            </span>

            {/* Toggle: Require Password or Open Access */}
            <div className="flex items-start justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="pr-4">
                <div className="flex items-center gap-2">
                  {requirePassword ? (
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <Unlock className="w-4 h-4 text-[var(--status-success-fg)] shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-[var(--ink)] block">
                    Proteksi Kata Sandi Wali Murid
                  </span>
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  {requirePassword
                    ? "Aktif: Wali murid wajib memasukkan password kelas sebelum melihat rekap ketidakhadiran."
                    : "Nonaktif: Siapa saja yang memiliki link dapat langsung melihat rekap tanpa perlu kata sandi."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={requirePassword}
                onClick={() => setRequirePassword(!requirePassword)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                  requirePassword ? "bg-[var(--primary)]" : "bg-gray-300 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    requirePassword ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Password input when enabled */}
            {requirePassword && (
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-2">
                <label htmlFor="parent-pass" className="block text-xs font-semibold text-[var(--ink)]">
                  {classInfo.parentPasswordHash ? "Ganti Kata Sandi Akses (Opsional)" : "Tentukan Kata Sandi Baru (Wajib)"}
                </label>
                <div className="relative">
                  <input
                    id="parent-pass"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={
                      classInfo.parentPasswordHash
                        ? "Kosongkan jika tetap memakai password sebelumnya"
                        : "Ketik kata sandi akses baru..."
                    }
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                <p className="text-[11px] text-[var(--ink-subtle)]">
                  Bagikan kata sandi ini kepada wali murid saat membagikan tautan portal.
                </p>

                {(newPassword.length > 0 || !classInfo.parentPasswordHash) && (
                  <div className="space-y-1 pt-2 border-t border-[var(--border)]">
                    <label htmlFor="parent-pass-confirm" className="block text-xs font-semibold text-[var(--ink)]">
                      Ulangi Kata Sandi Akses
                    </label>
                    <div className="relative">
                      <input
                        id="parent-pass-confirm"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ketik ulang kata sandi akses..."
                        className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
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
              </div>
            )}

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
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                  allowViewPhoto ? "bg-[var(--primary)]" : "bg-gray-300 dark:bg-gray-700"
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
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--ink)]">
                    Periode &amp; Tahun Ajaran
                  </span>
                  {isCurrentAuto ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border border-[var(--status-success-border)]">
                      <Check className="w-3 h-3" aria-hidden="true" />
                      Otomatis Kalender
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border border-[var(--status-sakit-border)]">
                      Diedit Manual
                    </span>
                  )}
                </div>

                {!isCurrentAuto && (
                  <button
                    type="button"
                    onClick={handleApplyAuto}
                    className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    title={`Gunakan periode otomatis saat ini (${autoPeriod.periodTitle} ${autoPeriod.academicYear})`}
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Set Otomatis ({autoPeriod.periodTitle})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="period-title" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Nama Periode / Semester
                  </label>
                  <input
                    id="period-title"
                    type="text"
                    value={periodTitle}
                    onChange={(e) => setPeriodTitle(e.target.value)}
                    placeholder={autoPeriod.periodTitle}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="academic-year" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    id="academic-year"
                    type="text"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder={autoPeriod.academicYear}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                Semester Ganjil dihitung otomatis Juli s/d Desember, Semester Genap Januari s/d Juni. Tahun ajaran dihitung Juli hingga Juni tahun berikutnya. Anda tetap dapat mengedit kedua kolom di atas secara manual kapan saja.
              </p>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="touch-target px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-sm font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  !className.trim() ||
                  (requirePassword &&
                    !classInfo.parentPasswordHash &&
                    (!newPassword.trim() || newPassword !== confirmPassword)) ||
                  (requirePassword &&
                    Boolean(newPassword) &&
                    newPassword !== confirmPassword)
                }
                className="touch-target flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors"
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
