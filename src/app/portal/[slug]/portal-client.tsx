"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  School,
  Lock,
  ArrowRight,
  Eye,
  Award,
  Search,
  AlertCircle,
  Loader2,
  FileCheck2,
  FileX2,
} from "lucide-react";
import { DashboardData, AttendanceRecordWithStudent } from "@/db/queries";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatCard } from "@/components/stat-card";
import { MonthlyBarChart } from "@/components/monthly-bar-chart";
import { LetterLightboxModal } from "@/components/letter-lightbox-modal";
import { parentUnlockAction } from "@/actions/auth";
import { computeDynamicDashboardMetrics } from "@/lib/attendance-stats";

interface PortalClientProps {
  isUnlocked: boolean;
  classSlug: string;
  data?: DashboardData | null;
  teacherName?: string;
  classNameTitle?: string;
  academicYear?: string;
  logoUrl?: string | null;
}

export function PortalClient({
  isUnlocked,
  classSlug,
  data,
  teacherName = "Wali Kelas",
  classNameTitle = "Kelas",
  academicYear = "2026/2027",
  logoUrl,
}: PortalClientProps) {
  const router = useRouter();

  const [passwordInput, setPasswordInput] = useState("");
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const [filterStudent, setFilterStudent] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [filterLetterStatus, setFilterLetterStatus] = useState("Semua");
  const [viewMode, setViewMode] = useState<"harian" | "rapor">("harian");

  const [lightboxRecord, setLightboxRecord] = useState<AttendanceRecordWithStudent | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const dynamicMetrics = useMemo(() => {
    if (!data) return null;
    return computeDynamicDashboardMetrics({
      studentsList: data.studentsList,
      records: data.records,
      dateStart: filterDateStart || undefined,
      dateEnd: filterDateEnd || undefined,
    });
  }, [data, filterDateStart, filterDateEnd]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setGateLoading(true);
    setGateError(null);

    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classSlug, password: passwordInput }),
      });
      const resData = await res.json().catch(() => null);

      if (!resData || !resData.success) {
        setGateError(resData?.error || "Password salah. Silakan tanyakan kepada Wali Kelas.");
        return;
      }
      router.refresh();
    } catch {
      try {
        const res = await parentUnlockAction(classSlug, passwordInput);
        if (!res.success) {
          setGateError(res.error || "Password salah. Silakan tanyakan kepada Wali Kelas.");
          return;
        }
        router.refresh();
      } catch (err: unknown) {
        setGateError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi.");
      }
    } finally {
      setGateLoading(false);
    }
  };

  if (!isUnlocked || !data || !dynamicMetrics) {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-[var(--canvas)] text-[var(--ink)]">
        <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]">
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
            <div>
              <h1 className="text-base font-bold font-heading text-[var(--ink)]">
                Portal Informasi Wali Murid
              </h1>
              <p className="text-xs text-[var(--ink-muted)]">Papan Presensi &amp; Rekap Ketidakhadiran</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md card-journal-elevated rounded-2xl overflow-hidden border border-[var(--border)]">
            <div className="px-6 pt-8 pb-2 text-center bg-[var(--surface)]">
              <div className="inline-flex p-3 rounded-2xl bg-[var(--primary-light)] text-[var(--primary)] mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-heading text-[var(--ink)]">Akses Kelas {classNameTitle}</h2>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Tahun Ajaran {academicYear} &bull; Wali Kelas: {teacherName}
              </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6 bg-[var(--surface)]">
              {gateError && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{gateError}</span>
                </div>
              )}

              <form onSubmit={handleUnlock} className="space-y-4">
                <div>
                  <label
                    htmlFor="parent-password-input"
                    className="block text-xs font-semibold text-[var(--ink-muted)] mb-1.5"
                  >
                    Kata Sandi Akses Kelas
                  </label>
                  <input
                    id="parent-password-input"
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Masukkan kata sandi dari Wali Kelas..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                    Kata sandi dibagikan oleh Wali Kelas melalui grup WhatsApp resmi.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={gateLoading}
                  className="touch-target w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-sm font-bold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50 transition-colors"
                >
                  {gateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Buka Papan Presensi</span>
                </button>
              </form>

              <div className="pt-3 border-t border-[var(--border)] text-center">
                <Link
                  href="/login"
                  className="text-xs text-[var(--accent-slate)] hover:underline"
                >
                  Login Staf Pengajar / Wali Kelas &rarr;
                </Link>
              </div>
            </div>
          </div>
        </main>

        <footer className="py-4 text-center text-xs text-[var(--ink-muted)]">
          &copy; {new Date().getFullYear()} Sistem Surat Izin &amp; Ketidakhadiran Siswa.
        </footer>
      </div>
    );
  }

  const displayedRecords = data.records.filter((r) => {
    if (filterStudent && !r.studentName.toLowerCase().includes(filterStudent.toLowerCase())) {
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
    }
    return true;
  });

  const displayedStudentRecap = dynamicMetrics.studentRecap.filter((st) => {
    if (
      filterStudent &&
      !st.name.toLowerCase().includes(filterStudent.toLowerCase()) &&
      !(st.nis && st.nis.toLowerCase().includes(filterStudent.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  const allowsLetterPhoto = data.classInfo.parentShowLetterFile;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[var(--ink)] pb-12">
      <header className="px-4 sm:px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
              <div className="p-2.5 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs flex items-center justify-center shrink-0">
                <School className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold font-heading text-[var(--ink)]">
                  Papan Presensi Kelas {data.classInfo.name}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--primary-light)] text-[var(--primary)] font-semibold">
                  {data.classInfo.periodTitle}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                Wali Kelas: {teacherName} &bull; Tahun Ajaran: {data.classInfo.academicYear}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        <section aria-labelledby="portal-summary-heading">
          <h2 id="portal-summary-heading" className="sr-only">Ringkasan Statistik</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Total Alpa"
              count={dynamicMetrics.summary.totalAlpa}
              description="Tanpa keterangan"
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
              description="Izin keperluan keluarga"
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
              description="Keterangan sakit"
              accentColor="sakit"
              isActive={filterStatus === "Sakit"}
              onClick={() => {
                setFilterStatus(filterStatus === "Sakit" ? "Semua" : "Sakit");
                setFilterLetterStatus("Semua");
                setViewMode("harian");
              }}
            />
            <StatCard
              title="Surat Belum"
              count={dynamicMetrics.summary.totalSuratBelum}
              description="Menunggu kelengkapan bukti"
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

        <section className="card-paper p-4 rounded-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
              <input
                type="text"
                aria-label="Cari nama putra atau putri Anda"
                value={filterStudent}
                onChange={(e) => setFilterStudent(e.target.value)}
                placeholder="Cari nama putra/putri Anda..."
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

            <div className="flex items-center gap-2">
              <select
                aria-label="Filter status kehadiran"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 h-9 px-3 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              >
                <option value="Semua">Semua Status</option>
                <option value="Izin">Izin</option>
                <option value="Sakit">Sakit</option>
                <option value="Alpa">Alpa</option>
              </select>

              {(filterStudent || filterDateStart || filterDateEnd || filterStatus !== "Semua" || filterLetterStatus !== "Semua") && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterStudent("");
                    setFilterDateStart("");
                    setFilterDateEnd("");
                    setFilterStatus("Semua");
                    setFilterLetterStatus("Semua");
                  }}
                  className="h-9 px-3 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)] shrink-0 transition-colors"
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
              <h3 id="portal-table-heading" className="text-sm font-bold font-heading text-[var(--ink)]">
                {viewMode === "harian"
                  ? `Rekap Ketidakhadiran Siswa (${displayedRecords.length} Data)`
                  : `Rekap Per Siswa (${displayedStudentRecap.length} Siswa Aktif)`}
              </h3>
              <span className="text-xs text-[var(--ink-muted)]">
                {allowsLetterPhoto
                  ? "Foto surat dapat ditinjau"
                  : "Privasi foto surat dilindungi oleh Wali Kelas"}
              </span>
            </div>

            <div
              role="tablist"
              aria-label="Mode tampilan tabel"
              className="inline-flex p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] self-start sm:self-center"
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
          </div>

          {viewMode === "harian" ? (
            <>
              <div
                role="region"
                aria-labelledby="portal-table-heading"
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
                      <th scope="col" className="px-4 py-3 w-32 text-center">Status Surat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {displayedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-muted)]">
                          Tidak ada catatan ketidakhadiran yang cocok.
                        </td>
                      </tr>
                    ) : (
                      displayedRecords.map((r, idx) => {
                        const hasFile = !!r.letterFilePath;
                        return (
                          <tr key={r.id} className="hover:bg-[var(--canvas-subtle)] transition-colors">
                            <td className="px-4 py-3 text-center text-[var(--ink-subtle)] font-mono">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{r.attendanceDate}</td>
                            <td className="px-4 py-3 font-semibold">{r.studentName}</td>
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
                            <td className="px-4 py-3 text-[var(--ink-muted)]">{r.infoSource}</td>
                            <td className="px-4 py-3 text-[var(--ink-muted)] max-w-xs truncate">
                              {r.description || "-"}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {hasFile && allowsLetterPhoto ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLightboxRecord(r);
                                    setIsLightboxOpen(true);
                                  }}
                                  className="touch-target inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--accent-slate)]"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Lihat Surat</span>
                                </button>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                    r.letterStatus === "Sudah"
                                      ? "text-[var(--status-success-fg)]"
                                      : r.status === "Alpa"
                                      ? "text-[var(--ink-subtle)]"
                                      : "text-[var(--primary)]"
                                  }`}
                                >
                                  {r.letterStatus === "Sudah" ? (
                                    <>
                                      <FileCheck2 className="w-3.5 h-3.5" />
                                      <span>Sudah Ada</span>
                                    </>
                                  ) : r.status === "Alpa" ? (
                                    <span>-</span>
                                  ) : (
                                    <>
                                      <FileX2 className="w-3.5 h-3.5" />
                                      <span>Belum Ada</span>
                                    </>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-[var(--border)]">
                {displayedRecords.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                    Tidak ada data ketidakhadiran yang cocok.
                  </div>
                ) : (
                  displayedRecords.map((r) => {
                    const hasFile = !!r.letterFilePath;
                    return (
                      <div key={r.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-[var(--ink)]">{r.studentName}</h4>
                            <p className="text-xs text-[var(--ink-muted)]">
                              {r.attendanceDate} &bull; Info: {r.infoSource}
                            </p>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
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
                          <span className="text-xs text-[var(--ink-muted)]">Bukti Surat:</span>
                          {hasFile && allowsLetterPhoto ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLightboxRecord(r);
                                setIsLightboxOpen(true);
                              }}
                              className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--accent-slate)]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Surat</span>
                            </button>
                          ) : (
                            <span
                              className={`text-xs font-semibold ${
                                r.letterStatus === "Sudah"
                                  ? "text-[var(--status-success-fg)]"
                                  : r.status === "Alpa"
                                  ? "text-[var(--ink-subtle)]"
                                  : "text-[var(--primary)]"
                              }`}
                            >
                              {r.letterStatus === "Sudah" ? "Sudah Ada" : r.status === "Alpa" ? "Tanpa Surat" : "Belum Ada"}
                            </span>
                          )}
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
                aria-labelledby="portal-table-heading"
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
                              <span className="px-2.5 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] text-[11px]">
                                100% Hadir
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

              <div className="md:hidden divide-y divide-[var(--border)]">
                {displayedStudentRecap.map((st, idx) => (
                  <div key={st.studentId} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-[var(--ink)]">
                          {idx + 1}. {st.name}
                        </p>
                        <p className="text-xs text-[var(--ink-muted)]">NIS: {st.nis || "-"}</p>
                      </div>
                      {st.totalAbsences === 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)] text-xs font-bold">
                          100% Hadir
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--canvas-subtle)] text-[var(--ink)] text-xs font-bold border border-[var(--border)]">
                          Total: {st.totalAbsences} Hari
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                      <div className="p-1.5 rounded-lg bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)]">
                        Sakit: <strong>{st.sakit}</strong>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)]">
                        Izin: <strong>{st.izin}</strong>
                      </div>
                      <div className="p-1.5 rounded-lg bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)]">
                        Alpa: <strong>{st.alpa}</strong>
                      </div>
                    </div>
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
                Statistik izin, sakit, dan alpa siswa kelas {data.classInfo.name}
              </p>
            </div>
            <MonthlyBarChart data={dynamicMetrics.monthlyChart} />
          </section>

          <section className="card-paper p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600" />
                  <h3 className="text-base font-bold font-heading text-[var(--ink)]">
                    Apresiasi Kehadiran 100%
                  </h3>
                </div>
                <p className="text-xs text-[var(--ink-muted)]">
                  Siswa dengan rekor kehadiran sempurna ({dynamicMetrics.students100Percent.length} dari {data.totalClassStudents} siswa)
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--status-apresiasi-bg)] text-[var(--status-apresiasi-fg)] border border-[var(--status-apresiasi-border)] font-bold">
                Hadir 100%
              </span>
            </div>

            <div className="border border-[var(--border)] rounded-xl max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
              {dynamicMetrics.students100Percent.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                  Semua siswa tercatat memiliki izin, sakit, atau alpa pada periode ini.
                </div>
              ) : (
                dynamicMetrics.students100Percent.map((s, idx) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-[var(--primary)] w-6 text-right">
                        {idx + 1}.
                      </span>
                      <p className="text-xs font-bold text-[var(--ink)]">{s.name}</p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--primary-light)] text-[var(--primary)] font-semibold">
                      Sempurna
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

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
    </div>
  );
}
