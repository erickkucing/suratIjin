"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  School,
  Users,
  ShieldCheck,
  Plus,
  Edit2,
  ExternalLink,
  Lock,
  LogOut,
  Check,
  X,
  Loader2,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/actions/auth";
import {
  createTeacherAction,
  updateTeacherAction,
  createClassAction,
  updateClassAction,
} from "@/actions/admin";

interface AdminClientProps {
  initialClasses: any[];
  initialTeachers: any[];
  superadminName: string;
}

export function AdminClient({
  initialClasses,
  initialTeachers,
  superadminName,
}: AdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"classes" | "teachers">("classes");

  // Create Teacher Modal
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [teacherUsername, setTeacherUsername] = useState("");
  const [teacherDisplayName, setTeacherDisplayName] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");

  // Edit Teacher Modal
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [editTeacherName, setEditTeacherName] = useState("");
  const [editTeacherPassword, setEditTeacherPassword] = useState("");
  const [editTeacherActive, setEditTeacherActive] = useState(true);

  // Create Class Modal
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classNameInput, setClassNameInput] = useState("");
  const [classSlugInput, setClassSlugInput] = useState("");
  const [classYearInput, setClassYearInput] = useState("2026/2027");
  const [classPeriodInput, setClassPeriodInput] = useState("Semester Genap");
  const [classTeacherId, setClassTeacherId] = useState<number | null>(null);

  // Edit Class Modal
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [editClassName, setEditClassName] = useState("");
  const [editClassSlug, setEditClassSlug] = useState("");
  const [editClassYear, setEditClassYear] = useState("");
  const [editClassPeriod, setEditClassPeriod] = useState("");
  const [editClassTeacherId, setEditClassTeacherId] = useState<number | null>(null);
  const [editClassActive, setEditClassActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAlertMsg(null);
    try {
      const res = await createTeacherAction({
        username: teacherUsername,
        displayName: teacherDisplayName,
        password: teacherPassword,
      });
      if (!res.success) throw new Error(res.error);
      setAlertMsg({ text: "Wali Kelas berhasil ditambahkan.", isError: false });
      setIsTeacherModalOpen(false);
      setTeacherUsername("");
      setTeacherDisplayName("");
      setTeacherPassword("");
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal menambahkan guru.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setLoading(true);
    setAlertMsg(null);
    try {
      const res = await updateTeacherAction(
        editingTeacher.id,
        editTeacherName,
        editTeacherPassword || undefined,
        editTeacherActive
      );
      if (!res.success) throw new Error(res.error);
      setAlertMsg({ text: "Data Wali Kelas diperbarui.", isError: false });
      setEditingTeacher(null);
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal memperbarui guru.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAlertMsg(null);
    try {
      const res = await createClassAction({
        name: classNameInput,
        slug: classSlugInput,
        academicYear: classYearInput,
        periodTitle: classPeriodInput,
        waliKelasId: classTeacherId || undefined,
      });
      if (!res.success) throw new Error(res.error);
      setAlertMsg({ text: "Kelas baru berhasil dibuat.", isError: false });
      setIsClassModalOpen(false);
      setClassNameInput("");
      setClassSlugInput("");
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal membuat kelas.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    setLoading(true);
    setAlertMsg(null);
    try {
      const res = await updateClassAction(
        editingClass.id,
        editClassName,
        editClassSlug,
        editClassYear,
        editClassPeriod,
        editClassTeacherId,
        editClassActive
      );
      if (!res.success) throw new Error(res.error);
      setAlertMsg({ text: "Data kelas diperbarui.", isError: false });
      setEditingClass(null);
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal memperbarui kelas.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const totalStudentsOverall = initialClasses.reduce(
    (acc, c) => acc + Number(c.totalStudents || 0),
    0
  );
  const totalAbsencesOverall = initialClasses.reduce(
    (acc, c) => acc + Number(c.totalAbsences || 0),
    0
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[var(--ink)] pb-12">
      {/* Navbar */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3.5 border-b border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-600 text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold font-heading text-[var(--ink)]">
                Panel Superadmin
              </h1>
              <p className="text-xs text-[var(--ink-muted)]">
                Admin: {superadminName} &bull; Manajemen Multi-Kelas &amp; Wali Kelas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold"
            >
              <School className="w-4 h-4 text-[var(--board)]" />
              <span>Buka Dashboard</span>
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-[var(--ink-muted)] hover:text-red-600"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        {alertMsg && (
          <div
            className={`p-3.5 rounded-xl border text-sm font-semibold ${
              alertMsg.isError
                ? "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
                : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
            }`}
          >
            {alertMsg.text}
          </div>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="card-paper p-4 rounded-xl border-t-4 border-t-[var(--board)]">
            <span className="text-xs font-semibold uppercase text-[var(--ink-muted)]">Total Kelas</span>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)] mt-1">
              {initialClasses.length}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">Kelas terdaftar</p>
          </div>

          <div className="card-paper p-4 rounded-xl border-t-4 border-t-sky-600">
            <span className="text-xs font-semibold uppercase text-[var(--ink-muted)]">Total Wali Kelas</span>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)] mt-1">
              {initialTeachers.length}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">Guru berwenang</p>
          </div>

          <div className="card-paper p-4 rounded-xl border-t-4 border-t-emerald-600">
            <span className="text-xs font-semibold uppercase text-[var(--ink-muted)]">Total Siswa Aktif</span>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)] mt-1">
              {totalStudentsOverall}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">Seluruh kelas</p>
          </div>

          <div className="card-paper p-4 rounded-xl border-t-4 border-t-amber-600">
            <span className="text-xs font-semibold uppercase text-[var(--ink-muted)]">Total Catatan Ketidakhadiran</span>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)] mt-1">
              {totalAbsencesOverall}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">Arsip tersimpan</p>
          </div>
        </div>

        {/* Tab Header & Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("classes")}
              className={`pb-2 text-sm font-bold transition-colors border-b-2 ${
                activeTab === "classes"
                  ? "border-[var(--board)] text-[var(--board)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Manajemen Kelas ({initialClasses.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("teachers")}
              className={`pb-2 text-sm font-bold transition-colors border-b-2 ${
                activeTab === "teachers"
                  ? "border-[var(--board)] text-[var(--board)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Akun Wali Kelas ({initialTeachers.length})
            </button>
          </div>

          <div>
            {activeTab === "classes" ? (
              <button
                type="button"
                onClick={() => setIsClassModalOpen(true)}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-xs font-bold shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Buat Kelas Baru</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsTeacherModalOpen(true)}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--board)] text-white hover:bg-[var(--board-hover)] text-xs font-bold shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Wali Kelas</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: CLASSES TABLE */}
        {activeTab === "classes" && (
          <div className="card-paper rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-b border-[var(--border)] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Nama Kelas</th>
                    <th className="px-4 py-3">Slug Portal</th>
                    <th className="px-4 py-3">Tahun &amp; Periode</th>
                    <th className="px-4 py-3">Wali Kelas</th>
                    <th className="px-4 py-3 text-center">Siswa</th>
                    <th className="px-4 py-3 text-center">Ketidakhadiran</th>
                    <th className="px-4 py-3 text-center">Portal Wali Murid</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {initialClasses.map((c) => (
                    <tr key={c.id} className="hover:bg-[var(--canvas-subtle)] transition-colors">
                      <td className="px-4 py-3 font-bold text-[var(--ink)]">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--ink-muted)]">
                        {c.slug}
                      </td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">
                        {c.academicYear} &bull; {c.periodTitle}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                        {c.waliKelasName || (
                          <span className="text-amber-600 font-normal">Belum ditugaskan</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {c.totalStudents}
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {c.totalAbsences}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={`/portal/${c.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--board)] hover:underline font-semibold"
                        >
                          <span>/portal/{c.slug}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/dashboard?classId=${c.id}`}
                            className="p-1.5 rounded text-[var(--board)] hover:bg-[var(--board-light)] font-semibold"
                            title="Buka Dashboard Kelas"
                          >
                            Masuk
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClass(c);
                              setEditClassName(c.name);
                              setEditClassSlug(c.slug);
                              setEditClassYear(c.academicYear);
                              setEditClassPeriod(c.periodTitle);
                              setEditClassTeacherId(c.waliKelasId);
                              setEditClassActive(c.isActive);
                            }}
                            className="p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
                            title="Edit Pengaturan Kelas"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: TEACHERS TABLE */}
        {activeTab === "teachers" && (
          <div className="card-paper rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-b border-[var(--border)] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {initialTeachers.map((t) => (
                    <tr key={t.id} className="hover:bg-[var(--canvas-subtle)] transition-colors">
                      <td className="px-4 py-3 font-bold text-[var(--ink)]">
                        {t.displayName}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--ink-muted)]">
                        {t.username}
                      </td>
                      <td className="px-4 py-3 uppercase text-[11px] font-semibold text-[var(--ink-muted)]">
                        {t.role}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            t.isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          {t.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTeacher(t);
                            setEditTeacherName(t.displayName);
                            setEditTeacherPassword("");
                            setEditTeacherActive(t.isActive);
                          }}
                          className="p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--board)]"
                          title="Edit Wali Kelas"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* CREATE TEACHER MODAL */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold font-heading">Tambah Akun Wali Kelas</h3>
              <button
                type="button"
                onClick={() => setIsTeacherModalOpen(false)}
                className="p-1 rounded text-[var(--ink-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTeacher} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Nama Lengkap &amp; Gelar
                </label>
                <input
                  type="text"
                  required
                  value={teacherDisplayName}
                  onChange={(e) => setTeacherDisplayName(e.target.value)}
                  placeholder="Contoh: Erick S.Kom"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Username Login
                </label>
                <input
                  type="text"
                  required
                  value={teacherUsername}
                  onChange={(e) => setTeacherUsername(e.target.value)}
                  placeholder="Contoh: erick"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Password Awal (Min. 6 Karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--board)] text-white text-xs font-bold"
                >
                  {loading ? "Menyimpan..." : "Buat Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TEACHER MODAL */}
      {editingTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold font-heading">
                Edit Wali Kelas: {editingTeacher.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="p-1 rounded text-[var(--ink-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateTeacher} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={editTeacherName}
                  onChange={(e) => setEditTeacherName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Reset Password Baru (Opsional)
                </label>
                <input
                  type="password"
                  value={editTeacherPassword}
                  onChange={(e) => setEditTeacherPassword(e.target.value)}
                  placeholder="Kosongkan jika password tidak diubah"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="teacher-active-check"
                  checked={editTeacherActive}
                  onChange={(e) => setEditTeacherActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--board)]"
                />
                <label htmlFor="teacher-active-check" className="text-xs font-semibold">
                  Akun Aktif (Dapat Login)
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--board)] text-white text-xs font-bold"
                >
                  {loading ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE CLASS MODAL */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold font-heading">Buat Kelas Baru</h3>
              <button
                type="button"
                onClick={() => setIsClassModalOpen(false)}
                className="p-1 rounded text-[var(--ink-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Nama Kelas
                </label>
                <input
                  type="text"
                  required
                  value={classNameInput}
                  onChange={(e) => {
                    setClassNameInput(e.target.value);
                    if (!classSlugInput) {
                      setClassSlugInput(
                        e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")
                      );
                    }
                  }}
                  placeholder="Contoh: XII TKJ 2"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Slug URL Portal (Huruf kecil, angka, strip)
                </label>
                <input
                  type="text"
                  required
                  value={classSlugInput}
                  onChange={(e) => setClassSlugInput(e.target.value)}
                  placeholder="Contoh: xii-tkj-2"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    required
                    value={classYearInput}
                    onChange={(e) => setClassYearInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                    Periode / Semester
                  </label>
                  <input
                    type="text"
                    required
                    value={classPeriodInput}
                    onChange={(e) => setClassPeriodInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Tugaskan Wali Kelas
                </label>
                <select
                  value={classTeacherId || ""}
                  onChange={(e) =>
                    setClassTeacherId(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                >
                  <option value="">-- Pilih Guru --</option>
                  {initialTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName} ({t.username})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--board)] text-white text-xs font-bold"
                >
                  {loading ? "Menyimpan..." : "Buat Kelas"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CLASS MODAL */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold font-heading">
                Edit Kelas: {editingClass.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingClass(null)}
                className="p-1 rounded text-[var(--ink-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Nama Kelas
                </label>
                <input
                  type="text"
                  required
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Slug Portal
                </label>
                <input
                  type="text"
                  required
                  value={editClassSlug}
                  onChange={(e) => setEditClassSlug(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    required
                    value={editClassYear}
                    onChange={(e) => setEditClassYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                    Periode / Semester
                  </label>
                  <input
                    type="text"
                    required
                    value={editClassPeriod}
                    onChange={(e) => setEditClassPeriod(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--ink-muted)] mb-1">
                  Wali Kelas Ditugaskan
                </label>
                <select
                  value={editClassTeacherId || ""}
                  onChange={(e) =>
                    setEditClassTeacherId(
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"
                >
                  <option value="">-- Pilih Guru --</option>
                  {initialTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName} ({t.username})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="class-active-check"
                  checked={editClassActive}
                  onChange={(e) => setEditClassActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--board)]"
                />
                <label htmlFor="class-active-check" className="text-xs font-semibold">
                  Kelas Aktif
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--board)] text-white text-xs font-bold"
                >
                  {loading ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
