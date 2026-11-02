"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  RefreshCw,
  Eye,
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

export interface FileUploadState {
  id: string;
  file: File;
  previewUrl: string;
  status: "pending" | "compressing" | "uploading" | "done" | "error";
  progress: number;
  uploadedPath: string | null;
  tempFileId: string | null;
  errorMessage: string | null;
}

function uploadFileWithProgress(
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<{ filePath: string; tempFileId: string; mimeType?: string }> {
  return new Promise((resolve, reject) => {
    if (
      typeof XMLHttpRequest !== "undefined" &&
      typeof window !== "undefined" &&
      process.env.NODE_ENV !== "test"
    ) {
      try {
        const xhr = new XMLHttpRequest();
        if (xhr.upload) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          };
        }
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && data.success) {
              resolve(data);
            } else {
              reject(new Error(data.error || `Upload gagal (${xhr.status})`));
            }
          } catch {
            reject(new Error(`Respon server tidak valid (${xhr.status})`));
          }
        };
        xhr.onerror = () => {
          fetch("/api/upload", {
            method: "POST",
            body: formData,
          })
            .then(async (res) => {
              const data = await res.json().catch(() => null);
              if (res.ok && data?.success) {
                onProgress(100);
                resolve(data);
              } else {
                reject(new Error(data?.error || "Upload gagal"));
              }
            })
            .catch((err) => reject(err));
        };
        xhr.open("POST", "/api/upload");
        xhr.send(formData);
        return;
      } catch {
        // Fallback to fetch
      }
    }

    fetch("/api/upload", {
      method: "POST",
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          onProgress(100);
          resolve(data);
        } else {
          reject(new Error(data?.error || "Upload gagal"));
        }
      })
      .catch((err) => reject(err));
  });
}

export interface BatchLetterScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  classNameTitle?: string;
  studentsList: Student[];
  onSuccess: (result?: { updatedCount: number; createdCount: number }) => void;
  onShowToast: (message: string, type: "success" | "error" | "info") => void;
  aiEnabled?: boolean;
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
  aiEnabled = false,
}: BatchLetterScannerModalProps) {
  // Navigation & View Mode (2 Tab Underline)
  const [activeScannerTab, setActiveScannerTab] = useState<"picker" | "results">("picker");
  const [viewMode, setViewMode] = useState<"picker" | "review">("picker");

  // Multi-File per-file upload state
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const fileStatesRef = useRef<FileUploadState[]>([]);
  const uploadPromises = useRef<Map<string, Promise<{ filePath: string; tempFileId: string } | null>>>(new Map());
  const hasSyncedSuccessfully = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Review Drawer state
  const [items, setItems] = useState<EditableBatchLetterItem[]>([]);
  const [activeLightbox, setActiveLightbox] = useState<{
    url: string;
    title: string;
  } | null>(null);

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

  // Auto-cleanup helper for uncommitted temp uploads
  const cleanupUploadedFiles = useCallback(async () => {
    if (hasSyncedSuccessfully.current) return;
    const currentFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : fileStates;
    const pathsToClean = currentFiles
      .filter((fs) => fs.uploadedPath)
      .map((fs) => fs.uploadedPath!);

    if (pathsToClean.length > 0) {
      try {
        await fetch("/api/upload/cleanup", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePaths: pathsToClean }),
          keepalive: true,
        });
      } catch {
        // Fallback to server background cleanup
      }
    }
  }, [fileStates]);

  const handleCloseModal = useCallback(() => {
    if (isProcessing || isSubmittingSync) return;
    cleanupUploadedFiles();
    onClose();
  }, [isProcessing, isSubmittingSync, cleanupUploadedFiles, onClose]);

  // Mobile Bottom Sheet Gesture Integration
  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose: () => {
      handleCloseModal();
    },
    isExpanded,
    onExpand: () => setIsExpanded(true),
    onCollapse: () => setIsExpanded(false),
  });

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setActiveScannerTab("picker");
      setViewMode("picker");
      hasSyncedSuccessfully.current = false;
      uploadPromises.current.clear();
      fileStatesRef.current = [];
      fileStates.forEach((fs) => {
        if (fs.previewUrl) {
          try {
            URL.revokeObjectURL(fs.previewUrl);
          } catch {}
        }
      });
      setFileStates([]);
      setItems([]);
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressStage("idle");
      setProgressDetail("");
      setElapsedSeconds(0);
      setIsSubmittingSync(false);
      setErrorMessage(null);
      setIsExpanded(false);
      setActiveLightbox(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-expand modal to full height when entering review mode for comfortable review
  useEffect(() => {
    if (viewMode === "review") {
      setIsExpanded(true);
    }
  }, [viewMode]);

  // Trigger cleanup when isOpen turns from true to false externally
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (!isOpen && prevIsOpenRef.current) {
      cleanupUploadedFiles();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, cleanupUploadedFiles]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (!hasSyncedSuccessfully.current) {
        const currentFiles = fileStatesRef.current;
        const pathsToClean = currentFiles
          .filter((fs) => fs.uploadedPath)
          .map((fs) => fs.uploadedPath!);
        if (pathsToClean.length > 0) {
          fetch("/api/upload/cleanup", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePaths: pathsToClean }),
            keepalive: true,
          }).catch(() => {});
        }
      }
      const filesToRevoke = fileStatesRef.current;
      filesToRevoke.forEach((fs) => {
        if (fs.previewUrl) {
          try {
            URL.revokeObjectURL(fs.previewUrl);
          } catch {}
        }
      });
    };
  }, []);

  // Browser navigation / tab closing cleanup via sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hasSyncedSuccessfully.current) {
        const currentFiles = fileStatesRef.current;
        const pathsToClean = currentFiles
          .filter((fs) => fs.uploadedPath)
          .map((fs) => fs.uploadedPath!);
        if (pathsToClean.length > 0) {
          const payload = JSON.stringify({ filePaths: pathsToClean });
          if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon(
              "/api/upload/cleanup",
              new Blob([payload], { type: "application/json" })
            );
          } else {
            fetch("/api/upload/cleanup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            }).catch(() => {});
          }
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, []);

  // Keyboard navigation (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeLightbox) {
          setActiveLightbox(null);
          return;
        }
        handleCloseModal();
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
  }, [isOpen, activeLightbox, handleCloseModal]);

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

  // Auto-Upload worker function per-file
  const startAutoUpload = async (
    fileStateId: string,
    file: File
  ): Promise<{ filePath: string; tempFileId: string } | null> => {
    setFileStates((prev) => {
      const updated = prev.map((fs) =>
        fs.id === fileStateId ? { ...fs, status: "compressing" as const, progress: 5 } : fs
      );
      fileStatesRef.current = updated;
      return updated;
    });

    try {
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      let fileToUpload: File = file;

      if (!isPdf) {
        const compResult = await processFileBeforeUpload(
          file,
          (filePct) => {
            setFileStates((prev) => {
              const updated = prev.map((fs) => {
                if (fs.id !== fileStateId) return fs;
                const overall = Math.min(40, Math.round(5 + (filePct / 100) * 35));
                return { ...fs, progress: overall };
              });
              fileStatesRef.current = updated;
              return updated;
            });
          },
          { maxWidthOrHeight: 1600, quality: 0.82 }
        );
        fileToUpload = compResult.file;
      }

      setFileStates((prev) => {
        const updated = prev.map((fs) =>
          fs.id === fileStateId ? { ...fs, status: "uploading" as const, progress: isPdf ? 5 : 40 } : fs
        );
        fileStatesRef.current = updated;
        return updated;
      });

      const formData = new FormData();
      formData.append("classId", String(classId));
      formData.append("mode", "letter_temp");
      formData.append("file", fileToUpload);

      const uploadRes = await uploadFileWithProgress(formData, (uploadPct) => {
        setFileStates((prev) => {
          const updated = prev.map((fs) => {
            if (fs.id !== fileStateId) return fs;
            const overall = isPdf
              ? Math.min(99, Math.round(5 + (uploadPct / 100) * 94))
              : Math.min(99, Math.round(40 + (uploadPct / 100) * 59));
            return { ...fs, progress: overall };
          });
          fileStatesRef.current = updated;
          return updated;
        });
      });

      setFileStates((prev) => {
        const updated = prev.map((fs) =>
          fs.id === fileStateId
            ? {
                ...fs,
                status: "done" as const,
                progress: 100,
                uploadedPath: uploadRes.filePath,
                tempFileId: uploadRes.tempFileId,
                errorMessage: null,
              }
            : fs
        );
        fileStatesRef.current = updated;
        return updated;
      });

      return { filePath: uploadRes.filePath, tempFileId: uploadRes.tempFileId };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Upload gagal";
      setFileStates((prev) => {
        const updated = prev.map((fs) =>
          fs.id === fileStateId
            ? { ...fs, status: "error" as const, errorMessage: errorMsg }
            : fs
        );
        fileStatesRef.current = updated;
        return updated;
      });
      return null;
    }
  };

  // Multi-File handlers
  const handleAddFiles = (newFiles: FileList | File[]) => {
    setErrorMessage(null);
    const filesArray = Array.from(newFiles);
    const validToAdd: Array<{ id: string; file: File; previewUrl: string }> = [];
    const errors: string[] = [];

    const currentFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : fileStates;

    for (const f of filesArray) {
      const err = validateFile(f);
      if (err) {
        errors.push(err);
      } else {
        const alreadyExists = currentFiles.some(
          (existing) => existing.file.name === f.name && existing.file.size === f.size
        );
        if (!alreadyExists) {
          let previewUrl = "";
          try {
            previewUrl = URL.createObjectURL(f);
          } catch {
            previewUrl = "";
          }
          const id = `f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          validToAdd.push({ id, file: f, previewUrl });
        }
      }
    }

    if (errors.length > 0) {
      setErrorMessage(errors[0]);
    }

    if (validToAdd.length === 0) return;

    const currentCount = currentFiles.length;
    const availableSlots = MAX_BATCH_FILES - currentCount;
    if (availableSlots <= 0) {
      setErrorMessage(`Maksimal ${MAX_BATCH_FILES} berkas per pemindaian batch.`);
      return;
    }

    const allowedToAdd = validToAdd.slice(0, availableSlots);
    if (validToAdd.length > availableSlots) {
      setErrorMessage(`Maksimal ${MAX_BATCH_FILES} berkas per pemindaian batch. Beberapa berkas dipotong.`);
    }

    const newStates: FileUploadState[] = allowedToAdd.map((item) => ({
      id: item.id,
      file: item.file,
      previewUrl: item.previewUrl,
      status: "pending",
      progress: 0,
      uploadedPath: null,
      tempFileId: null,
      errorMessage: null,
    }));

    setFileStates((prev) => {
      const updated = [...prev, ...newStates];
      fileStatesRef.current = updated;
      return updated;
    });

    allowedToAdd.forEach((item) => {
      const p = startAutoUpload(item.id, item.file);
      uploadPromises.current.set(item.id, p);
    });
  };

  const handleRetryUpload = (id: string) => {
    const currentFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : fileStates;
    const target = currentFiles.find((fs) => fs.id === id);
    if (!target) return;
    const p = startAutoUpload(id, target.file);
    uploadPromises.current.set(id, p);
  };

  const handleRemoveFile = async (id: string) => {
    uploadPromises.current.delete(id);
    const currentFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : fileStates;
    const target = currentFiles.find((fs) => fs.id === id);
    if (!target) return;

    if (target.previewUrl) {
      try {
        URL.revokeObjectURL(target.previewUrl);
      } catch {}
    }

    setFileStates((prev) => {
      const updated = prev.filter((fs) => fs.id !== id);
      fileStatesRef.current = updated;
      return updated;
    });

    if (target.uploadedPath && !hasSyncedSuccessfully.current) {
      try {
        await fetch("/api/upload/cleanup", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePaths: [target.uploadedPath] }),
        });
      } catch {}
    }
  };

  const handleRemoveAllFiles = async () => {
    uploadPromises.current.clear();
    const currentFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : fileStates;
    const pathsToClean = currentFiles
      .filter((fs) => fs.uploadedPath)
      .map((fs) => fs.uploadedPath!);

    currentFiles.forEach((fs) => {
      if (fs.previewUrl) {
        try {
          URL.revokeObjectURL(fs.previewUrl);
        } catch {}
      }
    });

    setFileStates([]);
    fileStatesRef.current = [];

    if (pathsToClean.length > 0 && !hasSyncedSuccessfully.current) {
      try {
        await fetch("/api/upload/cleanup", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePaths: pathsToClean }),
        });
      } catch {}
    }
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
  // CORE SCANNING & HYBRID AUTO-APPLY ENGINE (SSE STREAM CONSUMER)
  // -------------------------------------------------------------
  const handleStartScan = async () => {
    setErrorMessage(null);

    const currentFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : fileStates;
    if (currentFiles.length === 0) {
      setErrorMessage("Pilih atau ambil minimal 1 foto/berkas surat sebelum memulai pemindaian.");
      return;
    }

    const anyUploading = currentFiles.some(
      (fs) => fs.status === "pending" || fs.status === "compressing" || fs.status === "uploading"
    );

    setIsProcessing(true);
    setElapsedSeconds(0);

    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startTime) / 1000));
    }, 500);

    try {
      if (anyUploading || uploadPromises.current.size > 0) {
        setProgressStage("uploading");
        setProgressDetail("Menyelesaikan unggah berkas ke server...");
        setProgressPercent(30);
        await Promise.allSettled(Array.from(uploadPromises.current.values()));
      }

      setProgressPercent(0);
      setProgressStage("processing_ocr");
      setProgressDetail("Menghubungkan ke pemindai OCR...");

      const latestFiles = fileStatesRef.current.length > 0 ? fileStatesRef.current : currentFiles;
      const doneStates = latestFiles.filter((fs) => fs.status === "done" && fs.uploadedPath);
      let ocrResultData: any = null;

      if (doneStates.length === latestFiles.length && doneStates.length > 0) {
        const filePaths = doneStates.map((fs) => fs.uploadedPath!);
        const res = await fetch("/api/ocr/letter/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            classId,
            filePaths,
            mode: "from_paths",
          }),
        });

        const contentType = res.headers?.get?.("content-type") || "";

        if (res.body && typeof res.body.getReader === "function" && contentType.includes("text/event-stream")) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          const collectedItems: BatchLetterItem[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() || "";

            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;

                let event: any = null;
                try {
                  event = JSON.parse(raw);
                } catch {
                  continue;
                }

                if (event.type === "progress") {
                  const stageFactor = event.stage === "ai_refine" ? 0.7 : 0.3;
                  const pct = Math.min(
                    95,
                    Math.round(((event.fileIndex + stageFactor) / event.total) * 100)
                  );
                  setProgressPercent(pct);
                  setProgressDetail(event.detail || "Memproses OCR...");
                } else if (event.type === "file_done") {
                  collectedItems.push(event.item);
                  const pct = Math.min(
                    95,
                    Math.round(((event.fileIndex + 1) / event.total) * 100)
                  );
                  setProgressPercent(pct);
                  setProgressDetail(`Berkas ${event.fileIndex + 1}/${event.total} selesai.`);
                } else if (event.type === "complete") {
                  ocrResultData = {
                    success: event.success ?? true,
                    mode: "multi_file",
                    totalDetected: event.totalDetected ?? event.items?.length ?? collectedItems.length,
                    allHighConfidence: event.allHighConfidence ?? false,
                    items: event.items || collectedItems,
                    processingTimeSeconds: event.processingTimeSeconds ?? 0,
                  };
                  setProgressPercent(100);
                  setProgressDetail("Pemindaian selesai!");
                } else if (event.type === "error") {
                  throw new Error(event.error || "Gagal memproses berkas OCR.");
                }
              }
            }
          }

          if (!ocrResultData) {
            if (collectedItems.length > 0) {
              const allHigh = collectedItems.every(
                (i) => i.studentId !== null && Boolean(i.studentName) && Boolean(i.startDate) && i.matchConfidence >= 0.85
              );
              ocrResultData = {
                success: true,
                mode: "multi_file",
                totalDetected: collectedItems.length,
                allHighConfidence: allHigh,
                items: collectedItems,
                processingTimeSeconds: 0,
              };
            } else {
              throw new Error("Tidak ada data respon dari stream pemindaian OCR.");
            }
          }
        } else {
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || "Gagal memproses pemindaian batch surat.");
          }
          ocrResultData = data;
          setProgressPercent(100);
        }
      } else {
        const formData = new FormData();
        formData.append("classId", String(classId));
        formData.append("mode", "multi_file");
        latestFiles.forEach((fs) => formData.append("files", fs.file));

        const res = await fetch("/api/ocr/letter/batch", {
          method: "POST",
          body: formData,
        });

        const contentType = res.headers?.get?.("content-type") || "";
        if (res.body && typeof res.body.getReader === "function" && contentType.includes("text/event-stream")) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          const collectedItems: BatchLetterItem[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() || "";

            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                  const event = JSON.parse(raw);
                  if (event.type === "complete") {
                    ocrResultData = event;
                  } else if (event.type === "file_done") {
                    collectedItems.push(event.item);
                  }
                } catch {}
              }
            }
          }

          if (!ocrResultData && collectedItems.length > 0) {
            ocrResultData = {
              success: true,
              mode: "multi_file",
              totalDetected: collectedItems.length,
              allHighConfidence: false,
              items: collectedItems,
              processingTimeSeconds: 0,
            };
          }
        } else {
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || "Gagal memproses pemindaian batch surat.");
          }
          ocrResultData = data;
          setProgressPercent(100);
        }
      }

      if (!ocrResultData || !ocrResultData.items || ocrResultData.items.length === 0) {
        setIsProcessing(false);
        setProgressStage("idle");
        setErrorMessage(
          "Tidak dapat mengekstrak data dari berkas yang diunggah. Pastikan foto atau dokumen terbaca jelas."
        );
        return;
      }

      // Hybrid auto-apply logic
      if (ocrResultData.allHighConfidence) {
        setProgressStage("auto_applying");
        setProgressDetail("Semua surat valid (≥85%). Menyimpan otomatis ke presensi...");

        const syncPayload = {
          classId,
          items: ocrResultData.items.map((item: BatchLetterItem) => ({
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

          clearInterval(timerInterval);
          hasSyncedSuccessfully.current = true;
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
          setErrorMessage(
            `Sinkronisasi otomatis gagal: ${
              syncErr instanceof Error ? syncErr.message : "Kesalahan server"
            }. Silakan tinjau dan klik Simpan & Sinkronkan manual.`
          );
          const reviewItems: EditableBatchLetterItem[] = ocrResultData.items.map(
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
          setActiveScannerTab("results");
          return;
        }
      }

      // Conditional Review Drawer
      const reviewItems: EditableBatchLetterItem[] = ocrResultData.items.map(
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
      setActiveScannerTab("results");
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

      hasSyncedSuccessfully.current = true;
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing && !isSubmittingSync) {
          onClose();
        }
      }}
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

        {/* Modal Header (Persis Kelola Daftar Siswa) */}
        <div
          data-sheet-header
          className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)] shrink-0 touch-none select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="batch-scanner-title"
                className="text-base sm:text-lg font-bold font-heading text-[var(--ink)] truncate"
              >
                {viewMode === "picker"
                  ? `Pindai Surat Izin: ${classNameTitle}`
                  : `Tinjau Hasil Pemindaian (${items.length} Surat)`}
              </h2>
              <p className="text-xs text-[var(--ink-muted)] truncate">
                {viewMode === "picker"
                  ? fileStates.length > 0
                    ? `${fileStates.length} berkas foto terpilih`
                    : "Kamera Multi-Foto & Pemindaian OCR"
                  : `${selectedCount} surat terpilih untuk disinkronkan`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            disabled={isProcessing || isSubmittingSync}
            className="touch-target p-2 rounded-xl text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] active:scale-95 transition-all cursor-pointer disabled:opacity-40 shrink-0 ml-2"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (Persis Kelola Daftar Siswa) */}
        <div className="flex border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 pt-2.5 sm:pt-3 gap-3 sm:gap-4 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              setViewMode("picker");
              setActiveScannerTab("picker");
            }}
            disabled={isProcessing || isSubmittingSync}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer ${
              activeScannerTab === "picker" && viewMode === "picker"
                ? "border-[var(--primary)] text-[var(--primary)] font-bold"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Ambil Foto &amp; Berkas</span>
            {fileStates.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[var(--primary)] text-white text-[10px] flex items-center justify-center font-bold">
                {fileStates.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (items.length > 0) {
                setViewMode("review");
                setActiveScannerTab("results");
              }
            }}
            disabled={items.length === 0 || isProcessing || isSubmittingSync}
            className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer disabled:opacity-40 ${
              activeScannerTab === "results" || viewMode === "review"
                ? "border-[var(--primary)] text-[var(--primary)] font-bold"
                : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Hasil Pindai {items.length > 0 ? `(${items.length})` : ""}</span>
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
                  {progressStage === "processing_ocr" && "Pemindaian OCR & AI Vision"}
                  {progressStage === "auto_applying" && "Auto-Apply: Sinkronisasi Presensi..."}
                  {progressStage === "compressing" && "Mengompresi Berkas..."}
                  {progressStage === "uploading" && "Mengunggah Berkas..."}
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

          {/* ========================================================= */}
          {/* TAB 1: AMBIL FOTO & BERKAS (Kamera Native HP & Galeri)   */}
          {/* ========================================================= */}
          {activeScannerTab === "picker" && viewMode === "picker" && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-5 sm:p-6 text-center transition-colors ${
                  isDraggingOver
                    ? "border-[var(--primary)] bg-[var(--primary-light)]/40"
                    : "border-[var(--border)] bg-[var(--canvas-subtle)]"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-[var(--surface)] text-[var(--primary)] border border-[var(--border)] flex items-center justify-center mx-auto mb-2.5 shadow-xs">
                  <Camera className="w-6 h-6" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                  Unggah atau Ambil Foto Surat Izin
                </h3>
                <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-sm mx-auto leading-relaxed">
                  Ambil foto langsung menggunakan kamera HP, atau pilih berkas foto / dokumen PDF dari galeri.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 mt-4">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => multiCameraInputRef.current?.click()}
                    className="touch-target w-full sm:w-auto min-h-[50px] px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] active:scale-98 text-xs sm:text-sm font-bold shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Camera className="w-4 h-4 text-white" />
                    <span>Jepret Kamera</span>
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => multiFileInputRef.current?.click()}
                    className="touch-target w-full sm:w-auto min-h-[50px] px-5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-xs sm:text-sm font-bold text-[var(--ink)] shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Files className="w-4 h-4 text-[var(--primary)]" />
                    <span>Pilih dari Berkas / Galeri</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SHARED PHOTO COLLECTION TRAY (Muncul saat foto dipilih)   */}
          {/* ========================================================= */}
          {viewMode === "picker" && fileStates.length > 0 && (
            <div className="space-y-3.5 pt-1 border-t border-[var(--border)]">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--ink)] px-1">
                <span>
                  Kumpulan Foto &amp; Berkas ({fileStates.length}/{MAX_BATCH_FILES})
                </span>
                <button
                  type="button"
                  onClick={handleRemoveAllFiles}
                  disabled={isProcessing}
                  className="text-[var(--status-alpa-fg)] hover:underline cursor-pointer"
                >
                  Hapus Semua
                </button>
              </div>

              {/* Thumbnail Collection Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                {fileStates.map((fs, idx) => {
                  const isPdf =
                    fs.file.type === "application/pdf" ||
                    fs.file.name.toLowerCase().endsWith(".pdf");
                  const sizeMb = (fs.file.size / (1024 * 1024)).toFixed(2);

                  return (
                    <div
                      key={fs.id}
                      className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs flex flex-col group"
                    >
                      <div className="relative aspect-4/3 bg-[var(--canvas-subtle)] flex items-center justify-center overflow-hidden">
                        {fs.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fs.previewUrl}
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

                        {/* Circular Progress Ring Overlay per thumbnail */}
                        {(fs.status === "pending" || fs.status === "compressing" || fs.status === "uploading") && (
                          <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-white animate-in fade-in select-none">
                            <div className="relative w-12 h-12 flex items-center justify-center">
                              <svg className="w-12 h-12 -rotate-90 transform" viewBox="0 0 36 36">
                                <circle
                                  cx="18"
                                  cy="18"
                                  r="15"
                                  fill="none"
                                  stroke="rgba(255, 255, 255, 0.25)"
                                  strokeWidth="3"
                                />
                                <circle
                                  cx="18"
                                  cy="18"
                                  r="15"
                                  fill="none"
                                  stroke="var(--primary)"
                                  strokeWidth="3"
                                  strokeDasharray="94.25"
                                  strokeDashoffset={94.25 - (fs.progress / 100) * 94.25}
                                  strokeLinecap="round"
                                  className="transition-all duration-200"
                                />
                              </svg>
                              <span className="absolute text-[11px] font-bold font-mono text-white">
                                {fs.progress}%
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold mt-1 text-center text-white/95 truncate max-w-[95%]">
                              {fs.status === "pending"
                                ? "Menyiapkan..."
                                : fs.status === "compressing"
                                ? "Mengompresi..."
                                : `Mengunggah... ${fs.progress}%`}
                            </span>
                          </div>
                        )}

                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold z-20">
                          #{idx + 1}
                        </span>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleRemoveFile(fs.id)}
                          className="touch-target absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white shadow-xs transition-colors cursor-pointer z-20"
                          aria-label={`Hapus foto ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="p-2 min-w-0">
                        <p className="text-xs font-semibold text-[var(--ink)] truncate">
                          {fs.file.name}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-[var(--ink-muted)] mt-0.5">
                          <span>
                            {sizeMb} MB • {isPdf ? "PDF" : "Foto"}
                          </span>
                          {fs.status === "done" && (
                            <span className="text-[var(--status-success-fg)] font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 text-[var(--status-success-fg)]" /> Selesai ✓
                            </span>
                          )}
                          {fs.status === "error" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryUpload(fs.id);
                              }}
                              className="text-[var(--status-alpa-fg)] hover:underline font-bold text-[10px] flex items-center gap-0.5 cursor-pointer"
                              title={fs.errorMessage || "Gagal mengunggah. Klik untuk coba lagi."}
                            >
                              <RefreshCw className="w-2.5 h-2.5" /> Coba Lagi ↻
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Multi-Shot Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessing || fileStates.length >= MAX_BATCH_FILES}
                  onClick={() => multiCameraInputRef.current?.click()}
                  className="touch-target min-h-[48px] px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-xs font-bold text-[var(--ink)] shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                >
                  <Camera className="w-4 h-4 text-[var(--primary)]" />
                  <span>+ Jepret Foto Lagi</span>
                </button>
                <button
                  type="button"
                  disabled={isProcessing || fileStates.length >= MAX_BATCH_FILES}
                  onClick={() => multiFileInputRef.current?.click()}
                  className="touch-target min-h-[48px] px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-xs font-bold text-[var(--ink)] shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                >
                  <Files className="w-4 h-4 text-[var(--primary)]" />
                  <span>+ Tambah Berkas</span>
                </button>
              </div>

              {/* Prominent Submit Checkmark Button */}
              {(() => {
                const isAnyUploading = fileStates.some(
                  (fs) => fs.status === "pending" || fs.status === "compressing" || fs.status === "uploading"
                );
                const completedCount = fileStates.filter((fs) => fs.status === "done").length;
                return (
                  <button
                    type="button"
                    onClick={handleStartScan}
                    disabled={isProcessing || fileStates.length === 0}
                    className="touch-target w-full min-h-[52px] px-5 py-3 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-98 text-white font-bold text-sm sm:text-base shadow-lg shadow-[var(--primary)]/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 mt-2"
                    aria-label={`Proses dan pindai ${fileStates.length} berkas`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Memproses ({progressPercent}%)...</span>
                      </>
                    ) : isAnyUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Mengunggah Berkas ({completedCount}/{fileStates.length})...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5 stroke-[2.5]" />
                        <span>Proses &amp; Pindai ({fileStates.length} Berkas)</span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW MODE 2: REVIEW DRAWER (When < 85% or Ambiguous) */}
          {/* ========================================================= */}
          {viewMode === "review" && (
            <div className="space-y-4">
              {/* Review Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-3.5 rounded-2xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--ink)]">
                    Ringkasan:
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--surface)] text-[var(--ink)] border border-[var(--border)]">
                    {items.length} Surat
                  </span>
                  {needsReviewCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
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
                    className="text-[var(--primary)] hover:underline font-semibold cursor-pointer"
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
                  const isMatched = item.studentId !== null && item.studentId > 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 sm:p-5 rounded-2xl border transition-all space-y-3.5 w-full max-w-full overflow-hidden ${
                        item.isSelected
                          ? !isMatched
                            ? "bg-[var(--surface)] border-[var(--status-warning-border)] shadow-xs"
                            : "bg-[var(--surface)] border-[var(--border)] shadow-xs"
                          : "bg-[var(--canvas-subtle)]/40 border-[var(--border)] opacity-60"
                      }`}
                    >
                      {/* 1. Header Bar: Checkbox selection with accessible touch wrapper + Number + Action badge + Delete button */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border)] gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px] -my-2 py-2 select-none group">
                          <input
                            type="checkbox"
                            checked={item.isSelected}
                            onChange={() => handleToggleItemSelection(idx)}
                            className="w-5 h-5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer shrink-0 transition-transform active:scale-95"
                            aria-label={`Pilih surat ${item.studentName || `#${idx + 1}`}`}
                          />
                          <span className="text-xs sm:text-sm font-bold font-heading text-[var(--ink)]">
                            Surat #{idx + 1}
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              item.actionType === "update"
                                ? "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)]"
                                : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)]"
                            }`}
                          >
                            {item.actionType === "update"
                              ? `Update #${item.existingRecordId || ""}`
                              : "Catatan Baru"}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveReviewItem(idx)}
                            className="p-2 -mr-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--status-alpa-fg)] hover:bg-[var(--canvas-subtle)] transition-colors cursor-pointer"
                            aria-label={`Hapus surat #${idx + 1} dari antrean`}
                            title="Hapus dari antrean"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 2. Compact Preview Strip: Strictly Constrained 64x64px Thumbnail + OCR info + Lightbox trigger */}
                      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)] w-full overflow-hidden">
                        {/* Guaranteed Fixed-Size Thumbnail Container */}
                        <div
                          onClick={() => {
                            if (item.previewUrl) {
                              setActiveLightbox({
                                url: item.previewUrl,
                                title: `Surat #${idx + 1}${item.studentName ? ` • ${item.studentName}` : ""}`,
                              });
                            }
                          }}
                          className="relative w-16 h-16 min-w-[64px] min-h-[64px] max-w-[64px] max-h-[64px] rounded-xl overflow-hidden bg-black/10 border border-[var(--border)] shrink-0 cursor-pointer group shadow-2xs"
                          title="Klik untuk membuka pratinjau surat layar penuh"
                        >
                          {item.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.previewUrl}
                              alt={`Pratinjau Surat #${idx + 1}`}
                              width={64}
                              height={64}
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[var(--ink-muted)]">
                              <FileText className="w-6 h-6" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <ZoomIn className="w-4 h-4" />
                          </div>
                        </div>

                        {/* OCR Info & Clear Action Button */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                isHighConfidence
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                              }`}
                            >
                              {isHighConfidence ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <span>Cocok ({confidencePct}%)</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>Perlu Dicek ({confidencePct}%)</span>
                                </>
                              )}
                            </span>
                          </div>

                          {item.candidateName && (
                            <p className="text-[11px] text-[var(--ink-muted)] truncate">
                              {`Terdeteksi: "${item.candidateName}"`}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (item.previewUrl) {
                                setActiveLightbox({
                                  url: item.previewUrl,
                                  title: `Surat #${idx + 1}${item.studentName ? ` • ${item.studentName}` : ""}`,
                                });
                              }
                            }}
                            className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] transition-colors shadow-2xs active:scale-95 cursor-pointer mt-0.5"
                          >
                            <Eye className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                            <span>Lihat Dokumen</span>
                          </button>
                        </div>
                      </div>

                      {/* 3. Form Body - Full-Width on Mobile, clean spacing */}
                      <div className="space-y-3 pt-0.5">
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
                            className={`min-h-[46px] w-full px-3 py-2 rounded-xl border bg-[var(--surface)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${
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

                        {/* Status Pills Segmented Control (Full Width) */}
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1">
                            Status Ketidakhadiran
                          </label>
                          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                            <button
                              type="button"
                              onClick={() => handleItemFieldChange(idx, "status", "Izin")}
                              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                item.status === "Sakit"
                                  ? "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border border-[var(--status-sakit-border)] shadow-xs"
                                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                              }`}
                            >
                              Sakit
                            </button>
                          </div>
                        </div>

                        {/* Multi-day toggle switch (iOS style) */}
                        <label className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)] cursor-pointer select-none">
                          <div className="min-w-0 pr-2">
                            <span className="text-xs font-bold text-[var(--ink)] block">
                              Rentang Beberapa Hari (Multi-Day)
                            </span>
                            <span className="text-[10px] sm:text-[11px] text-[var(--ink-muted)] block">
                              Aktifkan jika surat izin berlaku lebih dari 1 hari
                            </span>
                          </div>
                          <div className="relative inline-flex items-center shrink-0">
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
                              className="sr-only peer"
                              aria-label="Rentang Beberapa Hari (Multi-Day)"
                            />
                            <div className="w-11 h-6 bg-[var(--border-strong)]/60 peer-checked:bg-[var(--primary)] rounded-full transition-colors duration-200 relative">
                              <div className="w-5 h-5 bg-white rounded-full shadow-md absolute top-0.5 left-0.5 transition-transform duration-200 peer-checked:translate-x-5" />
                            </div>
                          </div>
                        </label>

                        {/* Date input grid: Single full width, or 2 columns if Multi-day active */}
                        <div className={item.isMultiDay ? "grid grid-cols-2 gap-2.5" : "w-full"}>
                          <div className="min-w-0">
                            <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1 truncate">
                              Tanggal Mulai <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={item.startDate}
                              onChange={(e) =>
                                handleItemFieldChange(idx, "startDate", e.target.value)
                              }
                              className="w-full min-h-[46px] px-2.5 sm:px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] box-border [color-scheme:light_dark]"
                            />
                          </div>

                          {item.isMultiDay && (
                            <div className="min-w-0">
                              <label className="block text-[11px] font-bold text-[var(--ink-muted)] mb-1 truncate">
                                Tanggal Selesai <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="date"
                                value={item.endDate || item.startDate}
                                onChange={(e) =>
                                  handleItemFieldChange(idx, "endDate", e.target.value)
                                }
                                className="w-full min-h-[46px] px-2.5 sm:px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] box-border [color-scheme:light_dark]"
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
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs sm:text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] box-border"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Footer (Hanya pada mode review) */}
        {viewMode === "review" && (
          <div className="flex items-center justify-between px-4 sm:px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[var(--border)] bg-[var(--surface)] shrink-0 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setViewMode("picker");
                setActiveScannerTab("picker");
              }}
              disabled={isSubmittingSync}
              aria-label="Batal dan kembali ke pemindai"
              className="touch-target min-h-[50px] h-[50px] px-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-98 text-xs sm:text-sm font-bold text-[var(--ink)] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer shrink-0 flex items-center justify-center shadow-2xs"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleConfirmSync}
              disabled={isSubmittingSync || selectedCount === 0}
              aria-label={`Simpan & Sinkronkan (${selectedCount} Surat)`}
              className="touch-target flex-1 min-h-[50px] h-[50px] px-4 sm:px-5 rounded-2xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md shadow-[var(--primary)]/20 disabled:opacity-40 flex items-center justify-center gap-2 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] cursor-pointer whitespace-nowrap min-w-0"
            >
              {isSubmittingSync ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span className="truncate">Menyimpan Presensi...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
                  <span className="truncate">Simpan ({selectedCount} Surat)</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Lightbox Zoom Pop-Up Overlay */}
        {activeLightbox && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={activeLightbox.title}
            onClick={() => setActiveLightbox(null)}
            className="fixed inset-0 z-70 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-5 animate-in fade-in select-none"
          >
            {/* Lightbox Header Bar */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl flex items-center justify-between py-2 px-3 sm:px-4 rounded-xl bg-white/10 text-white backdrop-blur-md border border-white/15 shrink-0 z-10"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <FileText className="w-4 h-4 text-white/80 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold truncate">
                  {activeLightbox.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveLightbox(null)}
                className="touch-target p-2 -mr-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="Tutup pratinjau surat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Image Container */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex-1 w-full max-w-2xl flex items-center justify-center p-2 min-h-0 overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeLightbox.url}
                alt={activeLightbox.title}
                className="max-w-full max-h-[78vh] object-contain rounded-xl shadow-2xl transition-transform"
              />
            </div>

            {/* Lightbox Footer Instruction Hint */}
            <div className="text-[11px] text-white/60 text-center pb-1">
              Ketuk di luar gambar atau tombol silang untuk kembali
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
