"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Calendar,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
} from "lucide-react";
import { Student } from "@/db/schema";
import { AttendanceRecordWithStudent } from "@/db/queries";
import {
  createAttendanceAction,
  updateAttendanceAction,
} from "@/actions/attendance";
import { processFileBeforeUpload } from "@/lib/client-image-compress";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

interface AttendanceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  studentsList: Student[];
  editRecord?: AttendanceRecordWithStudent | null;
  onSuccess: () => void;
}

export function AttendanceFormModal({
  isOpen,
  onClose,
  classId,
  studentsList,
  editRecord,
  onSuccess,
}: AttendanceFormModalProps) {
  const [studentId, setStudentId] = useState<number>(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [status, setStatus] = useState<"Izin" | "Sakit" | "Alpa">("Izin");
  const [infoSource, setInfoSource] = useState("Orang tua");
  const [customInfoSource, setCustomInfoSource] = useState("");
  const [description, setDescription] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number;
    compressedSize: number;
    reductionPercentage: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
  });

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editRecord) {
        setStudentId(editRecord.studentId);
        setStartDate(editRecord.attendanceDate);
        setEndDate(editRecord.attendanceDate);
        setIsMultiDay(false);
        setStatus(editRecord.status as "Izin" | "Sakit" | "Alpa");
        const defaultSources = ["Orang tua", "Siswa sendiri", "Pengurus kelas"];
        if (defaultSources.includes(editRecord.infoSource)) {
          setInfoSource(editRecord.infoSource);
          setCustomInfoSource("");
        } else {
          setInfoSource("Lainnya");
          setCustomInfoSource(editRecord.infoSource);
        }
        setDescription(editRecord.description || "");
        setExistingFilePath(editRecord.letterFilePath || null);
        setSelectedFile(null);
        setFilePreviewUrl(
          editRecord.letterFilePath ? `/api/files/${editRecord.letterFilePath}` : null
        );
      } else {
        const today = new Date().toISOString().split("T")[0];
        setStudentId(studentsList.length > 0 ? studentsList[0].id : 0);
        setStudentSearch("");
        setStartDate(today);
        setEndDate(today);
        setIsMultiDay(false);
        setStatus("Izin");
        setInfoSource("Orang tua");
        setCustomInfoSource("");
        setDescription("");
        setSelectedFile(null);
        setExistingFilePath(null);
        setFilePreviewUrl(null);
      }
      setCompressing(false);
      setCompressionProgress(0);
      setCompressionInfo(null);
      setErrorMessage(null);
    }
  }, [isOpen, editRecord, studentsList]);

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

  useEffect(() => {
    return () => {
      if (filePreviewUrl && filePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  if (!isOpen) return null;

  const handleFilePicked = async (file: File) => {
    setErrorMessage(null);
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i)) {
      setErrorMessage("Format file tidak didukung. Gunakan foto (JPG, PNG, HEIC) atau file PDF.");
      return;
    }

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(file);
      setFilePreviewUrl(null);
      setCompressionInfo({
        originalSize: file.size,
        compressedSize: file.size,
        reductionPercentage: 0,
      });
      return;
    }

    setCompressing(true);
    setCompressionProgress(15);

    try {
      const result = await processFileBeforeUpload(file, (p) =>
        setCompressionProgress(Math.min(100, Math.round(p)))
      );

      setSelectedFile(result.file);
      setFilePreviewUrl(URL.createObjectURL(result.file));
      setCompressionInfo({
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        reductionPercentage: result.reductionPercentage,
      });
    } catch {
      setSelectedFile(file);
      setFilePreviewUrl(URL.createObjectURL(file));
      setCompressionInfo({
        originalSize: file.size,
        compressedSize: file.size,
        reductionPercentage: 0,
      });
    } finally {
      setCompressing(false);
    }
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      setErrorMessage("Pilih siswa terlebih dahulu.");
      return;
    }
    if (!startDate) {
      setErrorMessage("Tentukan tanggal ketidakhadiran.");
      return;
    }
    if (isMultiDay && endDate < startDate) {
      setErrorMessage("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }

    const finalSource = infoSource === "Lainnya" ? customInfoSource.trim() : infoSource;
    if (!finalSource) {
      setErrorMessage("Sebutkan sumber informasi.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      let uploadedFilePath = existingFilePath;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("classId", String(classId));
        formData.append("file", selectedFile);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          throw new Error(uploadData.error || "Gagal mengunggah foto surat.");
        }
        uploadedFilePath = uploadData.filePath;
      }

      const letterStatus = status === "Alpa" ? "Belum" : uploadedFilePath ? "Sudah" : "Belum";

      if (editRecord) {
        const res = await updateAttendanceAction({
          recordId: editRecord.id,
          studentId,
          attendanceDate: startDate,
          status,
          infoSource: finalSource,
          description: description.trim() || undefined,
          letterStatus,
          letterFilePath: uploadedFilePath || undefined,
        });

        if (!res.success) {
          throw new Error(res.error || "Gagal memperbarui catatan ketidakhadiran.");
        }
      } else {
        const res = await createAttendanceAction({
          classId,
          studentId,
          startDate,
          endDate: isMultiDay ? endDate : undefined,
          status,
          infoSource: finalSource,
          description: description.trim() || undefined,
          letterStatus,
          letterFilePath: uploadedFilePath || undefined,
        });

        if (!res.success) {
          throw new Error(res.error || "Gagal menyimpan catatan ketidakhadiran.");
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data."
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = studentsList.filter((s) =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.nis && s.nis.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/75 backdrop-blur-xs overflow-hidden sm:overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className="relative w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl border-t border-x sm:border border-[var(--border)] overflow-hidden flex flex-col"
      >
        {/* Mobile Tactile Drag Handle */}
        <div data-drag-handle className="sm:hidden flex justify-center pt-2.5 pb-1 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)]">
          <div className="w-10 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 id="attendance-modal-title" className="text-base sm:text-lg font-bold font-heading">
                {editRecord ? "Edit Catatan Ketidakhadiran" : "+ Catat Ketidakhadiran Baru"}
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                {editRecord ? "Perbarui informasi izin/sakit siswa" : "Formulir input izin, sakit, atau alpa"}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Student Selection */}
          <div>
            <label htmlFor="student-select" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Pilih Siswa <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Ketik untuk mencari nama siswa..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
              <select
                id="student-select"
                value={studentId}
                onChange={(e) => setStudentId(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                required
              >
                {filteredStudents.length === 0 ? (
                  <option value={0} disabled>
                    Tidak ada siswa yang sesuai
                  </option>
                ) : (
                  filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.nis ? `(${s.nis})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Single Day vs Multi-Day Rentang Tanggal Toggle */}
          {!editRecord && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
              <div>
                <span className="text-sm font-semibold text-[var(--ink)]">
                  Izin beberapa hari beruntun?
                </span>
                <p className="text-xs text-[var(--ink-muted)]">
                  Aktifkan untuk izin/sakit dengan 1 surat yang berlaku beberapa hari
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isMultiDay}
                onClick={() => setIsMultiDay(!isMultiDay)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                  isMultiDay ? "bg-[var(--primary)]" : "bg-gray-300 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isMultiDay ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Date Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-date" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                {isMultiDay ? "Tanggal Mulai" : "Tanggal"} <span className="text-red-500">*</span>
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                required
              />
            </div>

            {isMultiDay && !editRecord && (
              <div>
                <label htmlFor="end-date" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
                  Tanggal Selesai (Maks. 14 Hari) <span className="text-red-500">*</span>
                </label>
                <input
                  id="end-date"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  required={isMultiDay}
                />
                <span className="block mt-1 text-xs text-[var(--primary)] font-medium">
                  Total: {calculateDays()} hari berturut-turut
                </span>
              </div>
            )}
          </div>

          {/* Status Kehadiran Radio Chips */}
          <div>
            <span className="block text-xs font-semibold text-[var(--ink-muted)] mb-2">
              Status Kehadiran <span className="text-red-500">*</span>
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              {(["Izin", "Sakit", "Alpa"] as const).map((s) => {
                const isSelected = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`touch-target flex items-center justify-center py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                      isSelected
                        ? s === "Izin"
                          ? "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)] ring-2 ring-[var(--status-izin-fg)]"
                          : s === "Sakit"
                          ? "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)] ring-2 ring-[var(--status-sakit-fg)]"
                          : "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)] ring-2 ring-[var(--status-alpa-fg)]"
                        : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {status === "Alpa" && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                Status Alpa otomatis menandai status surat sebagai &apos;Belum&apos; dan tidak memerlukan lampiran surat.
              </p>
            )}
          </div>

          {/* Info Dari Chips */}
          <div>
            <span className="block text-xs font-semibold text-[var(--ink-muted)] mb-2">
              Informasi Dari <span className="text-red-500">*</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {["Orang tua", "Siswa sendiri", "Pengurus kelas", "Lainnya"].map((src) => {
                const isSelected = infoSource === src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setInfoSource(src)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                      isSelected
                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                        : "bg-[var(--surface)] border-[var(--border)] text-[var(--ink-muted)] hover:bg-[var(--canvas-subtle)]"
                    }`}
                  >
                    {src}
                  </button>
                );
              })}
            </div>
            {infoSource === "Lainnya" && (
              <input
                type="text"
                value={customInfoSource}
                onChange={(e) => setCustomInfoSource(e.target.value)}
                placeholder="Sebutkan sumber info (cth: Guru Piket, Wali Asrama)..."
                className="mt-2 w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                required
              />
            )}
          </div>

          {/* Keterangan */}
          <div>
            <label htmlFor="keterangan" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Keterangan Alasan
            </label>
            <input
              id="keterangan"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Demam tinggi, kontrol dokter, izin sim..."
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            />
          </div>

          {/* Mobile Camera & File Upload Section (Disabled if Alpa) */}
          {status !== "Alpa" && (
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  Foto Surat Izin / Keterangan Dokter
                </span>
                <span className="text-xs text-[var(--ink-subtle)]">
                  Mendukung JPG, PNG, HEIC, PDF
                </span>
              </div>

              {/* Hidden file inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePicked(f);
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePicked(f);
                }}
              />

              {/* Two explicit mobile action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={compressing}
                  className="touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--accent-slate)] text-white hover:bg-[var(--accent-slate-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-slate)] disabled:opacity-50 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto Kamera</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={compressing}
                  className="touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas)] text-[var(--ink)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-slate)] disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Pilih File / Galeri</span>
                </button>
              </div>

              {/* Compression Progress */}
              {compressing && (
                <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                      Mengompres foto untuk koneksi cepat...
                    </span>
                    <span className="font-semibold">{compressionProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-150"
                      style={{ width: `${compressionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Compression feedback badge */}
              {compressionInfo && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-[var(--status-success-fg)] text-xs">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[var(--status-success-fg)] shrink-0" />
                    File siap diunggah ({Math.round(compressionInfo.compressedSize / 1024)} KB
                    {compressionInfo.reductionPercentage > 0
                      ? `, hemat ${compressionInfo.reductionPercentage}%`
                      : ""})
                  </span>
                </div>
              )}

              {/* File Preview */}
              {(filePreviewUrl || existingFilePath) && (
                <div className="relative flex items-center gap-3 p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt="Pratinjau Surat"
                      width={56}
                      height={56}
                      className="w-14 h-14 object-cover rounded-md border border-[var(--border)]"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-md bg-[var(--canvas-subtle)] flex items-center justify-center text-[var(--ink-muted)] border border-[var(--border)]">
                      <FileText className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-[var(--ink)]">
                      {selectedFile ? selectedFile.name : existingFilePath}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : "File tersimpan"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setExistingFilePath(null);
                      setFilePreviewUrl(null);
                      setCompressionInfo(null);
                    }}
                    className="touch-target p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                    title="Hapus file"
                    aria-label="Hapus file surat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading || compressing}
              className="touch-target px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-sm font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || compressing}
              className="touch-target flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editRecord ? "Simpan Perubahan" : "Simpan Catatan"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
