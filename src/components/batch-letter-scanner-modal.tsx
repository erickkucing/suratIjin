"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Files,
  Camera,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Check,
  Loader2,
  FileText,
  Image as ImageIcon,
  ZoomIn,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { Student } from "@/db/schema";
import { processFileBeforeUpload } from "@/lib/client-image-compress";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

export interface BatchLetterItem {
  tempFileId: string;
  previewUrl: string;
  studentId: number | null;
  studentName: string | null;
  candidateName: string | null;
  matchConfidence: number;
  status: "Izin" | "Sakit";
  startDate: string;
  endDate: string | null;
  isMultiDay: boolean;
  description: string;
  actionType: "update" | "create";
  existingRecordId: number | null;
}

export interface EditableBatchLetterItem extends BatchLetterItem {
  id: string;
  isSelected: boolean;
  userModified: boolean;
  needsReview: boolean;
}

export interface BatchLetterScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  classNameTitle?: string;
  studentsList: Student[];
  onSuccess: (result?: { updatedCount: number; createdCount: number }) => void;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
}

type ProgressStage =
  | "idle"
  | "compressing"
  | "uploading"
  | "processing_ocr"
  | "auto_applying";

const MAX_BATCH_FILES = 10;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function BatchLetterScannerModal({
  isOpen,
  onClose,
  classId,
  classNameTitle,
  studentsList,
  onSuccess,
  onShowToast,
}: BatchLetterScannerModalProps) {
  // Navigation & View Mode
  const [activeTab] = useState<"multi_file">("multi_file");
  const [viewMode, setViewMode] = useState<"picker" | "review">("picker");

  // Multi-File & Multi-Shot selection state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Map<File, string>>(new Map());
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Review Drawer state
  const [items, setItems] = useState<EditableBatchLetterItem[]>([]);
  const [activeLightboxUrl, setActiveLightboxUrl] = useState<string | null>(null);

  // Processing & Progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState<ProgressStage>("idle");
  const [progressDetail, setProgressDetail] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Submission state
  const [isSubmittingSync, setIsSubmittingSync] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // DOM Refs
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const multiCameraInputRef = useRef<HTMLInputElement>(null);

  // Mobile Bottom Sheet Gesture Integration
  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose: () => {
      if (!isProcessing && !isSubmittingSync) {
        onClose();
      }
    },
    isExpanded,
    onExpand: () => setIsExpanded(true),
    onCollapse: () => setIsExpanded(false),
  });

  // Keep thumbnail previews in sync with selectedFiles
  useEffect(() => {
    const nextMap = new Map<File, string>();
    selectedFiles.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const existing = filePreviews.get(file);
        if (existing) {
          nextMap.set(file, existing);
        } else {
          try {
            nextMap.set(file, URL.createObjectURL(file));
          } catch {
            // ignore
          }
        }
      }
    });

    filePreviews.forEach((url, file) => {
      if (!nextMap.has(file)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
    });

    setFilePreviews(nextMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles]);

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setViewMode("picker");
      setSelectedFiles([]);
      filePreviews.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
      setFilePreviews(new Map());
      setItems([]);
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressStage("idle");
      setProgressDetail("");
      setElapsedSeconds(0);
      setIsSubmittingSync(false);
      setErrorMessage(null);
      setIsExpanded(false);
      setActiveLightboxUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      filePreviews.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      });
    };
  }, [filePreviews]);

  // Keyboard navigation (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeLightboxUrl) {
          setActiveLightboxUrl(null);
          return;
        }
        if (!isProcessing && !isSubmittingSync) {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isProcessing, isSubmittingSync, activeLightboxUrl, onClose]);

  // File validation helper
  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `Ukuran file "${file.name}" melebihi batas maksimal 15 MB.`;
    }
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      return `Format file "${file.name}" tidak didukung. Harap gunakan gambar (JPG, PNG, WebP) atau dokumen PDF.`;
    }
    return null;
  };

  // Multi-File handlers
  const handleAddFiles = (newFiles: FileList | File[]) => {
    setErrorMessage(null);
    const validToAdd: File[] = [];
    const errors: string[] = [];

    const fileListArray = Array.from(newFiles);

    for (const f of fileListArray) {
      const err = validateFile(f);
      if (err) {
        errors.push(err);
      } else {
        const alreadyExists = selectedFiles.some(
          (existing) => existing.name === f.name && existing.size === f.size
        );
        if (!alreadyExists) {
          validToAdd.push(f);
        }
      }
    }

    if (errors.length > 0) {
      setErrorMessage(errors[0]);
    }

    const combined = [...selectedFiles, ...validToAdd];
    if (combined.length > MAX_BATCH_FILES) {
      setErrorMessage(`Maksimal ${MAX_BATCH_FILES} berkas per pemindaian batch. Beberapa berkas dipotong.`);
      setSelectedFiles(combined.slice(0, MAX_BATCH_FILES));
    } else {
      setSelectedFiles(combined);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // -------------------------------------------------------------
  // CORE SCANNING & HYBRID AUTO-APPLY ENGINE
  // -------------------------------------------------------------
  const handleStartScan = async () => {
    setErrorMessage(null);
    const filesToProcess = selectedFiles;

    if (filesToProcess.length === 0) {
      setErrorMessage("Pilih atau ambil minimal 1 foto/berkas surat sebelum memulai pemindaian.");
      return;
    }

    setIsProcessing(true);
    setProgressPercent(0);
    setProgressStage("compressing");
    setProgressDetail("Mempersiapkan berkas untuk optimasi...");
    setElapsedSeconds(0);

    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startTime) / 1000));
    }, 500);

    try {
      // ---------------------------------------------------------
      // STAGE 1: Client Compression (0% - 30%)
      // ---------------------------------------------------------
      const compressedFiles: File[] = [];
      const totalFiles = filesToProcess.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = filesToProcess[i];
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

        if (isPdf) {
          compressedFiles.push(file);
          const stagePct = Math.round(((i + 1) / totalFiles) * 30);
          setProgressPercent(stagePct);
          setProgressDetail(`Memverifikasi dokumen PDF (${i + 1}/${totalFiles})...`);
        } else {
          setProgressDetail(`Mengompresi resolusi gambar (${i + 1}/${totalFiles})...`);
          const compResult = await processFileBeforeUpload(
            file,
            (filePct) => {
              const base = (i / totalFiles) * 30;
              const slice = (filePct / 100) * (30 / totalFiles);
              setProgressPercent(Math.min(30, Math.round(base + slice)));
            },
            { maxWidthOrHeight: 1600, quality: 0.82 }
          );
          compressedFiles.push(compResult.file);
        }
      }

      setProgressPercent(30);

      // ---------------------------------------------------------
      // STAGE 2: Upload to Server (30% - 60%)
      // ---------------------------------------------------------
      setProgressStage("uploading");
      setProgressDetail("Mengunggah berkas terkompresi ke server aman...");

      const formData = new FormData();
      formData.append("classId", String(classId));
      formData.append("mode", "multi_file");
      compressedFiles.forEach((f) => formData.append("files", f));

      const uploadTicker = setInterval(() => {
        setProgressPercent((p) => (p < 58 ? p + 3 : p));
      }, 150);

      const ocrFetchPromise = fetch("/api/ocr/letter/batch", {
        method: "POST",
        body: formData,
      });

      // ---------------------------------------------------------
      // STAGE 3: Batch OCR Processing (60% - 100%)
      // ---------------------------------------------------------
      setTimeout(() => {
        clearInterval(uploadTicker);
        setProgressStage("processing_ocr");
        setProgressPercent(60);
        setProgressDetail("Mengekstrak teks surat & menyelaraskan nama siswa (AI Vision & OCR)...");
      }, 700);

      const ocrTicker = setInterval(() => {
        setProgressPercent((p) => (p >= 60 && p < 95 ? p + 1 : p));
      }, 350);

      const ocrRes = await ocrFetchPromise;
      clearInterval(uploadTicker);
      clearInterval(ocrTicker);

      const ocrData = await ocrRes.json();
      if (!ocrRes.ok || !ocrData.success) {
        throw new Error(ocrData.error || "Gagal memproses pemindaian batch surat.");
      }

      setProgressPercent(100);

      // Edge case: no items detected
      if (!ocrData.items || ocrData.items.length === 0) {
        setIsProcessing(false);
        setProgressStage("idle");
        setErrorMessage(
          "Tidak dapat mengekstrak data dari berkas yang diunggah. Pastikan foto atau dokumen terbaca jelas."
        );
        return;
      }

      // ---------------------------------------------------------
      // HYBRID AUTO-APPLY FLOW
      // ---------------------------------------------------------
      if (ocrData.allHighConfidence) {
        setProgressStage("auto_applying");
        setProgressDetail("Semua surat valid (≥85%). Menyimpan otomatis ke presensi...");

        const syncPayload = {
          classId,
          items: ocrData.items.map((item: BatchLetterItem) => ({
            tempFileId: item.tempFileId,
            studentId: item.studentId!,
            status: item.status,
            startDate: item.startDate,
            endDate: item.endDate || null,
            isMultiDay: item.isMultiDay,
            description: item.description,
            actionType: item.actionType,
            existingRecordId: item.existingRecordId || null,
          })),
        };

        try {
          const syncRes = await fetch("/api/attendance/batch-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(syncPayload),
          });

          const syncData = await syncRes.json();
          if (!syncRes.ok || !syncData.success) {
            throw new Error(syncData.error || "Gagal menyinkronkan data presensi otomatis.");
          }

          // SUCCESS: Auto-close modal, trigger toast, and refresh dashboard
          clearInterval(timerInterval);
          setIsProcessing(false);
          setProgressStage("idle");
          onClose();
          onShowToast(
            `Berhasil: ${syncData.updatedCount ?? 0} catatan diperbarui, ${syncData.createdCount ?? 0} dibuat baru`,
            "success"
          );
          onSuccess({
            updatedCount: syncData.updatedCount ?? 0,
            createdCount: syncData.createdCount ?? 0,
          });
          return;
        } catch (syncErr: unknown) {
          console.warn("Auto-apply sync failed, fallback to Review Drawer:", syncErr);
          // Fallback resilience: do NOT drop items, transition to Review Drawer
          setErrorMessage(
            `Sinkronisasi otomatis gagal: ${
              syncErr instanceof Error ? syncErr.message : "Kesalahan server"
            }. Silakan tinjau dan klik Simpan & Sinkronkan manual.`
          );
          const reviewItems: EditableBatchLetterItem[] = ocrData.items.map(
            (item: BatchLetterItem, idx: number) => ({
              ...item,
              id: `item-${Date.now()}-${idx}`,
              isSelected: true,
              userModified: false,
              needsReview: false,
            })
          );
          setItems(reviewItems);
          setViewMode("review");
          return;
        }
      }

      // ---------------------------------------------------------
      // CONDITIONAL REVIEW DRAWER (Confidence < 85% or Ambiguous)
      // ---------------------------------------------------------
      const reviewItems: EditableBatchLetterItem[] = ocrData.items.map(
        (item: BatchLetterItem, idx: number) => {
          const needsReview =
            !item.studentId || item.matchConfidence < 0.85 || !item.startDate;
          return {
            ...item,
            id: `item-${Date.now()}-${idx}`,
            isSelected: true,
            userModified: false,
            needsReview,
          };
        }
      );

      setItems(reviewItems);
      setViewMode("review");
    } catch (err: unknown) {
      console.error("Batch scan error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memproses pemindaian surat."
      );
    } finally {
      clearInterval(timerInterval);
      setIsProcessing(false);
      setProgressStage("idle");
    }
  };

  // -------------------------------------------------------------
  // REVIEW DRAWER ITEM EDITING
  // -------------------------------------------------------------
  const handleItemFieldChange = <K extends keyof EditableBatchLetterItem>(
    index: number,
    field: K,
    value: EditableBatchLetterItem[K]
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value, userModified: true };

      // If studentId changed, update studentName and clear needsReview if satisfied
      if (field === "studentId") {
        const found = studentsList.find((s) => s.id === (value as number));
        item.studentName = found ? found.name : null;
        if (found && item.startDate) {
          item.needsReview = false;
        }
      }

      copy[index] = item;
      return copy;
    });
  };

  const handleToggleItemSelection = (index: number) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], isSelected: !copy[index].isSelected };
      return copy;
    });
  };

  const handleRemoveReviewItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // -------------------------------------------------------------
  // MANUAL REVIEW SUBMISSION
  // -------------------------------------------------------------
  const handleConfirmSync = async () => {
    const selected = items.filter((i) => i.isSelected);
    if (selected.length === 0) {
      setErrorMessage("Pilih minimal 1 surat untuk disinkronkan.");
      return;
    }

    // Validation checks
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      if (!item.studentId) {
        setErrorMessage(
          `Siswa belum dipilih untuk surat ${
            item.candidateName ? `"${item.candidateName}"` : `#${i + 1}`
          }. Harap pilih nama siswa.`
        );
        return;
      }
      if (!item.startDate) {
        setErrorMessage(
          `Tanggal mulai presensi belum ditentukan untuk siswa ${
            item.studentName || `#${i + 1}`
          }.`
        );
        return;
      }
    }

    setIsSubmittingSync(true);
    setErrorMessage(null);

    try {
      const syncPayload = {
        classId,
        items: selected.map((item) => ({
          tempFileId: item.tempFileId,
          studentId: item.studentId!,
          status: item.status,
          startDate: item.startDate,
          endDate: item.endDate || null,
          isMultiDay: item.isMultiDay,
          description: item.description,
          actionType: item.actionType,
          existingRecordId: item.existingRecordId || null,
        })),
      };

      const res = await fetch("/api/attendance/batch-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(syncPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menyinkronkan data presensi.");
      }

      onClose();
      onShowToast(
        `Berhasil: ${data.updatedCount ?? 0} catatan diperbarui, ${data.createdCount ?? 0} dibuat baru`,
        "success"
      );
      onSuccess({
        updatedCount: data.updatedCount ?? 0,
        createdCount: data.createdCount ?? 0,
      });
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Gagal menyinkronkan data presensi."
      );
    } finally {
      setIsSubmittingSync(false);
    }
  };

  if (!isOpen) return null;

  const selectedCount = items.filter((i) => i.isSelected).length;
  const needsReviewCount = items.filter((i) => i.needsReview).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-scanner-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className={`w-full max-w-3xl bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)] shadow-2xl flex flex-col transition-[max-height,height,transform] duration-250 ease-out overflow-hidden modal-bottom-sheet ${
          isExpanded ? "h-[92dvh] max-h-[92dvh] expanded" : "max-h-[68dvh]"
        } sm:rounded-2xl sm:max-h-[88vh] sm:h-auto rounded-t-3xl`}
      >
        {/* Mobile Tactile Drag Handle */}
        <div
          data-drag-handle
          className="sm:hidden flex justify-center pt-3 pb-3 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)] shrink-0"
        >
          <div className="w-12 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Modal Header */}
        <div
          data-sheet-header
          className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] shrink-0 bg-[var(--surface)]"
        >
          <div className="flex items-center gap-3">
            {viewMode === "review" && (
              <button
                type="button"
                onClick={() => setViewMode("picker")}
                disabled={isSubmittingSync}
                className="touch-target p-2 rounded-xl text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                title="Kembali ke pemilihan file"
                aria-label="Kembali ke pemilihan file"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="batch-scanner-title"
                className="text-base sm:text-lg font-bold font-heading text-[var(--ink)] leading-tight"
              >
                {viewMode === "picker"
                  ? "Pindai Surat Izin"
                  : `Tinjau Hasil Pemindaian (${items.length} Surat)`}
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                {viewMode === "picker"
                  ? classNameTitle
                    ? `Kelas ${classNameTitle} • Auto-Deteksi & Sinkronisasi Cerdas`
                    : "Auto-Deteksi & Sinkronisasi Cerdas Presensi"
                  : `${selectedCount} surat terpilih untuk disinkronkan`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing || isSubmittingSync}
            className="touch-target p-2 rounded-xl text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Area */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
          onScroll={(e) => {
            if (!isExpanded && e.currentTarget.scrollTop > 15) {
              setIsExpanded(true);
            }
          }}
        >
          {/* Global Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-[var(--status-alpa-border)] bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] text-xs sm:text-sm animate-in fade-in"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
                aria-label="Tutup pesan error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW MODE 1: FILE PICKER & PROCESSING (Unified Multi-Shot) */}
          {/* ========================================================= */}
          {viewMode === "picker" && (
            <div className="space-y-4">
              {/* Hidden Inputs for Native Camera & File Selection */}
              <input
                ref={multiCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
              <input
                ref={multiFileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleAddFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />

              {/* Progress Bar (Visible during processing) */}
              {isProcessing && (
                <div className="p-4 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-light)]/40 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)]">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                      {progressStage === "compressing" && "Tahap 1: Kompresi Klien (0–30%)"}
                      {progressStage === "uploading" && "Tahap 2: Pengunggahan Berkas (30–60%)"}
                      {progressStage === "processing_ocr" && "Tahap 3: Pemindaian AI & OCR (60–100%)"}
                      {progressStage === "auto_applying" && "Auto-Apply: Sinkronisasi Presensi..."}
                    </span>
                    <span className="tabular-nums font-mono text-[var(--primary)] text-sm">
                      {progressPercent}%
                    </span>
                  </div>

                  {/* Progress Bar Track */}
                  <div className="w-full h-2.5 rounded-full bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
                    <p className="truncate">{progressDetail}</p>
                    <span className="tabular-nums ml-2 shrink-0">
                      {elapsedSeconds}s
                    </span>
                  </div>
                </div>
              )}

              {/* EMPTY STATE: Belum ada foto/berkas */}
              {selectedFiles.length === 0 && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-colors ${
                    isDraggingOver
                      ? "border-[var(--primary)] bg-[var(--primary-light)]/40"
                      : "border-[var(--border)] bg-[var(--canvas-subtle)]/50"
                  }`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-[var(--surface)] text-[var(--primary)] border border-[var(--border)] flex items-center justify-center mx-auto mb-3.5 shadow-xs">
                    <Camera className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-[var(--ink)]">
                    Pindai Lembar Surat Izin Siswa
                  </h3>
                  <p className="text-xs text-[var(--ink-muted)] mt-1.5 max-w-md mx-auto leading-relaxed">
                    Ambil foto langsung berkali-kali menggunakan kamera HP, atau letakkan beberapa surat sekaligus di atas meja untuk dideteksi otomatis oleh AI.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => multiCameraInputRef.current?.click()}
                      className="touch-target w-full sm:w-auto min-h-[52px] px-6 py-3 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] active:scale-98 text-sm font-bold shadow-md shadow-[var(--primary)]/20 inline-flex items-center justify-center gap-2.5 cursor-pointer transition-all"
                      title="Ambil foto surat langsung dengan kamera HP"
                    >
                      <Camera className="w-5 h-5 text-white" />
                      <span>Jepret Kamera</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => multiFileInputRef.current?.click()}
                      className="touch-target w-full sm:w-auto min-h-[52px] px-5 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-sm font-bold text-[var(--ink)] shadow-xs inline-flex items-center justify-center gap-2.5 cursor-pointer transition-all"
                      title="Pilih satu atau lebih file foto / PDF dari galeri"
                    >
                      <Files className="w-5 h-5 text-[var(--primary)]" />
                      <span>Pilih dari Berkas / Galeri</span>
                    </button>
                  </div>
                </div>
              )}

              {/* PHOTO COLLECTION TRAY: Kumpulan foto yang telah diambil */}
              {selectedFiles.length > 0 && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)] px-1">
                    <span>
                      Kumpulan Foto &amp; Berkas ({selectedFiles.length}/{MAX_BATCH_FILES})
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      disabled={isProcessing}
                      className="text-[var(--status-alpa-fg)] hover:underline cursor-pointer"
                    >
                      Hapus Semua
                    </button>
                  </div>

                  {/* Thumbnail Collection Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                    {selectedFiles.map((file, idx) => {
                      const isPdf =
                        file.type === "application/pdf" ||
                        file.name.toLowerCase().endsWith(".pdf");
                      const preview = filePreviews.get(file);
                      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

                      return (
                        <div
                          key={`${file.name}-${idx}`}
                          className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs flex flex-col group"
                        >
                          <div className="relative aspect-4/3 bg-[var(--canvas-subtle)] flex items-center justify-center overflow-hidden">
                            {preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={preview}
                                alt={`Foto ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center p-2 text-center">
                                {isPdf ? (
                                  <FileText className="w-8 h-8 text-red-500 mb-1" />
                                ) : (
                                  <ImageIcon className="w-8 h-8 text-blue-500 mb-1" />
                                )}
                                <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase">
                                  {isPdf ? "PDF" : "Foto"}
                                </span>
                              </div>
                            )}

                            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold">
                              #{idx + 1}
                            </span>

                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleRemoveFile(idx)}
                              className="touch-target absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white shadow-xs transition-colors"
                              aria-label={`Hapus foto ${idx + 1}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="p-2 min-w-0">
                            <p className="text-xs font-semibold text-[var(--ink)] truncate">
                              {file.name}
                            </p>
                            <p className="text-[10px] text-[var(--ink-muted)]">
                              {sizeMb} MB • {isPdf ? "PDF" : "Foto"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Multi-Shot Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isProcessing || selectedFiles.length >= MAX_BATCH_FILES}
                      onClick={() => multiCameraInputRef.current?.click()}
                      className="touch-target min-h-[48px] px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-xs font-bold text-[var(--ink)] shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                    >
                      <Camera className="w-4 h-4 text-[var(--primary)]" />
                      <span>+ Jepret Foto Lagi</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing || selectedFiles.length >= MAX_BATCH_FILES}
                      onClick={() => multiFileInputRef.current?.click()}
                      className="touch-target min-h-[48px] px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-xs font-bold text-[var(--ink)] shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                    >
                      <Files className="w-4 h-4 text-[var(--primary)]" />
                      <span>+ Tambah Berkas</span>
                    </button>
                  </div>

                  {/* Prominent Submit Green Checkmark Button */}
                  <button
                    type="button"
                    onClick={handleStartScan}
                    disabled={isProcessing || selectedFiles.length === 0}
                    className="touch-target w-full min-h-[52px] px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 mt-2"
                    aria-label={`Proses dan pindai ${selectedFiles.length} berkas`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Memproses ({progressPercent}%)...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5 stroke-[2.5]" />
                        <span>✓ Proses &amp; Pindai ({selectedFiles.length} Berkas)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW MODE 2: REVIEW DRAWER (When < 85% or Ambiguous) */}
          {/* ========================================================= */}
          {viewMode === "review" && (
            <div className="space-y-4">
              {/* Review Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--ink)]">
                    Ringkasan Hasil:
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)]">
                    Total {items.length} Surat
                  </span>
                  {needsReviewCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border border-[var(--status-warning-border)] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {needsReviewCount} Perlu Dicek
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = items.every((i) => i.isSelected);
                      setItems((prev) => prev.map((i) => ({ ...i, isSelected: !allSelected })));
                    }}
                    className="text-[var(--primary)] hover:underline font-semibold"
                  >
                    {items.every((i) => i.isSelected) ? "Batalkan Semua" : "Pilih Semua"}
                  </button>
                </div>
              </div>

              {/* Review Items Card List */}
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const confidencePct = Math.round(item.matchConfidence * 100);
                  const isHighConfidence = item.matchConfidence >= 0.85 && item.studentId !== null;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        item.isSelected
                          ? item.needsReview
                            ? "bg-[var(--surface)] border-[var(--status-warning-border)] shadow-xs"
                            : "bg-[var(--surface)] border-[var(--border)] shadow-xs"
                          : "bg-[var(--canvas-subtle)]/40 border-[var(--border)] opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox toggle */}
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={item.isSelected}
                            onChange={() => handleToggleItemSelection(idx)}
                            className="touch-target w-5 h-5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                            aria-label={`Pilih surat ${item.studentName || `#${idx + 1}`}`}
                          />
                        </div>

                        {/* Thumbnail image with lightbox click */}
                        <div
                          onClick={() => {
                            if (item.previewUrl) setActiveLightboxUrl(item.previewUrl);
                          }}
                          className="relative w-20 h-24 rounded-xl overflow-hidden bg-black/10 border border-[var(--border)] shrink-0 cursor-pointer group"
                          title="Klik untuk memperbesar pratinjau"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.previewUrl}
                            alt={`Surat ${item.studentName || idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <ZoomIn className="w-5 h-5" />
                          </div>
                        </div>

                        {/* Form Inputs for Item */}
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Badges row */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Action Type Badge */}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                item.actionType === "update"
                                  ? "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)]"
                                  : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
                              }`}
                            >
                              {item.actionType === "update"
                                ? `Update Catatan ${item.existingRecordId ? `#${item.existingRecordId}` : ""}`
                                : "Catatan Baru"}
                            </span>

                            {/* Confidence Badge */}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isHighConfidence
                                  ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
                                  : "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]"
                              }`}
                            >
                              {isHighConfidence
                                ? `Keyakinan ${confidencePct}%`
                                : `Perlu Dicek (${confidencePct}%)`}
                            </span>

                            {item.candidateName && !item.studentId && (
                              <span className="text-[11px] text-[var(--ink-muted)] truncate">
                                Terdeteksi: &quot;{item.candidateName}&quot;
                              </span>
                            )}
                          </div>

                          {/* Student Selector */}
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                              Nama Siswa <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={item.studentId || 0}
                              onChange={(e) =>
                                handleItemFieldChange(idx, "studentId", parseInt(e.target.value, 10) || 0)
                              }
                              className={`touch-target min-h-[48px] w-full px-3 py-2 rounded-xl border bg-[var(--surface)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
                                !item.studentId
                                  ? "border-[var(--status-alpa-border)] bg-[var(--status-alpa-bg)]/20"
                                  : "border-[var(--border)]"
                              }`}
                            >
                              <option value={0}>-- Pilih Siswa Kelas --</option>
                              {studentsList.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name} {st.nis ? `(${st.nis})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Status Pill Toggle & Dates Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Status Pills */}
                            <div>
                              <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                                Status Ketidakhadiran
                              </label>
                              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                                <button
                                  type="button"
                                  onClick={() => handleItemFieldChange(idx, "status", "Izin")}
                                  className={`touch-target min-h-[40px] px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                                    item.status === "Izin"
                                      ? "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border border-[var(--status-izin-border)] shadow-xs"
                                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                  }`}
                                >
                                  Izin
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleItemFieldChange(idx, "status", "Sakit")}
                                  className={`touch-target min-h-[40px] px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                                    item.status === "Sakit"
                                      ? "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border border-[var(--status-sakit-border)] shadow-xs"
                                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                                  }`}
                                >
                                  Sakit
                                </button>
                              </div>
                            </div>

                            {/* Start Date */}
                            <div>
                              <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                                Tanggal Mulai <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="date"
                                value={item.startDate}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, "startDate", e.target.value)
                                }
                                className="touch-target min-h-[48px] w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                              />
                            </div>
                          </div>

                          {/* Multi-day date range toggle */}
                          <div className="space-y-2">
                            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--ink-muted)]">
                              <input
                                type="checkbox"
                                checked={item.isMultiDay}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  handleItemFieldChange(idx, "isMultiDay", checked);
                                  if (!checked) {
                                    handleItemFieldChange(idx, "endDate", null);
                                  } else if (!item.endDate) {
                                    handleItemFieldChange(idx, "endDate", item.startDate);
                                  }
                                }}
                                className="touch-target w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                              />
                              <span>Rentang Beberapa Hari (Multi-Day)</span>
                            </label>

                            {item.isMultiDay && (
                              <div>
                                <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                                  Tanggal Selesai
                                </label>
                                <input
                                  type="date"
                                  value={item.endDate || item.startDate}
                                  onChange={(e) =>
                                    handleItemFieldChange(idx, "endDate", e.target.value)
                                  }
                                  className="touch-target min-h-[48px] w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                />
                              </div>
                            )}
                          </div>

                          {/* Description */}
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                              Alasan / Keterangan
                            </label>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) =>
                                handleItemFieldChange(idx, "description", e.target.value)
                              }
                              placeholder="Contoh: Sakit demam berdarah / Acara keluarga"
                              className="touch-target min-h-[44px] w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                            />
                          </div>

                          {/* Delete Item from review */}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleRemoveReviewItem(idx)}
                              className="text-xs text-[var(--status-alpa-fg)] hover:underline inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus dari antrean</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface)] shrink-0 gap-3">
          {viewMode === "picker" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="touch-target min-h-[48px] px-4 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--canvas-subtle)] text-xs sm:text-sm font-bold text-[var(--ink)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleStartScan}
                disabled={isProcessing || selectedFiles.length === 0}
                className="touch-target min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-xs disabled:opacity-40 flex items-center gap-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses ({progressPercent}%)...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Mulai Pindai ({selectedFiles.length} Berkas)</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setViewMode("picker")}
                disabled={isSubmittingSync}
                className="touch-target min-h-[48px] px-4 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--canvas-subtle)] text-xs sm:text-sm font-bold text-[var(--ink)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                Kembali ke Pemindai
              </button>

              <button
                type="button"
                onClick={handleConfirmSync}
                disabled={isSubmittingSync || selectedCount === 0}
                className="touch-target min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold text-xs sm:text-sm shadow-xs disabled:opacity-40 flex items-center gap-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                {isSubmittingSync ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyinkronkan Presensi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan & Sinkronkan ({selectedCount} Surat)</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Lightbox Zoom Pop-Up Overlay */}
        {activeLightboxUrl && (
          <div
            onClick={() => setActiveLightboxUrl(null)}
            className="fixed inset-0 z-60 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl max-h-[90vh] bg-[var(--surface)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
                <span className="text-xs font-bold text-[var(--ink)]">
                  Pratinjau Lembar Surat
                </span>
                <button
                  type="button"
                  onClick={() => setActiveLightboxUrl(null)}
                  className="touch-target p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                  aria-label="Tutup pratinjau"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-2 overflow-auto max-h-[80vh] flex items-center justify-center bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeLightboxUrl}
                  alt="Dokumen Surat Zoom"
                  className="max-w-full max-h-[75vh] object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
