"use client";

import { useState, useTransition } from "react";
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
  Calendar,
  Search,
  CheckCircle,
  Clock,
  Eye,
  Edit2,
  Trash2,
  Award,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { DashboardData, AttendanceRecordWithStudent } from "@/db/queries";
import { ClassItem, Student } from "@/db/schema";
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
import { exportAttendancePdf } from "@/lib/export-pdf";
import { exportAttendanceExcel } from "@/lib/export-excel";

interface DashboardClientProps {
  initialData: DashboardData;
  user: UserSessionPayload;
  classesList: ClassItem[];
  currentClassId: number;
}

export function DashboardClient({
  initialData,
  user,
  classesList,
  currentClassId,
}: DashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local state
  const [data, setData] = useState<DashboardData>(initialData);
  const [filterStudentName, setFilterStudentName] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [filterLetterStatus, setFilterLetterStatus] = useState<string>("Semua");

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceRecordWithStudent | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxRecord, setLightboxRecord] = useState<AttendanceRecordWithStudent | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);

  // Mobile filter drawer state
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  const handleClassChange = (newClassId: number) => {
    startTransition(() => {
      router.push(`/dashboard?classId=${newClassId}`);
    });
  };

  const handleApplyFilters = () => {
    // Client-side filtering of already loaded dataset or trigger server refresh
    // For fast responsive feel, we filter the dataset in memory
    router.refresh();
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
      await deleteAttendanceAction(record.id);
      router.refresh();
    }
  };

  // Filter records based on current state
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
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 border-b border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Class Switcher */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--board)] text-white shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {classesList.length > 1 ? (
                  <div className="relative inline-block">
                    <select
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
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--board-light)] text-[var(--board)] font-semibold hidden sm:inline-block">
                  {data.classInfo.periodTitle}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                Wali Kelas: {user.displayName} | {data.totalClassStudents} Siswa
              </p>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRosterModalOpen(true)}
              className="touch-target hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            >
              <Users className="w-4 h-4 text-[var(--ink-muted)]" />
              <span>Kelola Siswa</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="touch-target hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
            >
              <Share2 className="w-4 h-4 text-[var(--ink-muted)]" />
              <span>Link Wali Murid</span>
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
                className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-[var(--ink-muted)] hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                title="Keluar"
                aria-label="Keluar dari akun"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Row 1: Interactive Summary Cards */}
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="sr-only">Ringkasan Statistik Ketidakhadiran</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Total Alpa"
              count={data.summary.totalAlpa}
              description="Tanpa keterangan resmi"
              accentColor="alpa"
              isActive={filterStatus === "Alpa"}
              onClick={() => {
                setFilterStatus(filterStatus === "Alpa" ? "Semua" : "Alpa");
                setFilterLetterStatus("Semua");
              }}
            />
            <StatCard
              title="Total Izin"
              count={data.summary.totalIzin}
              description="Izin urusan keluarga / kegiatan"
              accentColor="izin"
              isActive={filterStatus === "Izin"}
              onClick={() => {
                setFilterStatus(filterStatus === "Izin" ? "Semua" : "Izin");
                setFilterLetterStatus("Semua");
              }}
            />
            <StatCard
              title="Total Sakit"
              count={data.summary.totalSakit}
              description="Keterangan dokter / sakit"
              accentColor="sakit"
              isActive={filterStatus === "Sakit"}
              onClick={() => {
                setFilterStatus(filterStatus === "Sakit" ? "Semua" : "Sakit");
                setFilterLetterStatus("Semua");
              }}
            />
            <StatCard
              title="Surat Belum Lengkap"
              count={data.summary.totalSuratBelum}
              description="Izin & Sakit tanpa bukti fisik"
              accentColor="warning"
              isActive={filterLetterStatus === "Belum_Izin_Sakit"}
              onClick={() => {
                setFilterLetterStatus(
                  filterLetterStatus === "Belum_Izin_Sakit" ? "Semua" : "Belum_Izin_Sakit"
                );
                setFilterStatus("Semua");
              }}
            />
          </div>
        </section>

        {/* Row 2: Action & Filter Bar */}
        <section className="card-paper p-4 rounded-2xl space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Left: Primary CTA */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditRecord(null);
                  setIsFormModalOpen(true);
                }}
                className="touch-target flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--terracotta)] text-white hover:bg-[var(--terracotta-hover)] text-sm font-bold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--terracotta)] transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>+ Catat Ketidakhadiran</span>
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

            {/* Right: Export buttons */}
            <div className="flex items-center gap-2 self-end lg:self-center">
              <button
                type="button"
                onClick={() =>
                  exportAttendancePdf({
                    classInfo: data.classInfo,
                    teacherName: user.displayName,
                    records: displayedRecords,
                    students100Percent: data.students100Percent,
                    dateRangeLabel,
                  })
                }
                className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                title="Unduh laporan format PDF"
              >
                <FileDown className="w-4 h-4 text-red-600" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportAttendanceExcel({
                    classInfo: data.classInfo,
                    teacherName: user.displayName,
                    records: displayedRecords,
                    students100Percent: data.students100Percent,
                    dateRangeLabel,
                  })
                }
                className="touch-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                title="Unduh laporan format Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Inline Filter Controls (Desktop & Collapsible on Mobile) */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-3 border-t border-[var(--border)] ${
              showFiltersMobile ? "block" : "hidden lg:grid"
            }`}
          >
            {/* Student Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
              <input
                type="text"
                value={filterStudentName}
                onChange={(e) => setFilterStudentName(e.target.value)}
                placeholder="Cari nama siswa..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
            </div>

            {/* Date Start */}
            <div>
              <input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                title="Tanggal Mulai"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
            </div>

            {/* Date End */}
            <div>
              <input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                title="Tanggal Selesai"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
            </div>

            {/* Status Dropdown */}
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              >
                <option value="Semua">Semua Status</option>
                <option value="Izin">Izin</option>
                <option value="Sakit">Sakit</option>
                <option value="Alpa">Alpa</option>
              </select>
            </div>

            {/* Reset / Quick status */}
            <div className="flex items-center gap-1.5">
              <select
                value={filterLetterStatus}
                onChange={(e) => setFilterLetterStatus(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
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
                  className="touch-target px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas-subtle)] text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  title="Reset filter"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Row 3: Data Table (Desktop) & Card List (Mobile) */}
        <section className="card-paper rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--canvas-subtle)]">
            <div>
              <h3 className="text-sm font-bold font-heading text-[var(--ink)]">
                Daftar Ketidakhadiran Siswa ({displayedRecords.length} Catatan)
              </h3>
              <p className="text-xs text-[var(--ink-muted)]">
                Periode: {dateRangeLabel}
              </p>
            </div>
            {isPending && (
              <RefreshCw className="w-4 h-4 animate-spin text-[var(--board)]" />
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface)] text-[var(--ink-muted)] border-b border-[var(--border)] uppercase tracking-wider font-semibold">
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
                              className="touch-target inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--board)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Surat</span>
                            </button>
                          ) : (
                            <span
                              className={`text-xs font-semibold ${
                                r.status === "Alpa"
                                  ? "text-[var(--ink-subtle)]"
                                  : "text-[var(--terracotta)]"
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
                              className="touch-target p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--board)] hover:bg-[var(--canvas-subtle)]"
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

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {displayedRecords.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                Tidak ada data ketidakhadiran yang sesuai dengan kriteria filter.
              </div>
            ) : (
              displayedRecords.map((r) => {
                const hasFile = !!r.letterFilePath;
                return (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--ink)]">
                          {r.studentName}
                        </h4>
                        <p className="text-xs text-[var(--ink-muted)]">
                          {r.attendanceDate} &bull; Info: {r.infoSource}
                        </p>
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
                      <p className="text-xs text-[var(--ink-muted)] bg-[var(--canvas-subtle)] p-2 rounded-lg">
                        {r.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <div>
                        {hasFile ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLightboxRecord(r);
                              setIsLightboxOpen(true);
                            }}
                            className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--board)]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Lihat Surat</span>
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-[var(--terracotta)]">
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
                          className="touch-target p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)]"
                          aria-label="Edit catatan"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="touch-target p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-red-500"
                          aria-label="Hapus catatan"
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
        </section>

        {/* Row 4: Monthly Bar Chart & 100% Attendance Appreciation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Attendance Chart */}
          <section className="card-paper p-5 rounded-2xl space-y-3">
            <div>
              <h3 className="text-base font-bold font-heading text-[var(--ink)]">
                Grafik Ketidakhadiran Bulanan
              </h3>
              <p className="text-xs text-[var(--ink-muted)]">
                Jumlah kejadian izin, sakit, dan alpa per bulan
              </p>
            </div>
            <MonthlyBarChart data={data.monthlyChart} />
          </section>

          {/* 100% Attendance Appreciation Board */}
          <section className="card-paper p-5 rounded-2xl space-y-3 border-t-4 border-t-[var(--board)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold font-heading text-[var(--ink)]">
                    Apresiasi Kehadiran 100%
                  </h3>
                </div>
                <p className="text-xs text-[var(--ink-muted)]">
                  Siswa tanpa ketidakhadiran ({data.students100Percent.length} dari {data.totalClassStudents} siswa)
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold">
                Prestasi Sempurna
              </span>
            </div>

            <div className="border border-[var(--border)] rounded-xl max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
              {data.students100Percent.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                  Semua siswa memiliki catatan ketidakhadiran pada periode ini.
                </div>
              ) : (
                data.students100Percent.map((s, idx) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-[var(--board)] w-6 text-right">
                        {idx + 1}.
                      </span>
                      <div>
                        <p className="text-xs font-bold text-[var(--ink)]">{s.name}</p>
                        {s.nis && <p className="text-[11px] text-[var(--ink-subtle)]">NIS: {s.nis}</p>}
                      </div>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--board-light)] text-[var(--board)] font-semibold">
                      100% Hadir
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Sticky Mobile Quick Action Bar (antislop-layoutmobile) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 p-2.5 bg-[var(--surface)] border-t border-[var(--border)] shadow-lg flex items-center justify-around gap-2">
        <button
          type="button"
          onClick={() => {
            setEditRecord(null);
            setIsFormModalOpen(true);
          }}
          className="touch-target flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[var(--terracotta)] text-white text-xs font-bold shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>+ Catat Izin</span>
        </button>

        <button
          type="button"
          onClick={() => setShowFiltersMobile(!showFiltersMobile)}
          className="touch-target flex items-center justify-center p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-xs font-semibold"
          aria-label="Buka filter"
        >
          <Filter className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsModalOpen(true)}
          className="touch-target flex items-center justify-center p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-xs font-semibold"
          aria-label="Link wali murid"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Modals */}
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
        teacherName={user.displayName}
        onSuccess={() => router.refresh()}
      />

      <StudentRosterModal
        isOpen={isRosterModalOpen}
        onClose={() => setIsRosterModalOpen(false)}
        classId={data.classInfo.id}
        classNameTitle={data.classInfo.name}
        studentsList={data.studentsList}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
