"use client";

import { useState, useEffect, useRef } from "react";
import { X, Camera, Upload, CheckCircle2, AlertCircle, Calendar, User, FileText, Loader2 } from "lucide-react";
import { Student } from "@/db/schema";
import { AttendanceRecordWithStudent } from "@/db/queries";
import { processFileBeforeUpload, CompressionResult } from "@/lib/client-image-compress";
import { getLocalDateString, getDaysDifference } from "@/lib/date-utils";
import { createAttendanceAction, updateAttendanceAction } from "@/actions/attendance";

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
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"Izin" | "Sakit" | "Alpa">("Izin");
  const [infoSource, setInfoSource] = useState("Orang tua");
  const [customInfoSource, setCustomInfoSource] = useState("");
  const [description, setDescription] = useState("");

  // File handling state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const [existingMimeType, setExistingMimeType] = useState<string | null>(null);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editRecord) {
      setStudentId(editRecord.studentId);
      setStartDate(editRecord.attendanceDate);
      setIsMultiDay(false);
      setEndDate("");
      setStatus(editRecord.status);
      const isStandardInfo = ["Orang tua", "Siswa sendiri", "Pengurus kelas"].includes(editRecord.infoSource);
      if (isStandardInfo) {
        setInfoSource(editRecord.infoSource);
        setCustomInfoSource("");
      } else {
        setInfoSource("Lainnya");
        setCustomInfoSource(editRecord.infoSource);
      }
      setDescription(editRecord.description || "");
      setExistingFilePath(editRecord.letterFilePath);
      setExistingMimeType(editRecord.letterMimeType);
      setSelectedFile(null);
      setCompressionInfo(null);
      setFilePreviewUrl(editRecord.letterFilePath ? `/api/files/${editRecord.letterFilePath}` : null);
    } else {
      setStudentId(studentsList[0]?.id || 0);
      setStudentSearch("");
      setIsMultiDay(false);
      setStartDate(getLocalDateString());
      setEndDate("");
      setStatus("Izin");
      setInfoSource("Orang tua");
      setCustomInfoSource("");
      setDescription("");
      setSelectedFile(null);
      setExistingFilePath(null);
      setExistingMimeType(null);
      setCompressionInfo(null);
      setFilePreviewUrl(null);
    }
    setErrorMessage(null);
  }, [editRecord, isOpen, studentsList]);

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

  const handleFilePicked = async (file: File) => {
    setErrorMessage(null);
    setCompressing(true);
    setCompressionProgress(10);

    try {
      const result = await processFileBeforeUpload(file, (p) => {
        setCompressionProgress(p);
      });

      setSelectedFile(result.file);
      setCompressionInfo(result);

      if (result.file.type.startsWith("image/")) {
        const preview = URL.createObjectURL(result.file);
        setFilePreviewUrl(preview);
      } else {
        setFilePreviewUrl(null);
      }
    } catch (err: unknown) {
      console.error("File processing error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Gagal memproses file.");
    } finally {
      setCompressing(false);
    }
  };

  const calculateDays = () => {
    if (!isMultiDay || !endDate || endDate < startDate) return 1;
    return getDaysDifference(startDate, endDate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      setErrorMessage("Silakan pilih siswa terlebih dahulu.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      let finalFilePath = existingFilePath;
      let finalMimeType = existingMimeType;

      // Upload newly selected file if present
      if (selectedFile && status !== "Alpa") {
        const uploadData = new FormData();
        uploadData.append("file", selectedFile);
        uploadData.append("classId", String(classId));

        const res = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Gagal mengunggah file surat.");
        }

        finalFilePath = json.filePath;
        finalMimeType = json.mimeType;
      }

      const finalInfoSource = infoSource === "Lainnya" ? customInfoSource.trim() : infoSource;
      const letterStatus = finalFilePath ? "Sudah" : "Belum";

      if (editRecord) {
        const res = await updateAttendanceAction({
          recordId: editRecord.id,
          studentId,
          attendanceDate: startDate,
          status,
          infoSource: finalInfoSource || "Orang tua",
          description: description.trim(),
          letterFilePath: finalFilePath,
          letterMimeType: finalMimeType,
          letterStatus,
        });

        if (!res.success) {
          throw new Error(res.error);
        }
      } else {
        const res = await createAttendanceAction({
          classId,
          studentId,
          startDate,
          endDate: isMultiDay ? endDate : undefined,
          status,
          infoSource: finalInfoSource || "Orang tua",
          description: description.trim(),
          letterFilePath: finalFilePath,
          letterMimeType: finalMimeType,
          letterStatus,
        });

        if (!res.success) {
          throw new Error(res.error);
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error("Submit error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = studentsList.filter((s) =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl my-6 bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[var(--board)] text-white">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 id="attendance-modal-title" className="text-lg font-bold font-heading">
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
            className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Student Selection */}
          <div>
            <label htmlFor="student-select" className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
              Pilih Siswa <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Ketik untuk mencari nama siswa..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
              <select
                id="student-select"
                value={studentId}
                onChange={(e) => setStudentId(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
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
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
                  isMultiDay ? "bg-[var(--board)]" : "bg-gray-300 dark:bg-gray-700"
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
              <label htmlFor="start-date" className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
                {isMultiDay ? "Tanggal Mulai" : "Tanggal"} <span className="text-red-500">*</span>
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                required
              />
            </div>

            {isMultiDay && !editRecord && (
              <div>
                <label htmlFor="end-date" className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
                  Tanggal Selesai (Maks. 14 Hari) <span className="text-red-500">*</span>
                </label>
                <input
                  id="end-date"
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                  required={isMultiDay}
                />
                <span className="block mt-1 text-xs text-[var(--board)] font-medium">
                  Total: {calculateDays()} hari berturut-turut
                </span>
              </div>
            )}
          </div>

          {/* Status Kehadiran Radio Chips */}
          <div>
            <span className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
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
                    className={`touch-target flex items-center justify-center py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
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
            <span className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
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
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
                      isSelected
                        ? "bg-[var(--board)] text-white border-[var(--board)]"
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
                className="mt-2 w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                required
              />
            )}
          </div>

          {/* Keterangan */}
          <div>
            <label htmlFor="keterangan" className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5">
              Keterangan Alasan
            </label>
            <input
              id="keterangan"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Demam tinggi, kontrol dokter, izin sim..."
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            />
          </div>

          {/* Mobile Camera & File Upload Section (Disabled if Alpa) */}
          {status !== "Alpa" && (
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)]">
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
                  className="touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto Kamera</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={compressing}
                  className="touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas)] text-[var(--ink)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
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
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--board)]" />
                      Mengompres foto untuk koneksi cepat...
                    </span>
                    <span className="font-semibold">{compressionProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full bg-[var(--board)] transition-all duration-150"
                      style={{ width: `${compressionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Compression feedback badge */}
              {compressionInfo && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
              className="touch-target px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-sm font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || compressing}
              className="touch-target flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--terracotta)] text-white hover:bg-[var(--terracotta-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--terracotta)] disabled:opacity-50"
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
