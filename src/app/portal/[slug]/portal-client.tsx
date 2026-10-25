"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  School,
  Lock,
  ArrowRight,
  Eye,
  Award,
  Search,
  Calendar,
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

interface PortalClientProps {
  isUnlocked: boolean;
  classSlug: string;
  data?: DashboardData | null;
  teacherName?: string;
  classNameTitle?: string;
  academicYear?: string;
}

export function PortalClient({
  isUnlocked,
  classSlug,
  data,
  teacherName = "Wali Kelas",
  classNameTitle = "Kelas",
  academicYear = "2026/2027",
}: PortalClientProps) {
  const router = useRouter();

  // Password gate state
  const [passwordInput, setPasswordInput] = useState("");
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Filter state for unlocked board
  const [filterStudent, setFilterStudent] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterStatus, setFilterStatus] = useState("Semua");

  // Lightbox modal state
  const [lightboxRecord, setLightboxRecord] = useState<AttendanceRecordWithStudent | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setGateLoading(true);
    setGateError(null);

    try {
      const res = await parentUnlockAction(classSlug, passwordInput);
      if (!res.success) {
        setGateError(res.error || "Password salah. Silakan tanyakan kepada Wali Kelas.");
        return;
      }
      router.refresh();
    } catch (err: unknown) {
      setGateError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi.");
    } finally {
      setGateLoading(false);
    }
  };

  // If not unlocked, render the Class Password Gate
  if (!isUnlocked || !data) {
    return (
      <div className="min-h-screen flex flex-col justify-between bg-[var(--canvas)] text-[var(--ink)]">
        <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--board)] text-white shadow-xs">
              <School className="w-5 h-5" />
            </div>
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
          <div className="w-full max-w-md card-paper-elevated rounded-2xl overflow-hidden">
            <div className="p-6 bg-[var(--board)] text-white text-center">
              <div className="inline-flex p-3 rounded-full bg-white/10 mb-2">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold font-heading">Akses Kelas {classNameTitle}</h2>
              <p className="mt-1 text-xs text-emerald-100">
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
                    className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5"
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
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
                  />
                  <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                    Kata sandi dibagikan oleh Wali Kelas melalui grup WhatsApp resmi.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={gateLoading}
                  className="touch-target w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-sm font-bold shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] disabled:opacity-50"
                >
                  {gateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Buka Papan Presensi</span>
                </button>
              </form>

              <div className="pt-3 border-t border-[var(--border)] text-center">
                <Link
                  href="/login"
                  className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] underline"
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

  // UNLOCKED: Read-Only Parent Portal Board
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
    return true;
  });

  const allowsLetterPhoto = data.classInfo.parentShowLetterFile;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[var(--ink)] pb-12">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--board)] text-white shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold font-heading text-[var(--ink)]">
                  Papan Presensi Kelas {data.classInfo.name}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--board-light)] text-[var(--board)] font-bold">
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

      {/* Main Content */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {/* Summary Strip */}
        <section aria-labelledby="portal-summary-heading">
          <h2 id="portal-summary-heading" className="sr-only">Ringkasan Statistik</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="Total Alpa"
              count={data.summary.totalAlpa}
              description="Tanpa keterangan"
              accentColor="alpa"
              isActive={filterStatus === "Alpa"}
              onClick={() => setFilterStatus(filterStatus === "Alpa" ? "Semua" : "Alpa")}
            />
            <StatCard
              title="Total Izin"
              count={data.summary.totalIzin}
              description="Izin keperluan keluarga"
              accentColor="izin"
              isActive={filterStatus === "Izin"}
              onClick={() => setFilterStatus(filterStatus === "Izin" ? "Semua" : "Izin")}
            />
            <StatCard
              title="Total Sakit"
              count={data.summary.totalSakit}
              description="Keterangan sakit"
              accentColor="sakit"
              isActive={filterStatus === "Sakit"}
              onClick={() => setFilterStatus(filterStatus === "Sakit" ? "Semua" : "Sakit")}
            />
            <StatCard
              title="Surat Belum"
              count={data.summary.totalSuratBelum}
              description="Menunggu kelengkapan bukti"
              accentColor="warning"
              isActive={false}
              onClick={() => {}}
            />
          </div>
        </section>

        {/* Filter Bar */}
        <section className="card-paper p-4 rounded-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
              <input
                type="text"
                value={filterStudent}
                onChange={(e) => setFilterStudent(e.target.value)}
                placeholder="Cari nama putra/putri Anda..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
            </div>

            <div>
              <input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                title="Tanggal Mulai"
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
            </div>

            <div>
              <input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                title="Tanggal Selesai"
                className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)]"
              >
                <option value="Semua">Semua Status</option>
                <option value="Izin">Izin</option>
                <option value="Sakit">Sakit</option>
                <option value="Alpa">Alpa</option>
              </select>

              {(filterStudent || filterDateStart || filterDateEnd || filterStatus !== "Semua") && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterStudent("");
                    setFilterDateStart("");
                    setFilterDateEnd("");
                    setFilterStatus("Semua");
                  }}
                  className="touch-target px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Absence Table */}
        <section className="card-paper rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--canvas-subtle)]">
            <h3 className="text-sm font-bold font-heading text-[var(--ink)]">
              Rekap Ketidakhadiran Siswa ({displayedRecords.length} Data)
            </h3>
            <span className="text-xs text-[var(--ink-muted)]">
              {allowsLetterPhoto
                ? "Foto surat dapat ditinjau"
                : "Privasi foto surat dilindungi oleh Wali Kelas"}
            </span>
          </div>

          {/* Desktop Table */}
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
                              className="touch-target inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--board)]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Surat</span>
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                r.letterStatus === "Sudah"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : r.status === "Alpa"
                                  ? "text-[var(--ink-subtle)]"
                                  : "text-[var(--terracotta)]"
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

          {/* Mobile Card List */}
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
                          className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--board)]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Surat</span>
                        </button>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${
                            r.letterStatus === "Sudah"
                              ? "text-emerald-600"
                              : r.status === "Alpa"
                              ? "text-[var(--ink-subtle)]"
                              : "text-[var(--terracotta)]"
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
        </section>

        {/* Monthly Chart and 100% Attendance Appreciation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card-paper p-5 rounded-2xl space-y-3">
            <div>
              <h3 className="text-base font-bold font-heading text-[var(--ink)]">
                Grafik Ketidakhadiran Bulanan
              </h3>
              <p className="text-xs text-[var(--ink-muted)]">
                Statistik izin, sakit, dan alpa siswa kelas {data.classInfo.name}
              </p>
            </div>
            <MonthlyBarChart data={data.monthlyChart} />
          </section>

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
                  Siswa dengan rekor kehadiran sempurna ({data.students100Percent.length} dari {data.totalClassStudents} siswa)
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold">
                Hadir 100%
              </span>
            </div>

            <div className="border border-[var(--border)] rounded-xl max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
              {data.students100Percent.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--ink-muted)]">
                  Semua siswa tercatat memiliki izin, sakit, atau alpa pada periode ini.
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
                      <p className="text-xs font-bold text-[var(--ink)]">{s.name}</p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--board-light)] text-[var(--board)] font-semibold">
                      Sempurna
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Lightbox Modal */}
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
