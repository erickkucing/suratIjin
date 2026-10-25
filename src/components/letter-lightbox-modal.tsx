"use client";

import { useEffect, useState, useRef } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Download, FileText } from "lucide-react";

interface LetterLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string | null;
  studentName: string;
  attendanceDate: string;
  status: string;
}

export function LetterLightboxModal({
  isOpen,
  onClose,
  filePath,
  studentName,
  attendanceDate,
  status,
}: LetterLightboxModalProps) {
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      setZoom(1);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !filePath) return null;

  const fileUrl = `/api/files/${filePath}`;
  const isPdf = filePath.toLowerCase().endsWith(".pdf");

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Surat Keterangan ${studentName}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] bg-[var(--surface)] text-[var(--ink)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--canvas-subtle)]">
          <div>
            <h2 className="text-base sm:text-lg font-bold font-heading text-[var(--ink)]">
              Surat Izin: {studentName}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--ink-muted)]">
              Tanggal: {attendanceDate} | Status: <span className="font-semibold">{status}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isPdf && (
              <div className="hidden sm:flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="touch-target p-1.5 hover:bg-[var(--canvas-subtle)] rounded text-[var(--ink-muted)]"
                  title="Perbesar"
                  aria-label="Perbesar gambar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="touch-target p-1.5 hover:bg-[var(--canvas-subtle)] rounded text-[var(--ink-muted)]"
                  title="Perkecil"
                  aria-label="Perkecil gambar"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  className="touch-target p-1.5 hover:bg-[var(--canvas-subtle)] rounded text-[var(--ink-muted)]"
                  title="Reset Ukuran"
                  aria-label="Reset ukuran gambar"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}

            <a
              href={fileUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)]"
              title="Unduh File"
              aria-label="Unduh file surat"
            >
              <Download className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              aria-label="Tutup pratinjau"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="relative flex-1 overflow-auto p-4 flex items-center justify-center bg-black/5 dark:bg-black/40 min-h-[300px]">
          {isPdf ? (
            <div className="w-full h-[65vh]">
              <object
                data={fileUrl}
                type="application/pdf"
                className="w-full h-full rounded-lg border border-[var(--border)]"
              >
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <FileText className="w-12 h-12 text-[var(--ink-muted)] mb-3" />
                  <p className="text-sm font-semibold mb-2">Pratinjau PDF tidak didukung pada browser ini.</p>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary-hover)] transition-colors"
                  >
                    Buka File PDF
                  </a>
                </div>
              </object>
            </div>
          ) : (
            <div
              className="transition-transform duration-200 ease-out origin-center"
              style={{ transform: `scale(${zoom})` }}
            >
              <img
                src={fileUrl}
                alt={`Surat keterangan ketidakhadiran siswa ${studentName}`}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
