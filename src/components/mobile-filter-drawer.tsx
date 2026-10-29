"use client";

import React, { useEffect } from "react";
import { Search, Calendar, FileDown, FileSpreadsheet, RotateCcw, Check } from "lucide-react";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

interface MobileFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  onStudentNameChange: (val: string) => void;
  dateStart: string;
  onDateStartChange: (val: string) => void;
  dateEnd: string;
  onDateEndChange: (val: string) => void;
  status: string;
  onStatusChange: (val: string) => void;
  letterStatus: string;
  onLetterStatusChange: (val: string) => void;
  onReset: () => void;
  activeFilterCount: number;
  onExportPdf: () => void;
  onExportExcel: () => void;
}

export function MobileFilterDrawer({
  isOpen,
  onClose,
  studentName,
  onStudentNameChange,
  dateStart,
  onDateStartChange,
  dateEnd,
  onDateEndChange,
  status,
  onStatusChange,
  letterStatus,
  onLetterStatusChange,
  onReset,
  activeFilterCount,
  onExportPdf,
  onExportExcel,
}: MobileFilterDrawerProps) {
  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
  });

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-filter-title"
      className="fixed inset-0 z-50 flex items-end justify-center pt-[env(safe-area-inset-top,1.5rem)] bg-black/60 backdrop-blur-xs sm:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className="card-paper w-full min-h-0 modal-bottom-sheet max-h-[68dvh] sm:max-h-[85vh] rounded-t-3xl border-t border-[var(--border)] overflow-y-auto flex flex-col shadow-2xl"
      >
        {/* Pull Handle */}
        <div data-drag-handle className="pt-3 pb-2 flex justify-center touch-none cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header */}
        <div data-sheet-header className="px-5 py-3 flex items-center justify-between border-b border-[var(--border)] touch-none select-none">
          <div className="flex items-center gap-2">
            <h3 id="mobile-filter-title" className="text-base font-bold font-heading text-[var(--ink)]">
              Filter &amp; Ekspor
            </h3>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[var(--primary)] text-white">
                {activeFilterCount}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 flex-1">
          {/* Search by Name */}
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Cari Nama Siswa
            </label>
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-[var(--ink-muted)] pointer-events-none" />
              <input
                type="text"
                value={studentName}
                onChange={(e) => onStudentNameChange(e.target.value)}
                placeholder="Ketik nama siswa..."
                className="w-full h-11 pl-9 pr-3 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Rentang Tanggal
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wider block mb-1">Dari</span>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => onDateStartChange(e.target.value)}
                  className="w-full h-10 px-2.5 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--ink-subtle)] uppercase tracking-wider block mb-1">Sampai</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => onDateEndChange(e.target.value)}
                  className="w-full h-10 px-2.5 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          {/* Attendance Status */}
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Status Kehadiran
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {["Semua", "Alpa", "Izin", "Sakit"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onStatusChange(st)}
                  className={`touch-target min-h-[44px] h-11 text-xs rounded-xl font-semibold border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
                    status === st
                      ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-xs"
                      : "bg-[var(--surface)] text-[var(--ink)] border-[var(--border)] hover:bg-[var(--canvas-subtle)]"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Letter Physical Proof Status */}
          <div>
            <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5">
              Status Berkas Surat
            </label>
            <select
              value={letterStatus}
              onChange={(e) => onLetterStatusChange(e.target.value)}
              className="w-full h-11 px-3 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            >
              <option value="Semua">Semua Surat</option>
              <option value="Sudah">Surat Sudah Lengkap</option>
              <option value="Belum">Surat Belum Ada</option>
              <option value="Belum_Izin_Sakit">Belum Ada (Khusus Izin &amp; Sakit)</option>
            </select>
          </div>

          {/* Export Reports Section */}
          <div className="pt-2 border-t border-[var(--border)]">
            <span className="block text-xs font-semibold text-[var(--ink-muted)] mb-2">
              Unduh Rekap Laporan
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onExportPdf();
                  onClose();
                }}
                className="touch-target flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-bold text-[var(--ink)] shadow-xs"
              >
                <FileDown className="w-4 h-4 text-[var(--primary)]" />
                <span>Unduh PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onExportExcel();
                  onClose();
                }}
                className="touch-target flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-bold text-[var(--ink)] shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-[var(--status-success-fg)]" />
                <span>Unduh Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--canvas-subtle)] flex items-center gap-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="touch-target flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--ink)] hover:bg-[var(--canvas)] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs font-bold shadow-xs hover:bg-[var(--primary-hover)] transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Terapkan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
