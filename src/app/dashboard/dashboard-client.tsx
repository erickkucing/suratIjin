"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  School,
  Plus,
  Filter,
  FileDown,
  FileSpreadsheet,
  Users,
  Share2,
  LogOut,
  Search,
  Eye,
  Edit2,
  Trash2,
  ChevronDown,
  RefreshCw,
  UserCheck,
  ClipboardCheck,
  SlidersHorizontal,
} from "lucide-react";
import { DashboardData, AttendanceRecordWithStudent } from "@/db/queries";
import { ClassItem } from "@/db/schema";
import { UserSessionPayload } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { deleteAttendanceAction } from "@/actions/attendance";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatCard } from "@/components/stat-card";
import { MonthlyBarChart } from "@/components/monthly-bar-chart";
import { LetterLightboxModal } from "@/components/letter-lightbox-modal";
import { AttendanceFormModal } from "@/components/attendance-form-modal";
import { ParentPortalSettingsModal } from "@/components/parent-portal-settings-modal";
import { StudentRosterModal } from "@/components/student-roster-modal";
import { TeacherProfileModal } from "@/components/teacher-profile-modal";
import { MobileFilterDrawer } from "@/components/mobile-filter-drawer";
import { exportAttendancePdf } from "@/lib/export-pdf";
import { exportAttendanceExcel } from "@/lib/export-excel";
import { computeDynamicDashboardMetrics } from "@/lib/attendance-stats";

interface DashboardClientProps {
  initialData: DashboardData;
  user: UserSessionPayload;
  classesList: ClassItem[];
  currentClassId: number;
  logoUrl?: string | null;
}

export function DashboardClient({
  initialData,
  user,
  classesList,
  currentClassId,
  logoUrl,
}: DashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<DashboardData>(initialData);
  const [teacherDisplayName, setTeacherDisplayName] = useState(user.displayName);
  const [filterStudentName, setFilterStudentName] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [filterLetterStatus, setFilterLetterStatus] = useState<string>("Semua");
  const [viewMode, setViewMode] = useState<"harian" | "rapor">("harian");

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceRecordWithStudent | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxRecord, setLightboxRecord] = useState<AttendanceRecordWithStudent | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    setTeacherDisplayName(user.displayName);
  }, [user.displayName]);

  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  const handleClassChange = (newClassId: number) => {
    startTransition(() => {
      router.push(`/dashboard?classId=${newClassId}`);
    });
  };

  const handleResetFilters = () => {
    setFilterStudentName("");
    setFilterDateStart("");
    setFilterDateEnd("");
    setFilterStatus("Semua");
    setFilterLetterStatus("Semua");
  };

  const handleDelete = async (record: AttendanceRecordWithStudent) => {
    if (confirm(`Yakin ingin menghapus catatan ketidakhadiran ${record.studentName} pada ${record.attendanceDate}?`)) {
      try {
        const res = await deleteAttendanceAction(record.id);
        if (res.success) {
          setData((prev) => ({
            ...prev,
            records: prev.records.filter((r) => r.id !== record.id),
          }));
        } else {
          alert(res.error || "Gagal menghapus data ketidakhadiran.");
        }
        router.refresh();
      } catch (err) {
        console.error("Gagal menghapus data ketidakhadiran:", err);
      }
    }
  };

  const dynamicMetrics = useMemo(
    () =>
      computeDynamicDashboardMetrics({
        studentsList: data.studentsList,
        records: data.records,
        dateStart: filterDateStart || undefined,
        dateEnd: filterDateEnd || undefined,
      }),
    [data.studentsList, data.records, filterDateStart, filterDateEnd]
  );

  const displayedRecords = data.records.filter((r) => {
    if (filterStudentName && !r.studentName.toLowerCase().includes(filterStudentName.toLowerCase())) {
      return false;
    }
    if (filterDateStart && r.attendanceDate < filterDateStart) {
      return false;
    }
    if (filterDateEnd && r.attendanceDate > filterDateEnd) {
      return false;
    }
    if (filterStatus !== "Semua" && r.status !== filterStatus) {
      return false;
    }
    if (filterLetterStatus === "Belum_Izin_Sakit") {
      if (!["Izin", "Sakit"].includes(r.status) || r.letterStatus !== "Belum") {
        return false;
      }
    } else if (filterLetterStatus === "Sudah" && r.letterStatus !== "Sudah") {
      return false;
    } else if (filterLetterStatus === "Belum" && r.letterStatus !== "Belum") {
      return false;
    }
    return true;
  });

  const displayedStudentRecap = dynamicMetrics.studentRecap.filter((st) => {
    if (
      filterStudentName &&
      !st.name.toLowerCase().includes(filterStudentName.toLowerCase()) &&
      !(st.nis && st.nis.toLowerCase().includes(filterStudentName.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  const activeFilterCount =
    (filterStudentName ? 1 : 0) +
    (filterDateStart ? 1 : 0) +
    (filterDateEnd ? 1 : 0) +
    (filterStatus !== "Semua" ? 1 : 0) +
    (filterLetterStatus !== "Semua" ? 1 : 0);

  const dateRangeLabel =
    filterDateStart || filterDateEnd
      ? `${filterDateStart || "Awal"} s.d. ${filterDateEnd || "Sekarang"}`
      : `${data.classInfo.periodTitle} (${data.classInfo.academicYear})`;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[var(--ink)] pb-20 sm:pb-8">
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo Sekolah"
                width={40}
                height={40}
                fetchPriority="high"
                className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
              />
            ) : (
              <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs flex items-center justify-center shrink-0">
                <School className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {classesList.length > 1 ? (
                  <div className="relative inline-block">
                    <select
                      aria-label="Pilih kelas"
                      value={currentClassId}
                      onChange={(e) => handleClassChange(parseInt(e.target.value, 10))}
                      className="text-base sm:text-lg font-bold font-heading bg-transparent border-b border-dashed border-[var(--ink-muted)] pr-6 cursor-pointer text-[var(--ink)] focus:outline-none"
                    >
                      {classesList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--ink-muted)]" />
                  </div>
                ) : (
                  <h1 className="text-base sm:text-lg font-bold font-heading text-[var(--ink)]">
                    {data.classInfo.name}
                  </h1>
                )}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--primary)] font-semibold hidden sm:inline-block">
                  {data.classInfo.periodTitle}
                </span>
              </div>
              <p className="text-xs font-semibold text-[var(--ink)] whitespace-nowrap truncate max-w-[200px] sm:max-w-md">
                {teacherDisplayName}
              </p>
              <p className="text-[11px] text-[var(--ink-muted)] leading-tight">
                {data.totalClassStudents} Siswa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRosterModalOpen(true)}
              className="touch-target hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            >
              <Users className="w-4 h-4 text-[var(--ink-muted)]" />
              <span>Kelola Siswa</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="touch-target hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              title="Kelola nama kelas, periode, dan link portal wali murid"
            >
              <Share2 className="w-4 h-4 text-[var(--ink-muted)]" />
              <span>Pengaturan Kelas &amp; Portal</span>
            </button>

            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="touch-target hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              title="Pengaturan profil dan akun login saya"
            >
              <UserCheck className="w-4 h-4 text-[var(--primary)]" />
              <span>Profil Saya</span>
            </button>

            {user.role === "superadmin" && (
              <Link
                href="/admin"
                className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 text-xs font-bold"
              >
                Panel Superadmin
              </Link>
            )}

            <ThemeToggle />

            <form action={logoutAction}>
              <button
                type="submit"
                className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-[var(--ink-muted)] hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                title="Keluar"
                aria-label="Keluar dari akun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 pb-28 sm:pb-6 space-y-5 sm:space-y-6">
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="sr-only">Ringkasan Statistik Ketidakhadiran</h2>
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible no-scrollbar">
            <StatCard
              title="Total Alpa"
              count={dynamicMetrics.summary.totalAlpa}
              description="Tanpa keterangan resmi"
              accentColor="alpa"
              isActive={filterStatus === "Alpa"}
              onClick={() => {
                setFilterStatus(filterStatus === "Alpa" ? "Semua" : "Alpa");
                setFilterLetterStatus("Semua");
                setViewMode("harian");
              }}
            />
            <StatCard
              title="Total Izin"
              count={dynamicMetrics.summary.totalIzin}
              description="Izin urusan keluarga / kegiatan"
              accentColor="izin"
              isActive={filterStatus === "Izin"}
              onClick={() => {
                setFilterStatus(filterStatus === "Izin" ? "Semua" : "Izin");
                setFilterLetterStatus("Semua");
                setViewMode("harian");
              }}
            />
            <StatCard
              title="Total Sakit"
              count={dynamicMetrics.summary.totalSakit}
              description="Keterangan dokter / sakit"
              accentColor="sakit"
              isActive={filterStatus === "Sakit"}
              onClick={() => {
                setFilterStatus(filterStatus === "Sakit" ? "Semua" : "Sakit");
                setFilterLetterStatus("Semua");
                setViewMode("harian");
              }}
            />
            <StatCard
              title="Surat Belum Lengkap"
              count={dynamicMetrics.summary.totalSuratBelum}
              description="Izin & Sakit tanpa bukti fisik"
              accentColor="warning"
              isActive={filterLetterStatus === "Belum_Izin_Sakit"}
              onClick={() => {
                setFilterLetterStatus(
                  filterLetterStatus === "Belum_Izin_Sakit" ? "Semua" : "Belum_Izin_Sakit"
                );
                setFilterStatus("Semua");
                setViewMode("harian");
              }}
            />
          </div>
        </section>

        {/* Mobile Quick Filter Chips & Drawer Trigger */}
        <div className="sm:hidden flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            {["Semua", "Alpa", "Izin", "Sakit"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setFilterStatus(st);
                  if (st !== "Semua") setFilterLetterStatus("Semua");
                  setViewMode("harian");
                }}
                className={`touch-target px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterStatus === st && filterLetterStatus !== "Belum_Izin_Sakit"
                    ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-xs"
                    : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:bg-[var(--canvas-subtle)]"
                }`}
              >
                {st}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setFilterLetterStatus(
                  filterLetterStatus === "Belum_Izin_Sakit" ? "Semua" : "Belum_Izin_Sakit"
                );
                setFilterStatus("Semua");
                setViewMode("harian");
              }}
              className={`touch-target px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                filterLetterStatus === "Belum_Izin_Sakit"
                  ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-xs"
                  : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:bg-[var(--canvas-subtle)]"
              }`}
            >
              Belum Surat
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileFilterOpen(true)}
            className="touch-target shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--ink)] shadow-xs hover:bg-[var(--canvas-subtle)]"
            aria-label="Buka filter lanjutan dan ekspor"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--primary)]" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[var(--primary)] text-white text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <section className="hidden sm:block card-paper p-4 rounded-2xl space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditRecord(null);
                  setIsFormModalOpen(true);
                }}
                className="touch-target flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-bold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Catat Ketidakhadiran</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFiltersMobile(!showFiltersMobile)}
                className="touch-target lg:hidden inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold"
              >
                <Filter className="w-4 h-4" />
                <span>Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 self-end lg:self-center">
              <button
                type="button"
                onClick={() =>
                  exportAttendancePdf({
                    classInfo: data.classInfo,
                    teacherName: teacherDisplayName,
                    records: displayedRecords,
                    students100Percent: dynamicMetrics.students100Percent,
                    studentRecap: dynamicMetrics.studentRecap,
                    dateRangeLabel,
                    logoUrl,
                  })
                }
                className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                title="Unduh laporan format PDF"
              >
                <FileDown className="w-4 h-4 text-[var(--primary)]" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportAttendanceExcel({
                    classInfo: data.classInfo,
                    teacherName: teacherDisplayName,
                    records: displayedRecords,
                    students100Percent: dynamicMetrics.students100Percent,
                    studentRecap: dynamicMetrics.studentRecap,
                    dateRangeLabel,
                    logoUrl,
                  })
                }
                className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                title="Unduh laporan format Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4 text-[var(--status-success-fg)]" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-3 border-t border-[var(--border)] items-center ${
              showFiltersMobile ? "block" : "hidden lg:grid"
            }`}
          >
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
              <input
                type="text"
                aria-label="Cari nama siswa"
                value={filterStudentName}
                onChange={(e) => setFilterStudentName(e.target.value)}
                placeholder="Cari nama siswa..."
                className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
            </div>

            <div>
              <input
                type="date"
                aria-label="Dari tanggal"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                title="Dari Tanggal"
                className="w-full h-9 px-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
            </div>

            <div>
              <input
                type="date"
                aria-label="Sampai tanggal"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                title="Sampai Tanggal"
                className="w-full h-9 px-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              />
            </div>

            <div>
              <select
                aria-label="Filter status kehadiran"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                <option value="Semua">Semua Status</option>
                <option value="Izin">Izin</option>
                <option value="Sakit">Sakit</option>
                <option value="Alpa">Alpa</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                aria-label="Filter status surat"
                value={filterLetterStatus}
                onChange={(e) => setFilterLetterStatus(e.target.value)}
                className="flex-1 h-9 px-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                <option value="Semua">Semua Surat</option>
                <option value="Sudah">Surat Sudah Ada</option>
                <option value="Belum">Surat Belum Ada</option>
                <option value="Belum_Izin_Sakit">Belum (Izin &amp; Sakit)</option>
              </select>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors shrink-0"
                  title="Reset filter"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="card-paper rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--canvas-subtle)]">
            <div>
              <h3 id="dashboard-table-heading" className="text-sm font-bold font-heading text-[var(--ink)]">
                {viewMode === "harian"
                  ? `Daftar Ketidakhadiran Siswa (${displayedRecords.length} Catatan)`
                  : `Rekap Ketidakhadiran Per Siswa (${displayedStudentRecap.length} Siswa Aktif)`}
              </h3>
              <p className="text-xs text-[var(--ink-muted)]">
                Periode: {dateRangeLabel}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <div
                role="tablist"
                aria-label="Mode tampilan tabel"
                className="inline-flex p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "harian"}
                  onClick={() => setViewMode("harian")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    viewMode === "harian"
                      ? "bg-[var(--primary)] text-white shadow-xs"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  Riwayat Harian ({displayedRecords.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "rapor"}
                  onClick={() => setViewMode("rapor")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    viewMode === "rapor"
                      ? "bg-[var(--primary)] text-white shadow-xs"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  Rekap Per Siswa ({displayedStudentRecap.length})
                </button>
              </div>
              {isPending && (
                <RefreshCw className="w-4 h-4 animate-spin text-[var(--primary)]" />
              )}
            </div>
          </div>

          {viewMode === "harian" ? (
            <>
              <div
                role="region"
                aria-labelledby="dashboard-table-heading"
                tabIndex={0}
                className="hidden md:block overflow-x-auto"
              >
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface)] text-[var(--ink-muted)] border-b border-[var(--border)] font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-3 w-12 text-center">No</th>
                      <th scope="col" className="px-4 py-3 w-28">Tanggal</th>
                      <th scope="col" className="px-4 py-3">Nama Siswa</th>
                      <th scope="col" className="px-4 py-3 w-24 text-center">Status</th>
                      <th scope="col" className="px-4 py-3 w-32">Info Dari</th>
                      <th scope="col" className="px-4 py-3">Keterangan</th>
                      <th scope="col" className="px-4 py-3 w-28 text-center">Surat</th>
                      <th scope="col" className="px-4 py-3 w-24 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {displayedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                          Tidak ada data ketidakhadiran yang sesuai dengan kriteria filter.
                        </td>
                      </tr>
                    ) : (
                      displayedRecords.map((r, idx) => {
                        const hasFile = !!r.letterFilePath;
                        return (
                          <tr
                            key={r.id}
                            className="hover:bg-[var(--canvas-subtle)] transition-colors"
                          >
                            <td className="px-4 py-3 text-center text-[var(--ink-subtle)] font-mono">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 font-medium text-[var(--ink)] whitespace-nowrap">
                              {r.attendanceDate}
                            </td>
                            <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                              {r.studentName}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  r.status === "Izin"
                                    ? "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)]"
                                    : r.status === "Sakit"
                                    ? "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)]"
                                    : "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)] whitespace-nowrap">
                              {r.infoSource}
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-muted)] max-w-xs truncate">
                              {r.description || "-"}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {hasFile ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLightboxRecord(r);
                                    setIsLightboxOpen(true);
                                  }}
                                  className="touch-target inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--accent-slate)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Lihat Surat</span>
                                </button>
                              ) : (
                                <span
                                  className={`text-xs font-semibold ${
                                    r.status === "Alpa"
                                      ? "text-[var(--ink-subtle)]"
                                      : "text-[var(--primary)]"
                                  }`}
                                >
                                  {r.status === "Alpa" ? "-" : "Belum Ada"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditRecord(r);
                                    setIsFormModalOpen(true);
                                  }}
                                  className="touch-target p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--primary)] hover:bg-[var(--canvas-subtle)]"
                                  title="Edit Data"
                                  aria-label={`Edit catatan ${r.studentName}`}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(r)}
                                  className="touch-target p-1.5 rounded text-[var(--ink-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  title="Hapus Data"
                                  aria-label={`Hapus catatan ${r.studentName}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden p-3 space-y-3">
                {displayedRecords.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[var(--ink-muted)]">
                    Tidak ada data ketidakhadiran yang sesuai dengan kriteria filter.
                  </div>
                ) : (
                  displayedRecords.map((r) => {
                    const hasFile = !!r.letterFilePath;
                    const statusBorderClass =
                      r.status === "Izin"
                        ? "border-l-4 border-l-[var(--status-izin-fg)]"
                        : r.status === "Sakit"
                        ? "border-l-4 border-l-[var(--status-sakit-fg)]"
                        : "border-l-4 border-l-[var(--status-alpa-fg)]";

                    return (
                      <div
                        key={r.id}
                        className={`p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xs space-y-2.5 transition-all ${statusBorderClass}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <h4 className="text-sm font-bold text-[var(--ink)] leading-snug">
                              {r.studentName}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)] flex-wrap">
                              <span className="font-semibold text-[var(--ink)]">{r.attendanceDate}</span>
                              <span>&bull;</span>
                              <span>Info: {r.infoSource}</span>
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${
                              r.status === "Izin"
                                ? "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)]"
                                : r.status === "Sakit"
                                ? "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)]"
                                : "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>

                        {r.description && (
                          <p className="text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] p-2.5 rounded-lg leading-relaxed">
                            {r.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                          <div>
                            {hasFile ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setLightboxRecord(r);
                                  setIsLightboxOpen(true);
                                }}
                                className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-bold text-[var(--accent-slate)] shadow-2xs"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Lihat Surat</span>
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                                {r.status === "Alpa" ? "Tanpa Surat" : "Surat Belum Ada"}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditRecord(r);
                                setIsFormModalOpen(true);
                              }}
                              className="touch-target inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--primary)] hover:bg-[var(--canvas-subtle)]"
                              aria-label={`Edit catatan ${r.studentName}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(r)}
                              className="touch-target inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                              aria-label={`Hapus catatan ${r.studentName}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              <div
                role="region"
                aria-labelledby="dashboard-table-heading"
                tabIndex={0}
                className="hidden md:block overflow-x-auto"
              >
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface)] text-[var(--ink-muted)] border-b border-[var(--border)] font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-3 w-12 text-center">No</th>
                      <th scope="col" className="px-4 py-3 w-28">NIS</th>
                      <th scope="col" className="px-4 py-3">Nama Siswa</th>
                      <th scope="col" className="px-4 py-3 w-24 text-center">Sakit</th>
                      <th scope="col" className="px-4 py-3 w-24 text-center">Izin</th>
                      <th scope="col" className="px-4 py-3 w-24 text-center">Alpa</th>
                      <th scope="col" className="px-4 py-3 w-36 text-center">Total Absen</th>
                      <th scope="col" className="px-4 py-3 w-32 text-center">Surat Belum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {displayedStudentRecap.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                          Tidak ada siswa yang sesuai dengan pencarian.
                        </td>
                      </tr>
                    ) : (
                      displayedStudentRecap.map((st, idx) => (
                        <tr key={st.studentId} className="hover:bg-[var(--canvas-subtle)] transition-colors">
                          <td className="px-4 py-3 text-center text-[var(--ink-subtle)] font-mono">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-mono text-[var(--ink-muted)]">
                            {st.nis || "-"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                            {st.name}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {st.sakit > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] font-bold">
                                {st.sakit}
                              </span>
                            ) : (
                              <span className="text-[var(--ink-subtle)]">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {st.izin > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] font-bold">
                                {st.izin}
                              </span>
                            ) : (
                              <span className="text-[var(--ink-subtle)]">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {st.alpa > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] font-bold">
                                {st.alpa}
                              </span>
                            ) : (
                              <span className="text-[var(--ink-subtle)]">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-bold">
                            {st.totalAbsences === 0 ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] text-[11px] whitespace-nowrap">
                                100%
                              </span>
                            ) : (
                              <span>{st.totalAbsences} Hari</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {st.suratBelum > 0 ? (
                              <span className="text-xs font-bold text-[var(--primary)]">
                                {st.suratBelum} Surat
                              </span>
                            ) : (
                              <span className="text-[var(--ink-subtle)]">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden p-3 space-y-3">
                {displayedStudentRecap.map((st, idx) => (
                  <div
                    key={st.studentId}
                    className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[var(--ink)]">
                          {idx + 1}. {st.name}
                        </p>
                        <p className="text-xs text-[var(--ink-muted)]">NIS: {st.nis || "-"}</p>
                      </div>
                      {st.totalAbsences === 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] text-xs font-bold whitespace-nowrap">
                          100%
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--canvas-subtle)] text-[var(--ink)] text-xs font-bold border border-[var(--border)]">
                          {st.totalAbsences} Hari
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                      <div className="p-1.5 rounded-lg bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] font-medium">
                        Sakit: <strong className="font-bold">{st.sakit}</strong>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] font-medium">
                        Izin: <strong className="font-bold">{st.izin}</strong>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] font-medium">
                        Alpa: <strong className="font-bold">{st.alpa}</strong>
                      </div>
                    </div>
                    {st.suratBelum > 0 && (
                      <p className="text-[11px] font-bold text-[var(--primary)] pt-0.5">
                        ⚠️ Ada {st.suratBelum} surat yang belum lengkap.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="cv-auto-section grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card-paper p-5 rounded-2xl space-y-3">
            <div>
              <h3 className="text-base font-bold font-heading text-[var(--ink)]">
                Grafik Ketidakhadiran Bulanan
              </h3>
              <p className="text-xs text-[var(--ink-muted)]">
                Jumlah kejadian izin, sakit, dan alpa per bulan
              </p>
            </div>
            <MonthlyBarChart data={dynamicMetrics.monthlyChart} />
          </section>

          <section className="card-paper p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold font-heading text-[var(--ink)]">
                  Kehadiran 100%
                </h3>
                <p className="text-xs text-[var(--ink-muted)]">
                  {dynamicMetrics.students100Percent.length} dari {data.totalClassStudents} siswa
                </p>
              </div>
            </div>

            <div className="border border-[var(--border)] rounded-xl max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
              {dynamicMetrics.students100Percent.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                  Semua siswa memiliki catatan ketidakhadiran pada periode ini.
                </div>
              ) : (
                dynamicMetrics.students100Percent.map((s, idx) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span className="text-xs font-mono font-bold text-[var(--primary)] w-6 text-right shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--ink)] truncate">{s.name}</p>
                        {s.nis && <p className="text-[11px] text-[var(--ink-subtle)]">NIS: {s.nis}</p>}
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--primary-light)] text-[var(--primary)] font-semibold shrink-0 whitespace-nowrap">
                      100%
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Floating Action Button (+ Catat) on Mobile */}
      <button
        type="button"
        onClick={() => {
          setEditRecord(null);
          setIsFormModalOpen(true);
        }}
        className="touch-target sm:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center bg-[var(--primary)] text-white shadow-lg hover:bg-[var(--primary-hover)] active:scale-95 transition-all border border-white/10"
        aria-label="Catat ketidakhadiran baru"
        title="Catat Ketidakhadiran"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* 4-Tab Bottom Navigation Bar on Mobile */}
      <nav
        aria-label="Navigasi Bawah"
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface)] border-t border-[var(--border)] shadow-lg px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] flex items-center justify-around"
      >
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="touch-target flex-1 flex flex-col items-center justify-center py-1 text-[var(--primary)] font-bold transition-colors"
        >
          <ClipboardCheck className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Presensi</span>
        </button>

        <button
          type="button"
          onClick={() => setIsRosterModalOpen(true)}
          className="touch-target flex-1 flex flex-col items-center justify-center py-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Siswa</span>
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsModalOpen(true)}
          className="touch-target flex-1 flex flex-col items-center justify-center py-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <Share2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Portal</span>
        </button>

        <button
          type="button"
          onClick={() => setIsProfileModalOpen(true)}
          className="touch-target flex-1 flex flex-col items-center justify-center py-1 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
        >
          <UserCheck className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Profil</span>
        </button>
      </nav>

      <MobileFilterDrawer
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        studentName={filterStudentName}
        onStudentNameChange={setFilterStudentName}
        dateStart={filterDateStart}
        onDateStartChange={setFilterDateStart}
        dateEnd={filterDateEnd}
        onDateEndChange={setFilterDateEnd}
        status={filterStatus}
        onStatusChange={setFilterStatus}
        letterStatus={filterLetterStatus}
        onLetterStatusChange={setFilterLetterStatus}
        onReset={handleResetFilters}
        activeFilterCount={activeFilterCount}
        onExportPdf={() =>
          exportAttendancePdf({
            classInfo: data.classInfo,
            teacherName: teacherDisplayName,
            records: displayedRecords,
            students100Percent: dynamicMetrics.students100Percent,
            studentRecap: dynamicMetrics.studentRecap,
            dateRangeLabel,
            logoUrl,
          })
        }
        onExportExcel={() =>
          exportAttendanceExcel({
            classInfo: data.classInfo,
            teacherName: teacherDisplayName,
            records: displayedRecords,
            students100Percent: dynamicMetrics.students100Percent,
            studentRecap: dynamicMetrics.studentRecap,
            dateRangeLabel,
            logoUrl,
          })
        }
      />

      <TeacherProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        classNameTitle={data.classInfo.name}
        onOpenClassSettings={() => setIsSettingsModalOpen(true)}
        onSuccess={(newName) => {
          setTeacherDisplayName(newName);
          router.refresh();
        }}
      />

      <AttendanceFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        classId={data.classInfo.id}
        studentsList={data.studentsList}
        editRecord={editRecord}
        onSuccess={() => router.refresh()}
      />

      <LetterLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => {
          setIsLightboxOpen(false);
          setLightboxRecord(null);
        }}
        filePath={lightboxRecord?.letterFilePath || null}
        studentName={lightboxRecord?.studentName || ""}
        attendanceDate={lightboxRecord?.attendanceDate || ""}
        status={lightboxRecord?.status || ""}
      />

      <ParentPortalSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        classInfo={data.classInfo}
        teacherName={teacherDisplayName}
        onSuccess={() => router.refresh()}
      />

      <StudentRosterModal
        isOpen={isRosterModalOpen}
        onClose={() => setIsRosterModalOpen(false)}
        classId={data.classInfo.id}
        classNameTitle={data.classInfo.name}
        studentsList={data.allStudentsList || data.studentsList}
        logoUrl={logoUrl}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
