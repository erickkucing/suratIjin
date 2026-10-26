"use client";

import { useState, useEffect } from "react";
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
  Palette,
  Image as ImageIcon,
  Upload,
  Trash2,
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  Database,
  Server,
  Wifi,
  RefreshCw,
  Play,
  Terminal,
  ArrowRightLeft,
  HardDrive,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/actions/auth";
import {
  createTeacherAction,
  updateTeacherAction,
  createClassAction,
  updateClassAction,
} from "@/actions/admin";
import { toTitleCase, generateRandomClassCode } from "@/lib/string-utils";
import {
  updateThemeAction,
  uploadLogoAction,
  removeLogoAction,
  updateAppNameAction,
} from "@/actions/system-settings";
import {
  getCurrentDatabaseInfoAction,
  testDatabaseConnectionAction,
  migrateDatabaseAction,
  applyActiveDatabaseAction,
  revertToLocalDatabaseAction,
} from "@/actions/database-admin";
import {
  parseDbUrl,
  buildDbUrl,
  RemoteDbConfig,
  ConnectionTestResult,
} from "@/lib/db-remote-utils";
import { getAutoAcademicPeriod } from "@/lib/academic-year";
import {
  THEME_PRESETS,
  ThemeColor,
  SystemSettingsData,
} from "@/lib/system-settings-constants";

interface AdminClientProps {
  initialClasses: any[];
  initialTeachers: any[];
  initialSettings: SystemSettingsData;
  superadminName: string;
}

export function AdminClient({
  initialClasses,
  initialTeachers,
  initialSettings,
  superadminName,
}: AdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"classes" | "teachers" | "settings" | "database">("classes");

  const [appNameInput, setAppNameInput] = useState(
    initialSettings?.appName || "Sistem Surat Izin Siswa"
  );
  const [appNameLoading, setAppNameLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeColor>(initialSettings?.themeColor || "terracotta");
  const [logoPreview, setLogoPreview] = useState<string | null>(initialSettings?.logoUrl || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [themeLoading, setThemeLoading] = useState(false);

  // Database Tab States
  const [activeDbInfo, setActiveDbInfo] = useState<{
    currentUri: string;
    host: string;
    port: number;
    database: string;
    user: string;
    isLocal: boolean;
    isConnected: boolean;
    latencyMs?: number;
    serverVersion?: string;
    error?: string;
  } | null>(null);
  const [dbInfoLoading, setDbInfoLoading] = useState(false);

  const [dbInputMode, setDbInputMode] = useState<"fields" | "uri">("fields");
  const [remoteHost, setRemoteHost] = useState("");
  const [remotePort, setRemotePort] = useState(3306);
  const [remoteUser, setRemoteUser] = useState("root");
  const [remotePassword, setRemotePassword] = useState("");
  const [showRemotePassword, setShowRemotePassword] = useState(false);
  const [remoteDatabase, setRemoteDatabase] = useState("");
  const [remoteSsl, setRemoteSsl] = useState(false);
  const [remoteUri, setRemoteUri] = useState("");

  const [copyDataOption, setCopyDataOption] = useState(true);
  const [dropTablesOption, setDropTablesOption] = useState(false);

  const [testDbLoading, setTestDbLoading] = useState(false);
  const [testDbResult, setTestDbResult] = useState<ConnectionTestResult | null>(null);

  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    logs?: string[];
    stats?: any;
    error?: string;
  } | null>(null);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);

  const [applyLoading, setApplyLoading] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);

  // Create Teacher Modal
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [teacherUsername, setTeacherUsername] = useState("");
  const [teacherDisplayName, setTeacherDisplayName] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherPasswordConfirm, setTeacherPasswordConfirm] = useState("");
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [showTeacherPasswordConfirm, setShowTeacherPasswordConfirm] = useState(false);
  const [teacherClassId, setTeacherClassId] = useState<number | null>(null);

  // Edit Teacher Modal
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [editTeacherName, setEditTeacherName] = useState("");
  const [editTeacherPassword, setEditTeacherPassword] = useState("");
  const [editTeacherPasswordConfirm, setEditTeacherPasswordConfirm] = useState("");
  const [showEditTeacherPassword, setShowEditTeacherPassword] = useState(false);
  const [showEditTeacherPasswordConfirm, setShowEditTeacherPasswordConfirm] = useState(false);
  const [editTeacherActive, setEditTeacherActive] = useState(true);
  const [editTeacherClassId, setEditTeacherClassId] = useState<number | null>(null);

  // Create Class Modal
  const defaultPeriod = getAutoAcademicPeriod();
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classNameInput, setClassNameInput] = useState("");
  const [classSlugInput, setClassSlugInput] = useState("");
  const [classYearInput, setClassYearInput] = useState<string>(defaultPeriod.academicYear);
  const [classPeriodInput, setClassPeriodInput] = useState<string>(defaultPeriod.periodTitle);
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

  useEffect(() => {
    const anyModalOpen =
      isTeacherModalOpen ||
      Boolean(editingTeacher) ||
      isClassModalOpen ||
      Boolean(editingClass) ||
      isApplyModalOpen ||
      isRevertModalOpen;
    if (!anyModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsTeacherModalOpen(false);
        setEditingTeacher(null);
        setIsClassModalOpen(false);
        setEditingClass(null);
        setIsApplyModalOpen(false);
        setIsRevertModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isTeacherModalOpen,
    editingTeacher,
    isClassModalOpen,
    editingClass,
    isApplyModalOpen,
    isRevertModalOpen,
  ]);

  const loadActiveDbInfo = async () => {
    setDbInfoLoading(true);
    try {
      const res = await getCurrentDatabaseInfoAction();
      if (res.success && res.data) {
        setActiveDbInfo(res.data);
      }
    } catch (e) {
      console.error("Gagal memuat info database:", e);
    } finally {
      setDbInfoLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "database") {
      loadActiveDbInfo();
    }
  }, [activeTab]);

  const handleFieldChange = (
    field: "host" | "port" | "user" | "password" | "database" | "ssl",
    val: any
  ) => {
    const nextConfig: RemoteDbConfig = {
      host: field === "host" ? val : remoteHost,
      port: field === "port" ? val : remotePort,
      user: field === "user" ? val : remoteUser,
      password: field === "password" ? val : remotePassword,
      database: field === "database" ? val : remoteDatabase,
      ssl: field === "ssl" ? val : remoteSsl,
    };
    if (field === "host") setRemoteHost(val);
    if (field === "port") setRemotePort(val);
    if (field === "user") setRemoteUser(val);
    if (field === "password") setRemotePassword(val);
    if (field === "database") setRemoteDatabase(val);
    if (field === "ssl") setRemoteSsl(val);

    const generatedUri = buildDbUrl(nextConfig);
    setRemoteUri(generatedUri);
  };

  const handleUriChange = (val: string) => {
    setRemoteUri(val);
    if (val.trim()) {
      const parsed = parseDbUrl(val);
      if (parsed.host) setRemoteHost(parsed.host);
      if (parsed.port) setRemotePort(parsed.port);
      if (parsed.user) setRemoteUser(parsed.user);
      if (parsed.password !== undefined) setRemotePassword(parsed.password);
      if (parsed.database) setRemoteDatabase(parsed.database);
      setRemoteSsl(Boolean(parsed.ssl));
    }
  };

  const getRemoteConfig = (): RemoteDbConfig => {
    if (dbInputMode === "uri" && remoteUri.trim()) {
      return { connectionUri: remoteUri.trim() };
    }
    return {
      host: remoteHost.trim(),
      port: remotePort,
      user: remoteUser.trim(),
      password: remotePassword,
      database: remoteDatabase.trim(),
      ssl: remoteSsl,
      connectionUri: remoteUri.trim() || undefined,
    };
  };

  const handleTestConnection = async () => {
    setTestDbLoading(true);
    setTestDbResult(null);
    try {
      const config = getRemoteConfig();
      const res = await testDatabaseConnectionAction(config);
      setTestDbResult(res);
      if (res.success) {
        setAlertMsg({
          text: `Tes koneksi berhasil! Latensi: ${res.latencyMs}ms (${res.serverVersion || "MySQL/MariaDB"})`,
          isError: false,
        });
      } else {
        setAlertMsg({
          text: `Tes koneksi gagal: ${res.error}`,
          isError: true,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menguji koneksi.";
      setTestDbResult({ success: false, error: msg });
      setAlertMsg({ text: msg, isError: true });
    } finally {
      setTestDbLoading(false);
    }
  };

  const handleRunMigration = async () => {
    setMigrationLoading(true);
    setMigrationResult(null);
    setMigrationLogs([
      "Memulai persiapan migrasi database...",
      `Target: ${remoteHost || "remote database"} (Port: ${remotePort || 3306}, Database: ${remoteDatabase || "-"})`,
      "Menguji otentikasi koneksi remote...",
    ]);
    try {
      const config = getRemoteConfig();
      setMigrationLogs((prev) => [
        ...prev,
        "Koneksi terhubung. Menjalankan DDL 5 tabel utama:",
        " -> 1. users (pengguna & superadmin)",
        " -> 2. classes (kelas belajar)",
        " -> 3. students (daftar siswa & NISN)",
        " -> 4. attendance_records (arsip ketidakhadiran & lampiran)",
        " -> 5. system_settings (pengaturan global & tema)",
        copyDataOption
          ? "Opsi replikasi data lokal: AKTIF. Mengekstrak dan menyalin data..."
          : "Opsi replikasi data: NONAKTIF. Hanya membuat struktur tabel kosong.",
      ]);

      const res = await migrateDatabaseAction(config, {
        copyExistingData: copyDataOption,
        dropExistingTables: dropTablesOption,
      });

      setMigrationResult(res);
      if (res.success) {
        if (res.logs && res.logs.length > 0) {
          setMigrationLogs(res.logs);
        } else {
          setMigrationLogs((prev) => [
            ...prev,
            "✓ Seluruh skema tabel dan replikasi data berhasil diselesaikan tanpa error.",
          ]);
        }
        setAlertMsg({
          text: "Migrasi skema database berhasil dieksekusi tanpa error!",
          isError: false,
        });
      } else {
        if (res.logs && res.logs.length > 0) {
          setMigrationLogs(res.logs);
        } else {
          setMigrationLogs((prev) => [
            ...prev,
            `✗ Gagal mengeksekusi migrasi: ${res.error}`,
          ]);
        }
        setAlertMsg({
          text: `Migrasi gagal: ${res.error}`,
          isError: true,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menjalankan migrasi.";
      setMigrationResult({ success: false, error: msg });
      setMigrationLogs((prev) => [...prev, `✗ Error tidak terduga: ${msg}`]);
      setAlertMsg({ text: msg, isError: true });
    } finally {
      setMigrationLoading(false);
    }
  };

  const handleApplyActiveDatabase = async () => {
    setApplyLoading(true);
    try {
      const config = getRemoteConfig();
      const res = await applyActiveDatabaseAction(config);
      if (res.success) {
        setIsApplyModalOpen(false);
        setAlertMsg({
          text: res.message || "Database remote berhasil dijadikan database utama aplikasi!",
          isError: false,
        });
        await loadActiveDbInfo();
        router.refresh();
      } else {
        setAlertMsg({
          text: `Gagal mengubah database utama: ${res.error}`,
          isError: true,
        });
      }
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal mengalihkan database.",
        isError: true,
      });
    } finally {
      setApplyLoading(false);
    }
  };

  const handleRevertToLocal = async () => {
    setRevertLoading(true);
    try {
      const res = await revertToLocalDatabaseAction();
      if (res.success) {
        setIsRevertModalOpen(false);
        setAlertMsg({
          text: res.message || "Aplikasi berhasil dikembalikan ke database lokal.",
          isError: false,
        });
        await loadActiveDbInfo();
        router.refresh();
      } else {
        setAlertMsg({
          text: `Gagal mengembalikan ke database lokal: ${res.error}`,
          isError: true,
        });
      }
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal mengembalikan ke database lokal.",
        isError: true,
      });
    } finally {
      setRevertLoading(false);
    }
  };

  const handleUpdateAppName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appNameInput.trim()) return;
    setAppNameLoading(true);
    setAlertMsg(null);
    try {
      const res = await updateAppNameAction(appNameInput);
      if (!res.success) throw new Error(res.error);
      setAlertMsg({
        text: `Nama aplikasi berhasil diperbarui menjadi "${res.appName}".`,
        isError: false,
      });
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal menyimpan nama aplikasi.",
        isError: true,
      });
    } finally {
      setAppNameLoading(false);
    }
  };

  const handleSelectTheme = async (themeId: ThemeColor) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute("data-theme", themeId);
    setThemeLoading(true);
    try {
      const res = await updateThemeAction(themeId);
      if (!res.success) throw new Error(res.error);
      setAlertMsg({
        text: `Tema warna berhasil diubah ke ${THEME_PRESETS.find((t) => t.id === themeId)?.name}.`,
        isError: false,
      });
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal menyimpan tema.",
        isError: true,
      });
    } finally {
      setThemeLoading(false);
    }
  };

  const handleUploadLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logoFile) return;
    setLogoLoading(true);
    setAlertMsg(null);
    try {
      const formData = new FormData();
      formData.append("logo", logoFile);
      const res = await uploadLogoAction(formData);
      if (!res.success || !res.logoUrl) throw new Error(res.error || "Gagal mengunggah logo.");

      setLogoPreview(res.logoUrl);
      setLogoFile(null);

      // Update favicon dynamically
      const existingFavicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (existingFavicon) {
        existingFavicon.href = res.logoUrl;
      } else {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = res.logoUrl;
        document.head.appendChild(link);
      }

      setAlertMsg({
        text: "Logo sekolah dan favicon tab browser berhasil diperbarui.",
        isError: false,
      });
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal mengunggah logo.",
        isError: true,
      });
    } finally {
      setLogoLoading(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoLoading(true);
    setAlertMsg(null);
    try {
      const res = await removeLogoAction();
      if (!res.success) throw new Error(res.error);
      setLogoPreview(null);
      setAlertMsg({
        text: "Logo berhasil dihapus, kembali ke logo bawaan.",
        isError: false,
      });
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal menghapus logo.",
        isError: true,
      });
    } finally {
      setLogoLoading(false);
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherPassword !== teacherPasswordConfirm) {
      setAlertMsg({ text: "Password awal dan konfirmasi password tidak cocok.", isError: true });
      return;
    }
    setLoading(true);
    setAlertMsg(null);
    try {
      const res = await createTeacherAction({
        username: teacherUsername,
        displayName: teacherDisplayName,
        password: teacherPassword,
        classId: teacherClassId || undefined,
      });
      if (!res.success) throw new Error(res.error);
      setAlertMsg({ text: "Wali Kelas berhasil ditambahkan.", isError: false });
      setIsTeacherModalOpen(false);
      setTeacherUsername("");
      setTeacherDisplayName("");
      setTeacherPassword("");
      setTeacherPasswordConfirm("");
      setShowTeacherPassword(false);
      setShowTeacherPasswordConfirm(false);
      setTeacherClassId(null);
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
    if (editTeacherPassword && editTeacherPassword !== editTeacherPasswordConfirm) {
      setAlertMsg({ text: "Password baru dan konfirmasi password tidak cocok.", isError: true });
      return;
    }
    setLoading(true);
    setAlertMsg(null);
    try {
      const res = await updateTeacherAction(
        editingTeacher.id,
        editTeacherName,
        editTeacherPassword || undefined,
        editTeacherActive,
        editTeacherClassId
      );
      if (!res.success) throw new Error(res.error);
      setAlertMsg({ text: "Data Wali Kelas diperbarui.", isError: false });
      setEditingTeacher(null);
      setEditTeacherPassword("");
      setEditTeacherPasswordConfirm("");
      setShowEditTeacherPassword(false);
      setShowEditTeacherPasswordConfirm(false);
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
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo Sekolah"
                width={40}
                height={40}
                fetchPriority="high"
                className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
              />
            ) : (
              <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            )}
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
              className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            >
              <School className="w-4 h-4 text-[var(--accent-slate)]" />
              <span>Buka Dashboard</span>
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-[var(--ink-muted)] hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                ? "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
            }`}
          >
            {alertMsg.text}
          </div>
        )}

        {/* Overview Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="card-paper p-4 sm:p-5 rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
              <span className="text-xs font-semibold text-[var(--ink-muted)]">Total Kelas</span>
            </div>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)]">
              {initialClasses.length}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-1">Kelas terdaftar</p>
          </div>

          <div className="card-paper p-4 sm:p-5 rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-slate)]" />
              <span className="text-xs font-semibold text-[var(--ink-muted)]">Total Wali Kelas</span>
            </div>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)]">
              {initialTeachers.length}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-1">Guru berwenang</p>
          </div>

          <div className="card-paper p-4 sm:p-5 rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--status-success-fg)]" />
              <span className="text-xs font-semibold text-[var(--ink-muted)]">Total Siswa Aktif</span>
            </div>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)]">
              {totalStudentsOverall}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-1">Seluruh kelas</p>
          </div>

          <div className="card-paper p-4 sm:p-5 rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              <span className="text-xs font-semibold text-[var(--ink-muted)]">Total Ketidakhadiran</span>
            </div>
            <p className="text-3xl font-extrabold font-heading text-[var(--ink)]">
              {totalAbsencesOverall}
            </p>
            <p className="text-xs text-[var(--ink-muted)] mt-1">Arsip tersimpan</p>
          </div>
        </div>

        {/* Tab Header & Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
          <div className="flex gap-4 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("classes")}
              className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === "classes"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Manajemen Kelas ({initialClasses.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("teachers")}
              className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === "teachers"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Akun Wali Kelas ({initialTeachers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === "settings"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Pengaturan Sistem &amp; Tema</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("database")}
              className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === "database"
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Database &amp; Migrasi</span>
            </button>
          </div>

          <div>
            {activeTab === "classes" && (
              <button
                type="button"
                onClick={() => {
                  setClassSlugInput(generateRandomClassCode(3));
                  setIsClassModalOpen(true);
                }}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Kelas Baru</span>
              </button>
            )}
            {activeTab === "teachers" && (
              <button
                type="button"
                onClick={() => setIsTeacherModalOpen(true)}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Wali Kelas</span>
              </button>
            )}
            {activeTab === "settings" && (
              <span className="text-xs font-medium text-[var(--ink-muted)]">
                Pengaturan ini berlaku global ke seluruh website
              </span>
            )}
            {activeTab === "database" && (
              <span className="text-xs font-medium text-[var(--ink-muted)]">
                Koneksi remote, tes konektivitas, migrasi skema, &amp; alihkan database utama
              </span>
            )}
          </div>
        </div>

        {activeTab === "classes" && (
          <div className="card-paper rounded-2xl overflow-hidden">
            <div role="region" aria-label="Tabel Manajemen Kelas" tabIndex={0} className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-b border-[var(--border)] font-semibold">
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
                          className="inline-flex items-center gap-1 text-[var(--accent-slate)] hover:underline font-semibold"
                        >
                          <span>/portal/{c.slug}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/dashboard?classId=${c.id}`}
                            className="p-1.5 rounded text-[var(--primary)] hover:bg-[var(--primary-light)] font-semibold"
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

        {activeTab === "teachers" && (
          <div className="card-paper rounded-2xl overflow-hidden">
            <div role="region" aria-label="Tabel Akun Wali Kelas" tabIndex={0} className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-b border-[var(--border)] font-semibold">
                  <tr>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Kelas yang Diampu</th>
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
                      <td className="px-4 py-3">
                        {t.assignedClassName ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-[var(--primary-light)] text-[var(--primary)] border-[var(--border)]">
                            {t.assignedClassName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--ink-muted)] italic">
                            Belum ditugaskan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-medium text-[var(--ink-muted)]">
                        {t.role === "wali_kelas" ? "Wali Kelas" : t.role === "superadmin" ? "Superadmin" : t.role}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            t.isActive
                              ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
                              : "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
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
                            setEditTeacherPasswordConfirm("");
                            setShowEditTeacherPassword(false);
                            setShowEditTeacherPasswordConfirm(false);
                            setEditTeacherActive(t.isActive);
                            setEditTeacherClassId(t.assignedClassId || null);
                          }}
                          className="p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--primary)]"
                          title="Edit Data &amp; Kelas Wali Kelas"
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

        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <School className="w-5 h-5 text-[var(--primary)]" />
                  <span>Identitas Nama Sekolah / Aplikasi</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Nama ini tampil pada judul tab browser (metadata halaman) di seluruh aplikasi.
                </p>
              </div>

              <form onSubmit={handleUpdateAppName} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="app-name-input" className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Nama Sekolah / Sistem
                  </label>
                  <input
                    id="app-name-input"
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={appNameInput}
                    onChange={(e) => setAppNameInput(e.target.value)}
                    placeholder="Contoh: Sistem Presensi SMK Negeri 1"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={appNameLoading || !appNameInput.trim()}
                  className="touch-target inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs disabled:opacity-40 transition-colors"
                >
                  {appNameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Simpan Nama</span>
                </button>
              </form>
            </div>

            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[var(--primary)]" />
                  <span>Logo Sekolah &amp; Favicon Browser</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Logo ini otomatis tampil di header navigasi, halaman login, dan langsung menjadi favicon tab browser.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pt-2">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--canvas-subtle)] flex items-center justify-center p-2 shadow-xs overflow-hidden">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Logo Sekolah"
                        width={64}
                        height={64}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center">
                        <School className="w-10 h-10 text-[var(--ink-muted)] mx-auto opacity-40" />
                        <span className="text-[10px] text-[var(--ink-muted)] block mt-1">Default</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--ink-muted)]">
                    {logoPreview ? "Logo Kustom Aktif" : "Ikon Bawaan"}
                  </span>
                </div>

                <div className="flex-1 space-y-3 w-full">
                  <form onSubmit={handleUploadLogo} className="space-y-3">
                    <div>
                      <label htmlFor="logo-upload-input" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                        Pilih Berkas Logo Baru
                      </label>
                      <input
                        id="logo-upload-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          setLogoFile(f);
                        }}
                        className="w-full text-xs text-[var(--ink)] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[var(--primary-light)] file:text-[var(--primary)] hover:file:bg-[var(--primary)] hover:file:text-white file:transition-colors file:cursor-pointer cursor-pointer border border-[var(--border)] rounded-xl p-2 bg-[var(--surface)]"
                      />
                      <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                        Format: PNG, JPG, WEBP, atau SVG. Ukuran maksimal 2MB. Otomatis dikonversi dan disinkronkan ke favicon browser.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={!logoFile || logoLoading}
                        className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        {logoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        <span>Unggah &amp; Perbarui Logo</span>
                      </button>

                      {logoPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          disabled={logoLoading}
                          className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Hapus Logo (Gunakan Ikon Bawaan)</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* Section 2: 5 Curated Color Themes */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <Palette className="w-5 h-5 text-[var(--primary)]" />
                  <span>Tema Warna Web Keseluruhan (5 Pilihan Terkurasi)</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Pilih salah satu palet di bawah ini. Seluruh website (Login, Dashboard, Portal Wali Murid) akan otomatis menyesuaikan seketika baik mode terang maupun gelap.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                {THEME_PRESETS.map((preset) => {
                  const isSelected = currentTheme === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={themeLoading}
                      onClick={() => handleSelectTheme(preset.id)}
                      className={`touch-target text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between cursor-pointer ${
                        isSelected
                          ? "border-[var(--primary)] bg-[var(--primary-light)]/40 ring-2 ring-[var(--primary)]/30 shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--canvas-subtle)]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-full border border-black/10 shadow-xs inline-block shrink-0"
                              style={{ backgroundColor: preset.primaryLightHex }}
                            />
                            <span className="font-bold text-sm text-[var(--ink)] font-heading">
                              {preset.name}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                              isSelected
                                ? "bg-[var(--primary)] text-white border-transparent"
                                : "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border-[var(--border)]"
                            }`}
                          >
                            {isSelected ? "Aktif" : preset.badge}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--ink-muted)] leading-relaxed mb-3">
                          {preset.description}
                        </p>
                      </div>

                      {/* Color swatches preview */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--border)] mt-auto">
                        <span className="text-[10px] text-[var(--ink-muted)] font-medium">Pratinjau:</span>
                        <span
                          className="w-4 h-4 rounded-md shadow-xs border border-black/10"
                          style={{ backgroundColor: preset.primaryLightHex }}
                          title="Warna Utama (Light)"
                        />
                        <span
                          className="w-4 h-4 rounded-md shadow-xs border border-black/10"
                          style={{ backgroundColor: preset.hoverLightHex }}
                          title="Warna Hover (Light)"
                        />
                        <span
                          className="w-4 h-4 rounded-md shadow-xs border border-black/10"
                          style={{ backgroundColor: preset.primaryDarkHex }}
                          title="Warna Utama (Dark)"
                        />
                        <span
                          className="w-4 h-4 rounded-md shadow-xs border border-black/10"
                          style={{ backgroundColor: preset.accentBgHex }}
                          title="Aksen Lembut"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Database & Migrasi */}
        {activeTab === "database" && (
          <div className="space-y-6">
            {/* Card 1: Status Database Aktif Saat Ini */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                    <Server className="w-5 h-5 text-[var(--primary)]" />
                    <span>Status Database Aplikasi Saat Ini</span>
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                    Informasi koneksi basis data yang saat ini aktif digunakan oleh aplikasi di server.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadActiveDbInfo}
                    disabled={dbInfoLoading}
                    className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${dbInfoLoading ? "animate-spin" : ""}`} />
                    <span>Periksa Status</span>
                  </button>
                </div>
              </div>

              {activeDbInfo ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        activeDbInfo.isLocal
                          ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900"
                          : "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900"
                      }`}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      {activeDbInfo.isLocal ? "Database Lokal (Server Ini)" : "Database Remote Aktif"}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        activeDbInfo.isConnected
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900"
                          : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          activeDbInfo.isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                        }`}
                      />
                      {activeDbInfo.isConnected ? "Terhubung (Online)" : "Gagal Terhubung (Offline)"}
                    </span>

                    {activeDbInfo.latencyMs !== undefined && (
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--border)] text-[var(--ink-muted)]">
                        Latensi: {activeDbInfo.latencyMs} ms
                      </span>
                    )}

                    {activeDbInfo.serverVersion && (
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[var(--canvas-subtle)] border border-[var(--border)] text-[var(--ink-muted)]">
                        Versi: {activeDbInfo.serverVersion}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                      <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">Host Database</span>
                      <span className="text-sm font-bold font-mono text-[var(--ink)] mt-0.5 block truncate">
                        {activeDbInfo.host}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                      <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">Port</span>
                      <span className="text-sm font-bold font-mono text-[var(--ink)] mt-0.5 block">
                        {activeDbInfo.port}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                      <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">Nama Database</span>
                      <span className="text-sm font-bold font-mono text-[var(--ink)] mt-0.5 block truncate">
                        {activeDbInfo.database}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                      <span className="block text-[11px] font-semibold text-[var(--ink-muted)]">Pengguna (User)</span>
                      <span className="text-sm font-bold font-mono text-[var(--ink)] mt-0.5 block truncate">
                        {activeDbInfo.user}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between gap-3">
                    <div className="overflow-hidden">
                      <span className="text-[11px] font-semibold text-[var(--ink-muted)] block mb-0.5">
                        Connection URI Aktif (Password Terenkripsi/Disensor):
                      </span>
                      <span className="text-xs font-mono text-[var(--ink)] block truncate">
                        {activeDbInfo.currentUri}
                      </span>
                    </div>
                  </div>

                  {!activeDbInfo.isLocal && (
                    <div className="p-4 rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-purple-900 dark:text-purple-300">
                          Aplikasi saat ini aktif menggunakan Database Remote
                        </p>
                        <p className="text-[11px] text-purple-700 dark:text-purple-400 mt-0.5">
                          Jika sewaktu-waktu database remote mengalami gangguan, Anda dapat beralih kembali ke database lokal dengan satu klik.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRevertModalOpen(true)}
                        className="touch-target inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors whitespace-nowrap shrink-0"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Kembalikan ke Database Lokal</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 text-xs text-[var(--ink-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Memeriksa status database saat ini...</span>
                </div>
              )}
            </div>

            {/* Card 2: Konfigurasi Database Remote */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                    <Database className="w-5 h-5 text-[var(--primary)]" />
                    <span>Konfigurasi Database Remote</span>
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                    Masukkan kredensial server remote MySQL / MariaDB / Cloud Database tujuan.
                  </p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setDbInputMode("fields")}
                    className={`touch-target px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      dbInputMode === "fields"
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    Form Terstruktur
                  </button>
                  <button
                    type="button"
                    onClick={() => setDbInputMode("uri")}
                    className={`touch-target px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      dbInputMode === "uri"
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    URI String
                  </button>
                </div>
              </div>

              {dbInputMode === "fields" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                        Host / Alamat IP Server Remote
                      </label>
                      <input
                        type="text"
                        value={remoteHost}
                        onChange={(e) => handleFieldChange("host", e.target.value)}
                        placeholder="Contoh: 103.189.201.45 atau db.sekolah.sch.id"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                        Port MySQL
                      </label>
                      <input
                        type="number"
                        value={remotePort}
                        onChange={(e) =>
                          handleFieldChange("port", parseInt(e.target.value, 10) || 3306)
                        }
                        placeholder="3306"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                        Nama Database Target
                      </label>
                      <input
                        type="text"
                        value={remoteDatabase}
                        onChange={(e) => handleFieldChange("database", e.target.value)}
                        placeholder="Contoh: db_suratizin"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                        Username Database
                      </label>
                      <input
                        type="text"
                        value={remoteUser}
                        onChange={(e) => handleFieldChange("user", e.target.value)}
                        placeholder="Contoh: root atau surat_admin"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                        Password Database
                      </label>
                      <div className="relative">
                        <input
                          type={showRemotePassword ? "text" : "password"}
                          value={remotePassword}
                          onChange={(e) => handleFieldChange("password", e.target.value)}
                          placeholder="Password database remote"
                          className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRemotePassword(!showRemotePassword)}
                          className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                          title={showRemotePassword ? "Sembunyikan password" : "Lihat password"}
                        >
                          {showRemotePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="remote-ssl-check"
                      checked={remoteSsl}
                      onChange={(e) => handleFieldChange("ssl", e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--primary)] accent-[var(--primary)] cursor-pointer"
                    />
                    <label htmlFor="remote-ssl-check" className="text-xs font-semibold cursor-pointer">
                      Gunakan Enkripsi Koneksi SSL/TLS (Dibutuhkan untuk Cloud DB seperti AWS RDS, PlanetScale, Aiven, Supabase)
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                      MySQL Connection URI
                    </label>
                    <input
                      type="text"
                      value={remoteUri}
                      onChange={(e) => handleUriChange(e.target.value)}
                      placeholder="mysql://user:password@hostname:3306/database_name?ssl=true"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    />
                    <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                      URI akan langsung diurai dan disinkronkan otomatis dengan parameter form individual.
                    </p>
                  </div>
                </div>
              )}

              {/* Synchronized URI Preview */}
              <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                <span className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-0.5">
                  URI Tersinkron (Otomatis):
                </span>
                <span className="font-mono text-xs text-[var(--ink)] break-all block">
                  {remoteUri
                    ? remoteUri.replace(/:([^:@]+)@/, ":****@")
                    : "mysql://root:****@127.0.0.1:3306/db_name"}
                </span>
              </div>
            </div>

            {/* Card 3: Uji Koneksi, Migrasi Skema & Pengalihan */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[var(--primary)]" />
                  <span>Uji Koneksi &amp; Eksekusi Migrasi Skema</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Jalankan validasi koneksi, inisialisasi skema 5 tabel inti, salin data lokal jika diinginkan, lalu aktifkan sebagai database utama.
                </p>
              </div>

              {/* Options */}
              <div className="space-y-2 p-4 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                <span className="block text-xs font-bold text-[var(--ink)] mb-2">
                  Opsi Migrasi Data:
                </span>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyDataOption}
                    onChange={(e) => setCopyDataOption(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[var(--primary)] accent-[var(--primary)] cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--ink)] block">
                      Salin seluruh data lokal saat ini ke database remote
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] block">
                      Menyalin akun guru, kelas, siswa, catatan ketidakhadiran, lampiran surat, dan tema pengaturan sistem.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-[var(--border)]">
                  <input
                    type="checkbox"
                    checked={dropTablesOption}
                    onChange={(e) => setDropTablesOption(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-red-600 accent-red-600 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 block">
                      Hapus &amp; buat ulang tabel (DROP TABLES IF EXISTS)
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] block">
                      Gunakan ini hanya jika Anda ingin mereset total database remote ke kondisi bersih. Data lama di remote akan terhapus.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testDbLoading || migrationLoading || (!remoteHost && !remoteUri)}
                  className="touch-target inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-bold text-[var(--ink)] transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                >
                  {testDbLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                  ) : (
                    <Wifi className="w-4 h-4 text-[var(--primary)]" />
                  )}
                  <span>Tes Koneksi Remote</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunMigration}
                  disabled={testDbLoading || migrationLoading || (!remoteHost && !remoteUri)}
                  className="touch-target inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                >
                  {migrationLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span>Jalankan Migrasi Skema &amp; Salin Data</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(true)}
                  disabled={testDbLoading || migrationLoading || (!remoteHost && !remoteUri)}
                  className="touch-target inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Jadikan Database Utama Aplikasi</span>
                </button>
              </div>

              {/* Test Result Callout */}
              {testDbResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                    testDbResult.success
                      ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                      : "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
                  }`}
                >
                  {testDbResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block">
                      {testDbResult.success
                        ? "Koneksi ke Database Remote Berhasil!"
                        : "Gagal Menghubungi Database Remote"}
                    </span>
                    <span className="mt-0.5 block">
                      {testDbResult.success
                        ? `Host responsif dengan latensi ${testDbResult.latencyMs} ms (${testDbResult.serverVersion || "MySQL Server"}). Database siap digunakan.`
                        : testDbResult.error}
                    </span>
                  </div>
                </div>
              )}

              {/* Terminal Migration Logs */}
              {migrationLogs.length > 0 && (
                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200 space-y-1.5 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] text-slate-400 font-sans">
                    <span className="font-bold tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                      LOG PROSES MIGRASI DATABASE
                    </span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-full ${
                        migrationLoading
                          ? "bg-amber-950 text-amber-300 animate-pulse"
                          : migrationResult?.success
                          ? "bg-emerald-950 text-emerald-300"
                          : "bg-red-950 text-red-300"
                      }`}
                    >
                      {migrationLoading
                        ? "SEDANG BERJALAN..."
                        : migrationResult?.success
                        ? "MIGRASI SELESAI"
                        : "MIGRASI GAGAL"}
                    </span>
                  </div>
                  {migrationLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.startsWith("✓")
                          ? "text-emerald-400 font-semibold"
                          : log.startsWith("✗")
                          ? "text-red-400 font-semibold"
                          : "text-slate-300"
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {isTeacherModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-teacher-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsTeacherModalOpen(false);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="create-teacher-modal-title" className="text-base font-bold font-heading">
                Tambah Akun Wali Kelas
              </h3>
              <button
                type="button"
                onClick={() => setIsTeacherModalOpen(false)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)]"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTeacher} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Nama Lengkap &amp; Gelar
                </label>
                <input
                  type="text"
                  required
                  value={teacherDisplayName}
                  onChange={(e) => setTeacherDisplayName(toTitleCase(e.target.value))}
                  placeholder="Contoh: Erick S.Kom"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Username Login
                </label>
                <input
                  type="text"
                  required
                  value={teacherUsername}
                  onChange={(e) => setTeacherUsername(e.target.value)}
                  placeholder="Contoh: erick"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Password Awal (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={showTeacherPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={teacherPassword}
                    onChange={(e) => setTeacherPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTeacherPassword(!showTeacherPassword)}
                    className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    title={showTeacherPassword ? "Sembunyikan password" : "Lihat password"}
                  >
                    {showTeacherPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Ulangi Password Awal
                </label>
                <div className="relative">
                  <input
                    type={showTeacherPasswordConfirm ? "text" : "password"}
                    required
                    minLength={6}
                    value={teacherPasswordConfirm}
                    onChange={(e) => setTeacherPasswordConfirm(e.target.value)}
                    placeholder="Ketik ulang password awal"
                    className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTeacherPasswordConfirm(!showTeacherPasswordConfirm)}
                    className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    title={showTeacherPasswordConfirm ? "Sembunyikan password" : "Lihat password"}
                  >
                    {showTeacherPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {teacherPasswordConfirm.length > 0 && (
                  <div className="mt-1">
                    {teacherPassword === teacherPasswordConfirm ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Password cocok
                      </span>
                    ) : (
                      <span className="text-[11px] text-red-500 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Password belum cocok
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Tugaskan ke Kelas (Opsional)
                </label>
                <select
                  value={teacherClassId || ""}
                  onChange={(e) =>
                    setTeacherClassId(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                >
                  <option value="">-- Belum Ditugaskan / Pilih Nanti --</option>
                  {initialClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.academicYear} &bull; {c.periodTitle})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !teacherDisplayName.trim() ||
                    !teacherUsername.trim() ||
                    !teacherPassword ||
                    teacherPassword.length < 6 ||
                    teacherPassword !== teacherPasswordConfirm
                  }
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  {loading ? "Menyimpan..." : "Buat Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTeacher && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-teacher-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingTeacher(null);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="edit-teacher-modal-title" className="text-base font-bold font-heading">
                Edit Wali Kelas: {editingTeacher.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTeacher(null)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)]"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateTeacher} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Nama Lengkap &amp; Gelar
                </label>
                <input
                  type="text"
                  required
                  value={editTeacherName}
                  onChange={(e) => setEditTeacherName(toTitleCase(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Reset Password Baru (Opsional)
                </label>
                <div className="relative">
                  <input
                    type={showEditTeacherPassword ? "text" : "password"}
                    value={editTeacherPassword}
                    onChange={(e) => setEditTeacherPassword(e.target.value)}
                    placeholder="Kosongkan jika password tidak diubah"
                    className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditTeacherPassword(!showEditTeacherPassword)}
                    className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    title={showEditTeacherPassword ? "Sembunyikan password" : "Lihat password"}
                  >
                    {showEditTeacherPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {editTeacherPassword.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Ulangi Password Baru
                  </label>
                  <div className="relative">
                    <input
                      type={showEditTeacherPasswordConfirm ? "text" : "password"}
                      value={editTeacherPasswordConfirm}
                      onChange={(e) => setEditTeacherPasswordConfirm(e.target.value)}
                      placeholder="Ketik ulang password baru"
                      minLength={6}
                      className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditTeacherPasswordConfirm(!showEditTeacherPasswordConfirm)}
                      className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      title={showEditTeacherPasswordConfirm ? "Sembunyikan password" : "Lihat password"}
                    >
                      {showEditTeacherPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {editTeacherPasswordConfirm.length > 0 && (
                    <div className="mt-1">
                      {editTeacherPassword === editTeacherPasswordConfirm ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Password cocok
                        </span>
                      ) : (
                        <span className="text-[11px] text-red-500 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Password belum cocok
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Tugaskan ke Kelas
                </label>
                <select
                  value={editTeacherClassId || ""}
                  onChange={(e) =>
                    setEditTeacherClassId(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                >
                  <option value="">-- Tidak Ada Kelas yang Diampu --</option>
                  {initialClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.academicYear} &bull; {c.periodTitle})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="teacher-active-check"
                  checked={editTeacherActive}
                  onChange={(e) => setEditTeacherActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--primary)] accent-[var(--primary)]"
                />
                <label htmlFor="teacher-active-check" className="text-xs font-semibold">
                  Akun Aktif (Dapat Login)
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !editTeacherName.trim() ||
                    (Boolean(editTeacherPassword) &&
                      (editTeacherPassword.length < 6 ||
                        editTeacherPassword !== editTeacherPasswordConfirm))
                  }
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  {loading ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isClassModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-class-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsClassModalOpen(false);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="create-class-modal-title" className="text-base font-bold font-heading">
                Buat Kelas Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsClassModalOpen(false)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)]"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Nama Kelas
                </label>
                <input
                  type="text"
                  required
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="Contoh: XII TKJ 2"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Kode Slug URL Portal (3 Huruf Acak)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={classSlugInput}
                    onChange={(e) => setClassSlugInput(e.target.value)}
                    placeholder="Contoh: xYZ"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setClassSlugInput(generateRandomClassCode(3))}
                    className="touch-target px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    title="Acak kode 3 huruf baru"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Acak</span>
                  </button>
                </div>
                <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                  Tautan portal: <code className="font-mono">/portal/{classSlugInput || "..."}</code> (tidak terikat nama kelas).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    required
                    value={classYearInput}
                    onChange={(e) => setClassYearInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Periode / Semester
                  </label>
                  <input
                    type="text"
                    required
                    value={classPeriodInput}
                    onChange={(e) => setClassPeriodInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Tugaskan Wali Kelas
                </label>
                <select
                  value={classTeacherId || ""}
                  onChange={(e) =>
                    setClassTeacherId(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold transition-colors"
                >
                  {loading ? "Menyimpan..." : "Buat Kelas"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingClass && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-class-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingClass(null);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="edit-class-modal-title" className="text-base font-bold font-heading">
                Edit Kelas: {editingClass.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingClass(null)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)]"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Nama Kelas
                </label>
                <input
                  type="text"
                  required
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Kode Slug URL Portal
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={editClassSlug}
                    onChange={(e) => setEditClassSlug(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setEditClassSlug(generateRandomClassCode(3))}
                    className="touch-target px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    title="Acak kode 3 huruf baru"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Acak</span>
                  </button>
                </div>
                <p className="text-[11px] text-[var(--status-warning-fg)] mt-1">
                  Perhatian: Mengubah slug portal akan mengubah tautan dan QR code yang sudah dibagikan.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    required
                    value={editClassYear}
                    onChange={(e) => setEditClassYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                    Periode / Semester
                  </label>
                  <input
                    type="text"
                    required
                    value={editClassPeriod}
                    onChange={(e) => setEditClassPeriod(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--ink-muted)] mb-1">
                  Wali Kelas Ditugaskan
                </label>
                <select
                  value={editClassTeacherId || ""}
                  onChange={(e) =>
                    setEditClassTeacherId(
                      e.target.value ? parseInt(e.target.value, 10) : null
                    )
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
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
                  className="w-4 h-4 rounded text-[var(--primary)] accent-[var(--primary)]"
                />
                <label htmlFor="class-active-check" className="text-xs font-semibold">
                  Kelas Aktif
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold transition-colors"
                >
                  {loading ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi: Jadikan Database Utama */}
      {isApplyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-db-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget && !applyLoading) setIsApplyModalOpen(false);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="apply-db-modal-title" className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
                <span>Jadikan Database Utama Aplikasi</span>
              </h3>
              <button
                type="button"
                onClick={() => !applyLoading && setIsApplyModalOpen(false)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--ink)]">
              <p>
                Anda akan mengganti database operasional aplikasi menjadi server remote berikut:
              </p>

              <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)] space-y-1 font-mono text-xs">
                <div><span className="text-[var(--ink-muted)]">Host:</span> {remoteHost || parseDbUrl(remoteUri).host || "127.0.0.1"}</div>
                <div><span className="text-[var(--ink-muted)]">Port:</span> {remotePort || parseDbUrl(remoteUri).port || 3306}</div>
                <div><span className="text-[var(--ink-muted)]">Database:</span> {remoteDatabase || parseDbUrl(remoteUri).database || "-"}</div>
                <div><span className="text-[var(--ink-muted)]">User:</span> {remoteUser || parseDbUrl(remoteUri).user || "root"}</div>
              </div>

              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 text-amber-900 dark:text-amber-200">
                <span className="font-bold block mb-1">Catatan Penting:</span>
                File konfigurasi <code className="font-mono font-bold">.env</code> akan diperbarui dan service aplikasi <code className="font-mono font-bold">surat-ijin</code> akan dimuat ulang seketika (~350ms). Pastikan Anda sudah menjalankan migrasi skema agar tabel siap digunakan.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={applyLoading}
                onClick={() => setIsApplyModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)] cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={applyLoading}
                onClick={handleApplyActiveDatabase}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                {applyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{applyLoading ? "Menerapkan & Merestart..." : "Ya, Jadikan Database Utama"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi: Kembalikan ke Database Lokal */}
      {isRevertModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="revert-db-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={(e) => {
            if (e.target === e.currentTarget && !revertLoading) setIsRevertModalOpen(false);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="revert-db-modal-title" className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-purple-600" />
                <span>Kembalikan ke Database Lokal</span>
              </h3>
              <button
                type="button"
                onClick={() => !revertLoading && setIsRevertModalOpen(false)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--ink)]">
              <p>
                Aplikasi akan dialihkan kembali menggunakan database MariaDB lokal di server ini:
              </p>

              <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)] space-y-1 font-mono text-xs">
                <div><span className="text-[var(--ink-muted)]">Target:</span> 127.0.0.1:3306</div>
                <div><span className="text-[var(--ink-muted)]">Database:</span> db_suratizin</div>
                <div><span className="text-[var(--ink-muted)]">User:</span> surat_user</div>
              </div>

              <p className="text-[var(--ink-muted)]">
                File <code className="font-mono">.env</code> akan diperbarui kembali ke database bawaan server dan service sistem akan di-restart otomatis. Seluruh data lokal tetap aman.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={revertLoading}
                onClick={() => setIsRevertModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)] cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={revertLoading}
                onClick={handleRevertToLocal}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                {revertLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{revertLoading ? "Mengalihkan..." : "Ya, Kembalikan ke Lokal"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
