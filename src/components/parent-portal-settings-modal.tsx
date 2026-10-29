"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Lock, Unlock, Share2, Eye, EyeOff, Copy, Check, MessageSquare, Loader2, RotateCcw, AlertCircle, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { ClassItem } from "@/db/schema";
import { updateParentAccessAction, regenerateClassSlugAction } from "@/actions/class-settings";
import { getAutoAcademicPeriod, isAutoPeriod } from "@/lib/academic-year";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

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
  const [currentSlug, setCurrentSlug] = useState(classInfo.slug);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [savedPassNotice, setSavedPassNotice] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
  });

  const isCurrentAuto = isAutoPeriod(periodTitle, academicYear);

  const saveSettings = async (patch: Partial<{
    name: string;
    requirePassword: boolean;
    newPassword: string;
    parentShowLetterFile: boolean;
    periodTitle: string;
    academicYear: string;
  }>) => {
    setSaveStatus("saving");
    setMessage(null);
    try {
      const payload = {
        classId: classInfo.id,
        name: patch.name !== undefined ? patch.name.trim() : className.trim(),
        requirePassword: patch.requirePassword !== undefined ? patch.requirePassword : requirePassword,
        newPassword: patch.newPassword !== undefined ? patch.newPassword.trim() : undefined,
        parentShowLetterFile: patch.parentShowLetterFile !== undefined ? patch.parentShowLetterFile : allowViewPhoto,
        periodTitle: patch.periodTitle !== undefined ? patch.periodTitle.trim() : periodTitle.trim(),
        academicYear: patch.academicYear !== undefined ? patch.academicYear.trim() : academicYear.trim(),
      };

      const res = await updateParentAccessAction(payload);
      if (!res.success) throw new Error(res.error);

      if (patch.name) classInfo.name = patch.name;
      if (patch.parentShowLetterFile !== undefined) classInfo.parentShowLetterFile = patch.parentShowLetterFile;
      if (patch.requirePassword === false) classInfo.parentPasswordHash = null;
      if (patch.newPassword) {
        classInfo.parentPasswordHash = "updated";
        setSavedPassNotice("Kata sandi berhasil disimpan ✓");
        setTimeout(() => setSavedPassNotice(null), 3000);
      }

      setSaveStatus("saved");
      onSuccess();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: unknown) {
      setSaveStatus("idle");
      setMessage({
        text: err instanceof Error ? err.message : "Gagal menyimpan perubahan.",
        isError: true,
      });
    }
  };

  const handleApplyAuto = () => {
    setPeriodTitle(autoPeriod.periodTitle);
    setAcademicYear(autoPeriod.academicYear);
    saveSettings({ periodTitle: autoPeriod.periodTitle, academicYear: autoPeriod.academicYear });
  };

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/${currentSlug}`
    : `/portal/${currentSlug}`;

  useEffect(() => {
    if (isOpen) {
      setClassName(classInfo.name);
      setCurrentSlug(classInfo.slug);
      setShowRegenConfirm(false);
      setIsRegenerating(false);
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

  const handleRegenerateSlug = async () => {
    setIsRegenerating(true);
    setMessage(null);
    try {
      const res = await regenerateClassSlugAction(classInfo.id);
      if (res.success && res.newSlug) {
        setCurrentSlug(res.newSlug);
        classInfo.slug = res.newSlug;
        setShowRegenConfirm(false);
        setMessage({ text: `Kode tautan portal berhasil diacak ulang menjadi: /portal/${res.newSlug}`, isError: false });
        onSuccess();
      } else {
        setMessage({ text: res.error || "Gagal mengacak ulang tautan.", isError: true });
      }
    } catch {
      setMessage({ text: "Terjadi kesalahan saat mengacak tautan.", isError: true });
    } finally {
      setIsRegenerating(false);
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 pt-[env(safe-area-inset-top,1.5rem)] sm:p-6 bg-black/75 backdrop-blur-xs overflow-hidden sm:overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className="relative w-full max-w-lg min-h-0 modal-bottom-sheet max-h-[68dvh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl border-t border-x sm:border border-[var(--border)] overflow-hidden flex flex-col"
      >
        {/* Mobile Tactile Drag Handle */}
        <div data-drag-handle className="sm:hidden flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)]">
          <div className="w-12 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header */}
        <div data-sheet-header className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)] shrink-0 touch-none select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="portal-settings-title" className="text-base sm:text-lg font-bold font-heading">
                  Pengaturan Kelas &amp; Portal
                </h2>
                {saveStatus === "saving" && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--primary)]" />
                    <span>Menyimpan...</span>
                  </span>
                )}
                {saveStatus === "saved" && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--status-success-fg)] font-medium">
                    <Check className="w-3.5 h-3.5" />
                    <span>Tersimpan</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                Kelas: {classInfo.name} ({classInfo.slug})
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 space-y-5 overflow-y-auto min-h-0 flex-1">
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
              <span className="text-xs font-semibold text-[var(--ink)]">
                Tautan Portal Siap Dibagikan
              </span>
              <span className="text-xs text-[var(--ink-muted)] flex items-center gap-1 font-medium">
                {requirePassword ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Terproteksi Sandi</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-[var(--status-success-fg)]" />
                    <span>Bebas Sandi</span>
                  </>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <input
                id="portal-url-field"
                type="text"
                readOnly
                value={portalUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono select-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="touch-target flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--canvas)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] shadow-xs"
                  title="Salin tautan ke clipboard"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-[var(--status-success-fg)]" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? "Tersalin!" : "Salin Link"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegenConfirm(true)}
                  disabled={isRegenerating}
                  className="touch-target flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--canvas)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] shadow-xs shrink-0"
                  title="Acak ulang tautan 3 huruf baru"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Acak Ulang Tautan</span>
                  <span className="sm:hidden">Acak Tautan</span>
                </button>
              </div>
            </div>

            {showRegenConfirm && (
              <div className="p-3 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">Konfirmasi Acak Ulang Kode Tautan</p>
                    <p className="text-[11px] opacity-90">
                      Tautan lama dan QR code fisik yang telah dibagikan tidak akan dapat diakses lagi. Wali murid harus menggunakan tautan baru.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowRegenConfirm(false)}
                    disabled={isRegenerating}
                    className="px-2.5 py-1 text-xs rounded border border-current hover:bg-black/5"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateSlug}
                    disabled={isRegenerating}
                    className="px-2.5 py-1 text-xs rounded font-bold bg-[var(--status-warning-fg)] text-white hover:opacity-90 flex items-center gap-1"
                  >
                    {isRegenerating && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Ya, Acak Ulang</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
              {qrCodeDataUrl && (
                <div className="p-2 bg-white rounded-lg border border-[var(--border)] shadow-xs shrink-0">
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Code Portal Wali Murid"
                    width={112}
                    height={112}
                    className="w-28 h-28"
                  />
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
          <div className="space-y-4">
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
                onBlur={() => {
                  if (className.trim() && className.trim() !== classInfo.name) {
                    saveSettings({ name: className.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="Contoh: XII TKJ 2"
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
              <p className="text-[11px] text-[var(--ink-muted)]">
                Wali Kelas dapat mengganti nama kelas ini kapan saja (tersimpan otomatis). Tautan portal tetap <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--canvas-subtle)]">/portal/{currentSlug}</code> agar QR Code dan tautan wali murid tidak rusak.
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
                onClick={() => {
                  const nextVal = !requirePassword;
                  setRequirePassword(nextVal);
                  if (!nextVal) {
                    saveSettings({ requirePassword: false });
                  } else if (classInfo.parentPasswordHash) {
                    saveSettings({ requirePassword: true });
                  }
                }}
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

            {/* Password input when enabled with inline save */}
            {requirePassword && (
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="parent-pass" className="block text-xs font-semibold text-[var(--ink)]">
                    {classInfo.parentPasswordHash ? "Ganti Kata Sandi Akses" : "Tentukan Kata Sandi Akses"}
                  </label>
                  {savedPassNotice && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {savedPassNotice}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      id="parent-pass"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newPassword.trim().length >= 4) {
                            saveSettings({ requirePassword: true, newPassword: newPassword.trim() });
                            setNewPassword("");
                          } else {
                            setMessage({ text: "Kata sandi minimal 4 karakter.", isError: true });
                          }
                        }
                      }}
                      placeholder={
                        classInfo.parentPasswordHash
                          ? "Ketik untuk ganti kata sandi..."
                          : "Ketik kata sandi akses baru..."
                      }
                      className="w-full pl-3.5 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                  <button
                    type="button"
                    onClick={() => {
                      if (newPassword.trim().length >= 4) {
                        saveSettings({ requirePassword: true, newPassword: newPassword.trim() });
                        setNewPassword("");
                      } else {
                        setMessage({ text: "Kata sandi minimal 4 karakter.", isError: true });
                      }
                    }}
                    disabled={!newPassword.trim() || newPassword.trim().length < 4 || saveStatus === "saving"}
                    className="touch-target px-3.5 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-semibold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors"
                  >
                    Simpan Sandi
                  </button>
                </div>
                <p className="text-[11px] text-[var(--ink-subtle)]">
                  {classInfo.parentPasswordHash
                    ? "Status: Kata sandi aktif. Ketik sandi baru lalu klik 'Simpan Sandi' untuk memperbarui."
                    : "Wali murid wajib memasukkan kata sandi ini untuk mengakses papan presensi."}
                </p>
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
                onClick={() => {
                  const nextVal = !allowViewPhoto;
                  setAllowViewPhoto(nextVal);
                  saveSettings({ parentShowLetterFile: nextVal });
                }}
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
                <div>
                  <span className="text-xs font-semibold text-[var(--ink)] block">
                    Periode &amp; Tahun Ajaran
                  </span>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    {isCurrentAuto ? "Otomatis mengikuti kalender akademik aktif" : "Disesuaikan secara manual"}
                  </p>
                </div>

                {!isCurrentAuto && (
                  <button
                    type="button"
                    onClick={handleApplyAuto}
                    className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    title={`Gunakan periode otomatis saat ini (${autoPeriod.periodTitle} ${autoPeriod.academicYear})`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
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
                    onBlur={() => {
                      if (periodTitle.trim()) {
                        saveSettings({ periodTitle: periodTitle.trim() });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
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
                    onBlur={() => {
                      if (academicYear.trim()) {
                        saveSettings({ academicYear: academicYear.trim() });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    placeholder={autoPeriod.academicYear}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                Semester Ganjil dihitung otomatis Juli s/d Desember, Semester Genap Januari s/d Juni. Tahun ajaran dihitung Juli hingga Juni tahun berikutnya. Anda tetap dapat mengedit kedua kolom di atas secara manual kapan saja (tersimpan otomatis).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
