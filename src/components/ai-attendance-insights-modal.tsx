"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Sparkles,
  AlertTriangle,
  FileText,
  Copy,
  Check,
  RotateCw,
  Share2,
  Calendar,
  Users,
  ShieldAlert,
  ChevronRight,
  Info,
  Bell,
} from "lucide-react";
import { Student } from "@/db/schema";
import { AttendanceRecordWithStudent } from "@/db/queries";
import {
  detectAtRiskStudents,
  AtRiskStudent,
  AnomalyUrgency,
} from "@/lib/attendance-anomaly-detector";
import { useBottomSheetGesture } from "@/hooks/use-bottom-sheet";

export interface AiAttendanceInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: number;
  classNameTitle?: string;
  studentsList: Student[];
  records: AttendanceRecordWithStudent[];
  onShowToast?: (message: string, type: "success" | "error" | "info") => void;
}

interface InsightsApiResponse {
  success: boolean;
  period: "month" | "semester";
  periodTitle: string;
  summaryStats: {
    totalStudents: number;
    totalAbsences: number;
    totalAlpa: number;
    totalIzin: number;
    totalSakit: number;
    totalSuratBelum: number;
    attendanceRatePercent?: number;
  };
  atRiskStudents: AtRiskStudent[];
  narratives: {
    executiveSummary: string;
    principalReport: string;
    parentGroupMessage: string;
    bkRecommendations: Array<{
      studentName: string;
      riskLevel: "Kritis" | "Waspada" | "Perhatian";
      recommendation: string;
    }>;
  };
  cached: boolean;
  aiGenerated: boolean;
}

export function AiAttendanceInsightsModal({
  isOpen,
  onClose,
  classId,
  classNameTitle = "Kelas",
  studentsList,
  records,
  onShowToast,
}: AiAttendanceInsightsModalProps) {
  const [activeTab, setActiveTab] = useState<"early-warning" | "narratives">("early-warning");
  const [period, setPeriod] = useState<"month" | "semester">("month");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InsightsApiResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // 0ms instant local anomaly calculation as baseline
  const localAtRiskStudents = useMemo(() => {
    return detectAtRiskStudents(studentsList, records, { period });
  }, [studentsList, records, period]);

  const { sheetRef, sheetStyle, touchHandlers } = useBottomSheetGesture({
    isOpen,
    onClose,
    isExpanded,
    onExpand: () => setIsExpanded(true),
    onCollapse: () => setIsExpanded(false),
  });

  const fetchInsights = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/attendance-insights", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            classId,
            period,
            forceRefresh,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Gagal memuat wawasan presensi AI.");
        }

        setData(json);
      } catch (err: unknown) {
        console.warn("[Insights Modal] Fetch failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Gagal memuat wawasan AI. Menggunakan kalkulasi lokal."
        );
      } finally {
        setLoading(false);
      }
    },
    [classId, period]
  );

  useEffect(() => {
    if (isOpen) {
      setIsExpanded(false);
      fetchInsights(false);
    }
  }, [isOpen, fetchInsights]);

  const copyToClipboard = async (text: string, key: string, label = "Teks") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (onShowToast) {
        onShowToast(`${label} berhasil disalin ke clipboard!`, "success");
      }
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      if (onShowToast) {
        onShowToast("Gagal menyalin teks ke clipboard.", "error");
      }
    }
  };

  const getUrgencyBadge = (urgency: AnomalyUrgency) => {
    switch (urgency) {
      case "Kritis":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800">
            Kritis
          </span>
        );
      case "Waspada":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Waspada
          </span>
        );
      case "Perhatian":
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800">
            Perhatian
          </span>
        );
    }
  };

  const effectiveAtRisk = data?.atRiskStudents || localAtRiskStudents;
  const kritisCount = effectiveAtRisk.filter((s) => s.urgency === "Kritis").length;
  const waspadaCount = effectiveAtRisk.filter((s) => s.urgency === "Waspada").length;
  const perhatianCount = effectiveAtRisk.filter((s) => s.urgency === "Perhatian").length;

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="insights-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 pt-[env(safe-area-inset-top,1.5rem)] sm:p-4 bg-black/75 backdrop-blur-xs overflow-hidden sm:overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        style={sheetStyle}
        {...touchHandlers}
        className={`relative w-full max-w-3xl min-h-0 rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl bg-[var(--surface)] text-[var(--ink)] shadow-2xl border-t border-x sm:border border-[var(--border)] overflow-hidden flex flex-col modal-bottom-sheet transition-[max-height,height,transform] duration-250 ease-out ${
          isExpanded ? "h-[92dvh] max-h-[92dvh] expanded" : "max-h-[68dvh]"
        } sm:max-h-[88vh] sm:h-auto animate-in fade-in duration-200`}
      >
        {/* Mobile Tactile Drag Handle */}
        <div
          data-drag-handle
          className="sm:hidden flex justify-center pt-3 pb-3 touch-none cursor-grab active:cursor-grabbing bg-[var(--canvas-subtle)] shrink-0"
        >
          <div className="w-12 h-1.5 rounded-full bg-[var(--border-strong)]/60" />
        </div>

        {/* Header */}
        <header
          data-sheet-header
          className="px-4 sm:px-6 py-3.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--surface)] touch-none select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[var(--primary)]/15 text-[var(--primary)] shrink-0">
              <Bell className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div className="min-w-0">
              <h2 id="insights-modal-title" className="text-base sm:text-lg font-bold font-heading truncate text-[var(--ink)]">
                Wawasan Presensi &amp; Deteksi Dini
              </h2>
              <p className="text-xs text-[var(--ink-muted)] truncate">
                {classNameTitle} • {data?.periodTitle || (period === "month" ? "Bulan Ini" : "Semester Ini")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fetchInsights(true)}
              disabled={loading}
              className="touch-target p-2 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition-colors disabled:opacity-50"
              title="Segarkan Analisis (Bypass Cache)"
              aria-label="Segarkan Analisis"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin text-[var(--primary)]" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="touch-target p-2 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition-colors"
              aria-label="Tutup modal wawasan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Tabs & Period Switcher */}
        <div className="px-4 sm:px-6 py-2.5 bg-[var(--canvas-subtle)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setActiveTab("early-warning")}
              className={`touch-target px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "early-warning"
                  ? "bg-[var(--primary)] text-white shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Deteksi Siswa Berisiko</span>
                {effectiveAtRisk.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activeTab === "early-warning" ? "bg-white text-[var(--primary)]" : "bg-red-500 text-white"
                  }`}>
                    {effectiveAtRisk.length}
                  </span>
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("narratives")}
              className={`touch-target px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "narratives"
                  ? "bg-[var(--primary)] text-white shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Narasi Laporan &amp; WhatsApp</span>
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--ink-muted)] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Periode:</span>
            </span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as "month" | "semester")}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            >
              <option value="month">Bulan Ini</option>
              <option value="semester">Semester Ini</option>
            </select>
          </div>
        </div>

        {/* Content Body */}
        <div
          onScroll={(e) => {
            if (!isExpanded && e.currentTarget.scrollTop > 15) {
              setIsExpanded(true);
            }
          }}
          className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4"
        >
          {error && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: EARLY WARNING */}
          {activeTab === "early-warning" && (
            <div className="space-y-4">
              {/* Summary Urgency Bar */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                <div className="text-center p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">Kritis</p>
                  <p className="text-lg font-black text-red-700 dark:text-red-300">{kritisCount}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Waspada</p>
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300">{waspadaCount}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                  <p className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400">Perhatian</p>
                  <p className="text-lg font-black text-yellow-700 dark:text-yellow-300">{perhatianCount}</p>
                </div>
              </div>

              {/* Student Anomaly Cards */}
              {effectiveAtRisk.length === 0 ? (
                <div className="py-12 text-center text-[var(--ink-muted)] space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-[var(--ink)]">Kondisi Kehadiran Prima</p>
                  <p className="text-xs max-w-sm mx-auto">
                    Tidak terdeteksi anomali absensi atau siswa yang memerlukan perhatian khusus pada periode ini.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {effectiveAtRisk.map((student) => {
                    const bkItem = data?.narratives?.bkRecommendations?.find(
                      (b) => b.studentName.toLowerCase() === student.studentName.toLowerCase()
                    );
                    const cardKey = `student-${student.studentId}`;
                    const isCopied = copiedKey === cardKey;

                    const copyText = `[Catatan BK & Wali Kelas - ${student.studentName}]\nUrgensi: ${student.urgency}\nTotal Absen: ${student.stats.total} hari (Alpa: ${student.stats.alpa}, Izin: ${student.stats.izin}, Sakit: ${student.stats.sakit})\nIndikasi Anomali:\n${student.ruleDescriptions.map((r) => `- ${r}`).join("\n")}\nRekomendasi Tindak Lanjut:\n${bkItem?.recommendation || "Lakukan konfirmasi berkala dengan wali murid."}`;

                    return (
                      <div
                        key={student.studentId}
                        className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/60 transition-colors space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-[var(--ink)] truncate">
                                {student.studentName}
                              </h3>
                              {student.nis && (
                                <span className="text-[11px] text-[var(--ink-muted)]">
                                  NIS: {student.nis}
                                </span>
                              )}
                              {getUrgencyBadge(student.urgency)}
                            </div>
                            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                              Total: <span className="font-semibold text-[var(--ink)]">{student.stats.total} hari</span> ({student.stats.alpa} Alpa, {student.stats.izin} Izin, {student.stats.sakit} Sakit)
                              {student.stats.pendingLetters > 0 && (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                                  • {student.stats.pendingLetters} surat dokter tertunda
                                </span>
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => copyToClipboard(copyText, cardKey, "Catatan Siswa")}
                            className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold hover:bg-[var(--canvas-subtle)] text-[var(--ink)] transition-colors shrink-0"
                            title="Salin catatan siswa untuk rujukan BK"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                                <span>Salin Catatan BK</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Anomaly Rule Badges */}
                        <div className="space-y-1.5 pt-1">
                          {student.ruleDescriptions.map((desc, idx) => (
                            <div
                              key={idx}
                              className="text-xs flex items-start gap-2 text-[var(--ink)] leading-relaxed"
                            >
                              <ChevronRight className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                              <span>{desc}</span>
                            </div>
                          ))}
                        </div>

                        {/* BK Recommendation Box */}
                        {bkItem && (
                          <div className="p-3 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--border)] text-xs space-y-1">
                            <p className="font-bold text-[var(--primary)] flex items-center gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Saran Pendampingan BK &amp; Wali Kelas:</span>
                            </p>
                            <p className="text-[var(--ink-muted)] leading-relaxed">
                              {bkItem.recommendation}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NARRATIVES */}
          {activeTab === "narratives" && (
            <div className="space-y-5">
              {/* Executive Summary Card */}
              {data?.narratives?.executiveSummary && (
                <div className="p-4 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 space-y-1.5">
                  <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ringkasan Eksekutif</span>
                  </p>
                  <p className="text-xs sm:text-sm text-[var(--ink)] leading-relaxed">
                    {data.narratives.executiveSummary}
                  </p>
                </div>
              )}

              {/* Principal Formal Report */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--primary)]" />
                      <span>Laporan Formal Pimpinan Sekolah</span>
                    </h3>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      Draf narasi resmi untuk Kepala Sekolah atau lembar evaluasi dinas.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        data?.narratives?.principalReport || "",
                        "principal",
                        "Laporan Resmi"
                      )
                    }
                    className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold hover:bg-[var(--canvas-subtle)] text-[var(--ink)] transition-colors shrink-0"
                  >
                    {copiedKey === "principal" ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                        <span>Salin Laporan</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--border)] text-xs sm:text-sm text-[var(--ink)] font-mono whitespace-pre-wrap leading-relaxed select-all">
                  {data?.narratives?.principalReport || "Memuat narasi laporan..."}
                </div>
              </div>

              {/* Parent Group Message (WhatsApp) */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Draf Pesan Paguyuban WhatsApp Orang Tua</span>
                    </h3>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      Pesan santun &amp; edukatif (tanpa menyebut nama individu) siap kirim ke grup WA.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          data?.narratives?.parentGroupMessage || "",
                          "parent-wa",
                          "Pesan WhatsApp"
                        )
                      }
                      className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold hover:bg-[var(--canvas-subtle)] text-[var(--ink)] transition-colors shrink-0"
                    >
                      {copiedKey === "parent-wa" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                          <span>Salin Format WA</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--border)] text-xs sm:text-sm text-[var(--ink)] font-mono whitespace-pre-wrap leading-relaxed select-all">
                  {data?.narratives?.parentGroupMessage || "Memuat draf pesan WhatsApp..."}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-4 sm:px-6 py-3 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between shrink-0 text-xs text-[var(--ink-muted)]">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">
              {data?.cached ? "Data dimuat dari cache (12 jam)" : data?.aiGenerated ? "Disintesis oleh 9router AI" : "Kalkulasi lokal aman"}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
