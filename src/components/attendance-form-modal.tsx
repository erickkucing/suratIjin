"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Calendar,
  Camera,
  Upload,
  AlertCircle,
  Loader2,
  FileText,
  ScanLine,
  ChevronDown,
  Image as ImageIcon,
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [scanningLetter, setScanningLetter] = useState(false);
  const [ocrStage, setOcrStage] = useState<1 | 2 | 3>(1);
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState<number>(0);
  const [ocrResultBanner, setOcrResultBanner] = useState<{
    studentName: string | null;
    candidateName?: string | null;
    className?: string | null;
    matchConfidence: number;
    status: string;
    startDate: string;
    endDate: string;
    isMultiDay: boolean;
    description: string;
    hardwareInfo?: string;
  } | null>(null);

  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
    onExpand: () => setIsExpanded(true),
  });

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const [isComboOpen, setIsComboOpen] = useState(false);
  const [showSourceSheet, setShowSourceSheet] = useState(false);
  const [studentError, setStudentError] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setIsComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsExpanded(false);
      setIsComboOpen(false);
      setShowSourceSheet(false);
      setStudentError(false);
      if (editRecord) {
        setStudentId(editRecord.studentId);
        const found = studentsList.find((s) => s.id === editRecord.studentId);
        setStudentSearch(found ? found.name : "");
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
        setStudentId(0);
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
      setScanningLetter(false);
      setOcrResultBanner(null);
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

  const runOcrScan = async (fileToScan: File) => {
    setScanningLetter(true);
    setOcrStage(2);
    setOcrElapsedSeconds(0);
    setErrorMessage(null);

    const timerInterval = setInterval(() => {
      setOcrElapsedSeconds((prev) => +(prev + 0.1).toFixed(1));
    }, 100);

    try {
      const formData = new FormData();
      formData.append("classId", String(classId));
      formData.append("file", fileToScan);

      const res = await fetch("/api/ocr/letter", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal memindai dokumen surat.");
      }

      setOcrStage(3);
      const detected = data.detected;
      if (detected) {
        if (detected.studentId) {
          setStudentId(detected.studentId);
          setStudentError(false);
          const found = studentsList.find((s) => s.id === detected.studentId);
          if (found) {
            setStudentSearch(found.name);
          }
        } else if (detected.studentName) {
          const found = studentsList.find(
            (s) => s.name.toLowerCase() === detected.studentName.toLowerCase()
          );
          if (found) {
            setStudentId(found.id);
            setStudentSearch(found.name);
            setStudentError(false);
          }
        }

        if (detected.status === "Sakit" || detected.status === "Izin") {
          setStatus(detected.status);
        }

        if (detected.startDate) {
          setStartDate(detected.startDate);
        }
        if (detected.endDate) {
          setEndDate(detected.endDate);
        }

        const isMultiDayDetected =
          detected.isMultiDay === true ||
          Boolean(
            detected.startDate &&
            detected.endDate &&
            detected.startDate !== detected.endDate
          );

        if (isMultiDayDetected) {
          setIsMultiDay(true);
        } else if (typeof detected.isMultiDay === "boolean") {
          setIsMultiDay(detected.isMultiDay);
        }

        if (detected.description) {
          setDescription(detected.description);
        }

        if (detected.infoSource) {
          const defaultSources = ["Orang tua", "Siswa sendiri", "Pengurus kelas"];
          if (defaultSources.includes(detected.infoSource)) {
            setInfoSource(detected.infoSource);
            setCustomInfoSource("");
          } else {
            setInfoSource("Lainnya");
            setCustomInfoSource(detected.infoSource);
          }
        }

        const hwTag = data.cached
          ? "Cache Cepat"
          : data.deviceName
          ? `${data.deviceName} • ${data.processingTimeSeconds ?? ocrElapsedSeconds}s`
          : data.device === "gpu"
          ? `GPU • ${data.processingTimeSeconds ?? ocrElapsedSeconds}s`
          : `${data.processingTimeSeconds ?? ocrElapsedSeconds}s`;

        setOcrResultBanner({
          studentName: detected.studentName,
          candidateName: detected.candidateName,
          className: detected.className,
          matchConfidence: detected.matchConfidence || 0,
          status: detected.status,
          startDate: detected.startDate,
          endDate: detected.endDate,
          isMultiDay: isMultiDayDetected,
          description: detected.description,
          hardwareInfo: hwTag,
        });
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Gagal memindai surat izin. Anda tetap dapat mengisi formulir secara manual."
      );
    } finally {
      clearInterval(timerInterval);
      setScanningLetter(false);
    }
  };

  const handleFilePicked = async (file: File, autoScan: boolean = true) => {
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

    let finalFile = file;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setSelectedFile(file);
      setFilePreviewUrl(null);
      setCompressionInfo({
        originalSize: file.size,
        compressedSize: file.size,
        reductionPercentage: 0,
      });
      finalFile = file;
    } else {
      setCompressing(true);
      setCompressionProgress(15);

      try {
        const result = await processFileBeforeUpload(
          file,
          (p) => setCompressionProgress(Math.min(100, Math.round(p))),
          { maxWidthOrHeight: 1400, maxSizeMB: 0.35, quality: 0.85 }
        );

        setSelectedFile(result.file);
        setFilePreviewUrl(URL.createObjectURL(result.file));
        setCompressionInfo({
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          reductionPercentage: result.reductionPercentage,
        });
        finalFile = result.file;
      } catch {
        setSelectedFile(file);
        setFilePreviewUrl(URL.createObjectURL(file));
        setCompressionInfo({
          originalSize: file.size,
          compressedSize: file.size,
          reductionPercentage: 0,
        });
        finalFile = file;
      } finally {
        setCompressing(false);
      }
    }

    if (autoScan) {
      await runOcrScan(finalFile);
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
    const exactStudent = studentsList.find(
      (s) => s.name.toLowerCase() === studentSearch.trim().toLowerCase()
    );
    const effectiveStudentId = studentId || (exactStudent ? exactStudent.id : 0);
    if (!effectiveStudentId) {
      setErrorMessage("Pilih siswa terlebih dahulu dari daftar.");
      setStudentError(true);
      return;
    }
    setStudentError(false);
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
          studentId: effectiveStudentId,
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
          studentId: effectiveStudentId,
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 pt-[env(safe-area-inset-top,1.5rem)] sm:p-6 bg-black/75 backdrop-blur-xs overflow-hidden sm:overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className={`relative w-full max-w-xl min-h-0 rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl border-t border-x sm:border border-[var(--border)] overflow-hidden flex flex-col modal-bottom-sheet ${
          isExpanded ? "max-h-[83dvh] expanded" : "max-h-[68dvh]"
        } sm:max-h-[85vh]`}
      >
        {/* Mobile Tactile Drag Handle */}
        <div data-drag-handle className="sm:hidden flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)]">
          <div className="w-12 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header */}
        <div data-sheet-header className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)] shrink-0 touch-none select-none">
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
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          onScroll={(e) => {
            if (!isExpanded && e.currentTarget.scrollTop > 18) {
              setIsExpanded(true);
            }
          }}
          className="p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 space-y-5 overflow-y-auto min-h-0 flex-1"
        >
          {/* Hidden file inputs accessible by camera and gallery buttons */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFilePicked(f, true);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFilePicked(f, true);
            }}
          />

          {/* Bagian Paling Atas: Tombol Upload/Foto & Langsung OCR, serta Mini Preview */}
          {status !== "Alpa" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] p-3 sm:p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[var(--primary-light)] text-[var(--primary)] shrink-0">
                    <ScanLine className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[var(--ink)] block">
                      Pindai Surat Otomatis (OCR)
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] block">
                      Foto atau unggah surat untuk mengisi data langsung
                    </span>
                  </div>
                </div>

                {!selectedFile && !existingFilePath && (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Desktop button: direct file picker */}
                    <button
                      type="button"
                      disabled={compressing || scanningLetter || loading}
                      onClick={() => galleryInputRef.current?.click()}
                      className="hidden sm:inline-flex touch-target items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {compressing || scanningLetter ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      <span>{compressing ? "Mengompres..." : scanningLetter ? "Memindai..." : "Foto / Pindai Surat"}</span>
                    </button>

                    {/* Mobile button: triggers mobile bottom sheet */}
                    <button
                      type="button"
                      disabled={compressing || scanningLetter || loading}
                      onClick={() => setShowSourceSheet(true)}
                      className="sm:hidden w-full touch-target flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {compressing || scanningLetter ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      <span>{compressing ? "Mengompres..." : scanningLetter ? "Memindai Surat..." : "Foto / Pindai Surat"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Compression Progress Bar */}
              {compressing && (
                <div className="p-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-[var(--primary)]" />
                      Mengompres foto untuk pemindaian cepat...
                    </span>
                    <span className="font-semibold">{compressionProgress}%</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-150"
                      style={{ width: `${compressionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Scanning state badge */}
              {scanningLetter && !compressing && (
                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium text-[var(--ink)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)] shrink-0" />
                      Mengekstrak data surat (PaddleOCR)...
                    </span>
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-[var(--canvas-subtle)] border border-[var(--border)] text-[var(--ink-muted)]">
                      {ocrElapsedSeconds.toFixed(1)}s
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] font-medium text-center">
                    <div
                      className={`p-1 rounded border transition-all ${
                        ocrStage >= 1
                          ? "bg-[var(--canvas-subtle)] border-[var(--primary)] text-[var(--primary)] font-semibold"
                          : "border-[var(--border)] text-[var(--ink-subtle)]"
                      }`}
                    >
                      1. Kompresi
                    </div>
                    <div
                      className={`p-1 rounded border transition-all ${
                        ocrStage >= 2
                          ? "bg-[var(--canvas-subtle)] border-[var(--primary)] text-[var(--primary)] font-semibold"
                          : "border-[var(--border)] text-[var(--ink-subtle)]"
                      }`}
                    >
                      2. OCR
                    </div>
                    <div
                      className={`p-1 rounded border transition-all ${
                        ocrStage >= 3
                          ? "bg-[var(--canvas-subtle)] border-[var(--primary)] text-[var(--primary)] font-semibold"
                          : "border-[var(--border)] text-[var(--ink-subtle)]"
                      }`}
                    >
                      3. Sinkron
                    </div>
                  </div>
                </div>
              )}

              {/* Mini Preview Thumbnail saat file ada */}
              {(selectedFile || existingFilePath) && (
                <div className="relative flex items-center gap-3 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt="Pratinjau Surat"
                      width={48}
                      height={48}
                      className="w-12 h-12 object-cover rounded-md border border-[var(--border)] shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-[var(--canvas-subtle)] flex items-center justify-center text-[var(--ink-muted)] border border-[var(--border)] shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate text-[var(--ink)]">
                      {selectedFile ? selectedFile.name : existingFilePath}
                    </p>
                    <p className="text-[11px] text-[var(--ink-muted)]">
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
                      setOcrResultBanner(null);
                      if (cameraInputRef.current) cameraInputRef.current.value = "";
                      if (galleryInputRef.current) galleryInputRef.current.value = "";
                    }}
                    className="touch-target p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                    title="Hapus file"
                    aria-label="Hapus file surat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Hasil Pemindaian: Teks Ringkas 1-2 Baris (Tanpa Card Terpisah) */}
              {ocrResultBanner && (
                <div className="flex items-start justify-between gap-2 pt-1 text-[11px] text-[var(--ink-muted)] border-t border-[var(--border)]/60">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <ScanLine className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                    <div className="min-w-0 leading-relaxed">
                      <span className="text-[var(--ink)] font-semibold">
                        {ocrResultBanner.studentName || ocrResultBanner.candidateName || "Siswa"}
                      </span>
                      {" • "}
                      <span className="font-medium text-[var(--primary)]">
                        {ocrResultBanner.status}
                      </span>
                      {" • "}
                      {ocrResultBanner.startDate ? (
                        <span>
                          {ocrResultBanner.isMultiDay && ocrResultBanner.endDate
                            ? `${ocrResultBanner.startDate} s/d ${ocrResultBanner.endDate}`
                            : ocrResultBanner.startDate}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 italic">
                          (Tanggal diisi manual)
                        </span>
                      )}
                      {ocrResultBanner.description && (
                        <span className="italic truncate block sm:inline sm:ml-1 text-[var(--ink-subtle)]">
                          (&ldquo;{ocrResultBanner.description}&rdquo;)
                        </span>
                      )}
                      {ocrResultBanner.hardwareInfo && (
                        <span className="text-[var(--ink-subtle)] text-[10px] ml-1">
                          ({ocrResultBanner.hardwareInfo})
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOcrResultBanner(null)}
                    className="p-1 text-[var(--ink-subtle)] hover:text-[var(--ink)] rounded cursor-pointer shrink-0"
                    title="Tutup ringkasan pindai"
                    aria-label="Tutup ringkasan pindai"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Combobox Pilih Siswa (Ketik & Autocomplete Jadi Satu) */}
          <div ref={comboRef} className="relative">
            <label htmlFor="student-combobox" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Pilih Siswa <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="student-combobox"
                type="text"
                role="combobox"
                aria-expanded={isComboOpen}
                aria-autocomplete="list"
                aria-controls="student-listbox"
                value={studentSearch}
                onFocus={() => setIsComboOpen(true)}
                onClick={() => setIsComboOpen(true)}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setStudentError(false);
                  setIsComboOpen(true);
                  if (!e.target.value.trim()) {
                    setStudentId(0);
                  }
                }}
                placeholder="Ketik nama atau NIS siswa..."
                className={`w-full pl-3.5 pr-16 py-2.5 text-sm rounded-lg bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 transition-all ${
                  studentError
                    ? "border-2 border-red-500 focus-visible:outline-red-500 ring-2 ring-red-500/20"
                    : "border border-[var(--border)] focus-visible:outline-[var(--primary)]"
                }`}
                required
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[var(--ink-muted)]">
                {studentSearch && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStudentSearch("");
                      setStudentId(0);
                      setStudentError(false);
                      setIsComboOpen(true);
                    }}
                    className="p-1 hover:text-[var(--ink)] rounded cursor-pointer"
                    aria-label="Bersihkan pencarian siswa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsComboOpen(!isComboOpen)}
                  className="p-1 hover:text-[var(--ink)] rounded cursor-pointer"
                  aria-label="Buka daftar siswa"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isComboOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* Floating Dropdown Listbox */}
            {isComboOpen && (
              <div
                id="student-listbox"
                role="listbox"
                className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl py-1 text-sm text-[var(--ink)]"
              >
                {filteredStudents.length === 0 ? (
                  <div className="px-3.5 py-2.5 text-xs text-[var(--ink-muted)] italic">
                    Tidak ada siswa yang cocok dengan &ldquo;{studentSearch}&rdquo;
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    const isSelected = s.id === studentId;
                    return (
                      <div
                        key={s.id}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setStudentId(s.id);
                          setStudentSearch(s.name);
                          setStudentError(false);
                          setIsComboOpen(false);
                        }}
                        className={`flex items-center justify-between px-3.5 py-2 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--primary-light)] text-[var(--primary)] font-semibold"
                            : "hover:bg-[var(--canvas-subtle)] text-[var(--ink)]"
                        }`}
                      >
                        <span>{s.name}</span>
                        {s.nis && (
                          <span className="text-xs text-[var(--ink-muted)] ml-2 shrink-0">
                            NIS: {s.nis}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
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

          {/* Mobile Camera & File Upload Section (Fallback / hanya tampil jika belum ada file dan bukan Alpa) */}
          {status !== "Alpa" && !selectedFile && !existingFilePath && (
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--ink-muted)]">
                  Lampiran Foto Surat (Manual)
                </span>
                <span className="text-xs text-[var(--ink-subtle)]">
                  Mendukung JPG, PNG, HEIC, PDF
                </span>
              </div>

              {/* Two explicit mobile action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={compressing || scanningLetter}
                  className="touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--accent-slate)] text-white hover:bg-[var(--accent-slate-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-slate)] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto Kamera</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={compressing || scanningLetter}
                  className="touch-target flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas)] text-[var(--ink)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-slate)] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Pilih File / Galeri</span>
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading || compressing || scanningLetter}
              className="touch-target px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-sm font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || compressing || scanningLetter}
              className="touch-target flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-semibold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{editRecord ? "Simpan Perubahan" : "Simpan Catatan"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Mobile Bottom Sheet untuk Pilihan Kamera vs Galeri */}
      {showSourceSheet && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={() => setShowSourceSheet(false)}
        >
          <div
            className="w-full max-w-lg bg-[var(--surface)] rounded-t-2xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-[var(--border)] shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider">
                Pilih Sumber Foto Surat
              </span>
              <button
                type="button"
                onClick={() => setShowSourceSheet(false)}
                className="touch-target text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 rounded-md cursor-pointer"
                aria-label="Tutup menu pilihan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSourceSheet(false);
                  cameraInputRef.current?.click();
                }}
                className="touch-target flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-xl bg-[var(--canvas-subtle)] hover:bg-[var(--primary-light)] text-[var(--ink)] hover:text-[var(--primary)] border border-[var(--border)] text-xs font-semibold cursor-pointer transition-colors"
              >
                <Camera className="w-5 h-5 text-[var(--primary)]" />
                <span>Ambil Foto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSourceSheet(false);
                  galleryInputRef.current?.click();
                }}
                className="touch-target flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-xl bg-[var(--canvas-subtle)] hover:bg-[var(--primary-light)] text-[var(--ink)] hover:text-[var(--primary)] border border-[var(--border)] text-xs font-semibold cursor-pointer transition-colors"
              >
                <ImageIcon className="w-5 h-5 text-[var(--accent-slate)]" />
                <span>Galeri / File</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
