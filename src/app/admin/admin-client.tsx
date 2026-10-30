"use client";

import { useState, useEffect, useRef } from "react";
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
  Cpu,
  Settings,
  Copy,
  Globe,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppFooter } from "@/components/app-footer";
import { logoutAction } from "@/actions/auth";
import {
  createTeacherAction,
  updateTeacherAction,
  createClassAction,
  updateClassAction,
  updateAdminSelfPasswordAction,
} from "@/actions/admin";
import { toTitleCase, generateRandomClassCode } from "@/lib/string-utils";
import {
  updateThemeAction,
  updateBgThemeAction,
  uploadLogoAction,
  removeLogoAction,
  updateAppNameAction,
  updateSystemIdentityAction,
  updateAiSettingsAction,
  testAiConnectionAction,
} from "@/actions/system-settings";
import {
  getCurrentDatabaseInfoAction,
  testDatabaseConnectionAction,
  migrateDatabaseAction,
  applyActiveDatabaseAction,
  migrateAndApplyDatabaseAction,
  revertToLocalDatabaseAction,
} from "@/actions/database-admin";
import {
  testRedisConnectionAction,
  updateRedisSettingsAction,
} from "@/actions/redis-admin";
import {
  parseRedisConnection,
  buildRedisUrl,
  formatMaskedRedisUrl,
} from "@/lib/redis-utils";
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
  BgTheme,
  BgThemePreset,
  BG_THEME_PRESETS,
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
  superadminName: _superadminName,
}: AdminClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"classes" | "teachers" | "settings" | "database">("classes");
  const [technicalSubTab, setTechnicalSubTab] = useState<"ai" | "database">("ai");

  const [appNameInput, setAppNameInput] = useState(
    initialSettings?.appName || "Sistem Surat Izin Siswa"
  );
  const [footerTextInput, setFooterTextInput] = useState(
    initialSettings?.footerText || "Sistem Surat Izin & Ketidakhadiran Siswa."
  );
  const [identityLoading, setIdentityLoading] = useState(false);
  const [appNameLoading, setAppNameLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeColor>(initialSettings?.themeColor || "terracotta");
  const [logoPreview, setLogoPreview] = useState<string | null>(initialSettings?.logoUrl || null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [themeLoading, setThemeLoading] = useState(false);

  // Superadmin Self-Password States
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);

  // 9router AI States
  const [aiEnabled, setAiEnabled] = useState<boolean>(initialSettings?.aiEnabled ?? false);
  const [aiRouterUrl, setAiRouterUrl] = useState<string>(initialSettings?.aiRouterUrl || "http://127.0.0.1:20128/v1");
  const [aiRouterApiKey, setAiRouterApiKey] = useState<string>(initialSettings?.aiRouterApiKey || "");
  const [showAiApiKey, setShowAiApiKey] = useState<boolean>(false);
  const [aiRouterModel, setAiRouterModel] = useState<string>(initialSettings?.aiRouterModel || "gemini/gemini-3.8-flash");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState<boolean>(false);
  const [testingAi, setTestingAi] = useState<boolean>(false);
  const [savingAiSettings, setSavingAiSettings] = useState<boolean>(false);
  const [togglingAi, setTogglingAi] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<{
    type: "success" | "error";
    title?: string;
    message: string;
  } | null>(null);

  // Auto-dismiss floating in-card banner after 4 seconds
  useEffect(() => {
    if (!aiNotice) return;
    const timer = setTimeout(() => {
      setAiNotice(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [aiNotice]);
  const [aiHeartbeat, setAiHeartbeat] = useState<{
    checked: boolean;
    isConnected: boolean;
    latencyMs?: number;
    error?: string;
  }>({ checked: false, isConnected: false });

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
  const [copiedUri, setCopiedUri] = useState(false);

  // Redis Cache States (Structured Form & Realtime Status)
  const initialRedis = parseRedisConnection(initialSettings?.redisUrl);
  const [redisEnabled, setRedisEnabled] = useState<boolean>(initialSettings?.redisEnabled ?? false);
  const [redisHost, setRedisHost] = useState<string>(initialRedis.host);
  const [redisPort, setRedisPort] = useState<string>(initialRedis.port);
  const [redisPassword, setRedisPassword] = useState<string>(initialRedis.password);
  const [showRedisPassword, setShowRedisPassword] = useState(false);
  const [testingRedis, setTestingRedis] = useState(false);
  const [savingRedis, setSavingRedis] = useState(false);
  const [togglingRedis, setTogglingRedis] = useState(false);
  const [checkingRedis, setCheckingRedis] = useState(false);
  const [redisNotice, setRedisNotice] = useState<{
    type: "success" | "error";
    title?: string;
    message: string;
  } | null>(null);

  // Synchronize Redis form values when initialSettings.redisUrl changes or on mount
  useEffect(() => {
    if (initialSettings?.redisUrl) {
      const parsed = parseRedisConnection(initialSettings.redisUrl);
      setRedisHost((prev) => prev || parsed.host);
      setRedisPort((prev) => prev || parsed.port);
      setRedisPassword((prev) => prev || parsed.password);
    }
  }, [initialSettings?.redisUrl]);

  useEffect(() => {
    if (!redisNotice) return;
    const timer = setTimeout(() => {
      setRedisNotice(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [redisNotice]);

  const [redisHeartbeat, setRedisHeartbeat] = useState<{
    checked: boolean;
    isConnected: boolean;
    latencyMs?: number;
    error?: string;
  }>({ checked: false, isConnected: false });
  const isInitialRedisMount = useRef(initialSettings?.redisEnabled ?? false);

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

  // Auto-dismiss alert notification banner after 5 seconds
  useEffect(() => {
    if (!alertMsg) return;
    const timer = setTimeout(() => {
      setAlertMsg(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [alertMsg]);

  // Background Theme state and persistence (R6)
  const [currentBgTheme, setCurrentBgTheme] = useState<string>(
    initialSettings?.bgTheme || "warm-zinc"
  );

  const applyBgTheme = (themeId: string) => {
    document.documentElement.setAttribute("data-bg-theme", themeId);
    // Remove obsolete inline styles to let CSS variables cascade cleanly
    document.documentElement.style.removeProperty("--canvas");
    document.documentElement.style.removeProperty("--surface");
  };

  useEffect(() => {
    try {
      localStorage.removeItem("app_bg_theme");
    } catch {
      // Safe fallback
    }
    const activeTheme = initialSettings?.bgTheme || "warm-zinc";
    setCurrentBgTheme(activeTheme);
    applyBgTheme(activeTheme);
  }, [initialSettings?.bgTheme]);

  const handleSelectBgTheme = async (themeId: BgTheme) => {
    setCurrentBgTheme(themeId);
    applyBgTheme(themeId);

    const preset = BG_THEME_PRESETS.find((t) => t.id === themeId);
    setAlertMsg({
      text: `Tema latar belakang berhasil diubah ke ${preset?.name || themeId}.`,
      isError: false,
    });

    try {
      const res = await updateBgThemeAction(themeId);
      if (!res?.success) {
        setAlertMsg({
          text: res?.error || "Gagal menyimpan tema latar belakang ke database.",
          isError: true,
        });
      }
    } catch {
      // Safe fallback
    }
  };

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
    if (activeTab === "database" && technicalSubTab === "database") {
      loadActiveDbInfo();
    }
  }, [activeTab, technicalSubTab]);

  const checkAiHealth = async () => {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAiHeartbeat({
          checked: true,
          isConnected: Boolean(data.isConnected),
          latencyMs: data.latencyMs,
          error: data.error,
        });
        if (Array.isArray(data.models) && data.models.length > 0) {
          setAvailableModels(data.models);
        }
      }
    } catch {
      setAiHeartbeat({
        checked: true,
        isConnected: false,
        error: "Gagal menghubungi endpoint status AI",
      });
    }
  };

  useEffect(() => {
    if (activeTab === "database" && technicalSubTab === "ai" && aiEnabled) {
      checkAiHealth();
      const interval = setInterval(checkAiHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, technicalSubTab, aiEnabled]);

  const handleToggleAi = async () => {
    if (togglingAi) return;
    setTogglingAi(true);
    setAiNotice(null);

    const nextState = !aiEnabled;
    setAiEnabled(nextState);

    try {
      const res = await updateAiSettingsAction({
        aiEnabled: nextState,
        aiRouterUrl,
        aiRouterApiKey: aiRouterApiKey.trim() || null,
        aiRouterModel,
      });

      if (res.success) {
        setAiNotice({
          type: "success",
          title: nextState ? "Integrasi Diaktifkan" : "Integrasi Dinonaktifkan",
          message: nextState
            ? "Integrasi 9router berhasil diaktifkan dan disimpan ke database."
            : "Pemrosesan berkas OCR dialihkan sepenuhnya ke PaddleOCR lokal.",
        });
        if (nextState) {
          checkAiHealth();
        }
        router.refresh();
      } else {
        setAiNotice({
          type: "error",
          title: "Gagal Mengubah Status",
          message: res.error || "Gagal menyimpan status integrasi AI.",
        });
        setAiEnabled(!nextState);
      }
    } catch (err: unknown) {
      setAiNotice({
        type: "error",
        title: "Terjadi Kesalahan",
        message: err instanceof Error ? err.message : "Terjadi kesalahan saat mengubah status AI.",
      });
      setAiEnabled(!nextState);
    } finally {
      setTogglingAi(false);
    }
  };

  const handleTestAiConnection = async () => {
    if (!aiEnabled) return;
    setTestingAi(true);
    setAiNotice(null);
    try {
      const res = await testAiConnectionAction({
        enabled: true,
        baseUrl: aiRouterUrl,
        apiKey: aiRouterApiKey.trim() || null,
        model: aiRouterModel,
      });

      if (res.success && res.result) {
        const modelCount = res.result.models?.length ?? 0;
        setAiNotice({
          type: res.result.isConnected ? "success" : "error",
          title: res.result.isConnected
            ? `Koneksi Berhasil (${res.result.latencyMs} ms)`
            : "Koneksi Gagal",
          message: res.result.isConnected
            ? modelCount > 0
              ? `${modelCount} model aktif terdeteksi di 9router.`
              : "Gateway 9router siap menerima permintaan inferensi."
            : res.result.error || "Pastikan proses 9router aktif.",
        });
        if (res.result.models && res.result.models.length > 0) {
          setAvailableModels(res.result.models);
        }
        setAiHeartbeat({
          checked: true,
          isConnected: res.result.isConnected,
          latencyMs: res.result.latencyMs,
          error: res.result.error,
        });
      } else {
        setAiNotice({
          type: "error",
          title: "Koneksi Gagal",
          message: res.error || "Gagal menguji koneksi 9router.",
        });
      }
    } catch (err: unknown) {
      setAiNotice({
        type: "error",
        title: "Koneksi Gagal",
        message: err instanceof Error ? err.message : "Terjadi kesalahan saat menguji koneksi.",
      });
    } finally {
      setTestingAi(false);
    }
  };

  const handleFetchModels = async () => {
    if (!aiEnabled) return;
    setFetchingModels(true);
    setAiNotice(null);
    try {
      const res = await testAiConnectionAction({
        enabled: true,
        baseUrl: aiRouterUrl,
        apiKey: aiRouterApiKey.trim() || null,
        model: aiRouterModel,
      });

      if (res.success && res.result?.isConnected && res.result.models) {
        setAvailableModels(res.result.models);
        if (res.result.models.length > 0 && !res.result.models.includes(aiRouterModel)) {
          setAiRouterModel(res.result.models[0]);
        }
        setAiNotice({
          type: "success",
          title: "Model Diperbarui",
          message: `Berhasil memuat ${res.result.models.length} model aktif dari 9router.`,
        });
      } else {
        setAiNotice({
          type: "error",
          title: "Gagal Mengambil Model",
          message: res.result?.error || res.error || "Gagal mengambil daftar model dari 9router.",
        });
      }
    } catch (err: unknown) {
      setAiNotice({
        type: "error",
        title: "Gagal Mengambil Model",
        message: err instanceof Error ? err.message : "Gagal mengambil daftar model.",
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAiSettings(true);
    setAiNotice(null);
    try {
      const res = await updateAiSettingsAction({
        aiEnabled,
        aiRouterUrl,
        aiRouterApiKey: aiRouterApiKey.trim() || null,
        aiRouterModel,
      });

      if (res.success) {
        setAiNotice({
          type: "success",
          title: "Pengaturan Tersimpan",
          message: "Konfigurasi 9router berhasil diperbarui.",
        });
        checkAiHealth();
        router.refresh();
      } else {
        setAiNotice({
          type: "error",
          title: "Gagal Menyimpan",
          message: res.error || "Gagal menyimpan konfigurasi AI.",
        });
      }
    } catch (err: unknown) {
      setAiNotice({
        type: "error",
        title: "Gagal Menyimpan",
        message: err instanceof Error ? err.message : "Gagal menyimpan konfigurasi AI.",
      });
    } finally {
      setSavingAiSettings(false);
    }
  };

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

  const handleMigrateAndApplyAllInOne = async () => {
    setApplyLoading(true);
    setMigrationLoading(true);
    setMigrationLogs(["==> Memulai proses migrasi dan pengalihan database remote..."]);
    setMigrationResult(null);

    try {
      const config = getRemoteConfig();
      const res = await migrateAndApplyDatabaseAction(config, {
        copyExistingData: copyDataOption,
        dropExistingTables: dropTablesOption,
      });

      setMigrationResult(res);
      if (res.logs && res.logs.length > 0) {
        setMigrationLogs(res.logs);
      }

      if (res.success && res.applied) {
        setIsApplyModalOpen(false);
        setAlertMsg({
          text: "Migrasi berhasil dan database remote kini aktif sebagai database utama aplikasi!",
          isError: false,
        });
        await loadActiveDbInfo();
        router.refresh();
      } else {
        setAlertMsg({
          text: `Gagal menyelesaikan migrasi/pengalihan: ${res.error || "Cek log terminal"}`,
          isError: true,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat migrasi.";
      setMigrationResult({ success: false, error: msg });
      setMigrationLogs((prev) => [...prev, `✗ Error tidak terduga: ${msg}`]);
      setAlertMsg({ text: msg, isError: true });
    } finally {
      setApplyLoading(false);
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

  const handleCopyUri = async () => {
    if (!activeDbInfo?.currentUri) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(activeDbInfo.currentUri);
        setCopiedUri(true);
        setTimeout(() => setCopiedUri(false), 2000);
      } else {
        throw new Error("Clipboard unavailable");
      }
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = activeDbInfo.currentUri;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedUri(true);
        setTimeout(() => setCopiedUri(false), 2000);
      } catch {
        // Fallback failed silently
      }
    }
  };

  // Realtime Polling Redis Status (15s interval)
  const checkRedisHealth = async () => {
    setCheckingRedis(true);
    try {
      const res = await fetch("/api/redis/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRedisHeartbeat({
          checked: true,
          isConnected: Boolean(data.connected),
          latencyMs: data.latencyMs,
          error: data.error,
        });
      } else {
        setRedisHeartbeat({
          checked: true,
          isConnected: false,
          error: "Endpoint status tidak dapat diakses",
        });
      }
    } catch {
      setRedisHeartbeat({
        checked: true,
        isConnected: false,
        error: "Gagal menghubungi endpoint status Redis",
      });
    } finally {
      setCheckingRedis(false);
    }
  };

  useEffect(() => {
    if (activeTab === "database" && technicalSubTab === "database" && redisEnabled) {
      checkRedisHealth();
      const interval = setInterval(checkRedisHealth, 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab, technicalSubTab, redisEnabled]);

  const handleToggleRedis = async () => {
    if (togglingRedis) return;
    setTogglingRedis(true);
    setRedisNotice(null);

    const nextState = !redisEnabled;
    setRedisEnabled(nextState);
    if (nextState) {
      setRedisHeartbeat({ checked: false, isConnected: false });
    } else {
      setRedisHeartbeat({ checked: true, isConnected: false });
    }
    const targetUrl = buildRedisUrl(redisHost, redisPort, redisPassword);

    try {
      const res = await updateRedisSettingsAction({
        redisEnabled: nextState,
        redisUrl: targetUrl,
      });

      if (res.success) {
        setRedisNotice({
          type: "success",
          title: nextState ? "Redis Diaktifkan" : "Redis Dinonaktifkan",
          message: nextState
            ? "Akselerasi cache Redis berhasil diaktifkan dan disimpan."
            : "Akselerasi Redis dinonaktifkan. Aplikasi beralih ke direct MySQL & in-memory cache.",
        });
      } else {
        setRedisNotice({
          type: "error",
          title: "Gagal Mengubah Status",
          message: res.error || "Gagal menyimpan status Redis.",
        });
        setRedisEnabled(!nextState);
        setRedisHeartbeat({ checked: true, isConnected: false });
      }
    } catch (err: unknown) {
      setRedisNotice({
        type: "error",
        title: "Terjadi Kesalahan",
        message: err instanceof Error ? err.message : "Terjadi kesalahan saat mengubah status Redis.",
      });
      setRedisEnabled(!nextState);
      setRedisHeartbeat({ checked: true, isConnected: false });
    } finally {
      setTogglingRedis(false);
    }
  };

  const handleTestRedisConnection = async () => {
    setTestingRedis(true);
    setRedisNotice(null);
    const targetUrl = buildRedisUrl(redisHost, redisPort, redisPassword);

    try {
      const res = await testRedisConnectionAction(targetUrl);
      if (res.success && res.connected) {
        // Otomatis aktifkan toggle dan simpan ke database agar status persisten & terhubung
        setRedisEnabled(true);
        await updateRedisSettingsAction({
          redisEnabled: true,
          redisUrl: targetUrl,
        });

        setRedisNotice({
          type: "success",
          title: `Koneksi Berhasil (${res.latencyMs} ms)`,
          message: "Server Redis aktif, terhubung, dan konfigurasi berhasil disimpan otomatis.",
        });
        setRedisHeartbeat({
          checked: true,
          isConnected: true,
          latencyMs: res.latencyMs,
        });
        router.refresh();
      } else {
        setRedisNotice({
          type: "error",
          title: "Koneksi Gagal",
          message: res.error || "Gagal menghubungi server Redis. Periksa host, port, atau password.",
        });
        setRedisHeartbeat({
          checked: true,
          isConnected: false,
          error: res.error,
        });
      }
    } catch (err: unknown) {
      setRedisNotice({
        type: "error",
        title: "Koneksi Gagal",
        message: err instanceof Error ? err.message : "Terjadi kesalahan saat menguji koneksi.",
      });
    } finally {
      setTestingRedis(false);
    }
  };

  const handleSaveRedisSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRedis(true);
    setRedisNotice(null);
    const targetUrl = buildRedisUrl(redisHost, redisPort, redisPassword);

    try {
      // Otomatis aktifkan toggle dan simpan ke database agar konfigurasi langsung aktif & persisten
      setRedisEnabled(true);
      const res = await updateRedisSettingsAction({
        redisEnabled: true,
        redisUrl: targetUrl,
      });

      if (res.success) {
        setRedisNotice({
          type: "success",
          title: "Pengaturan Tersimpan",
          message: "Konfigurasi Redis berhasil disimpan dan diaktifkan.",
        });
        await checkRedisHealth();
        router.refresh();
      } else {
        setRedisNotice({
          type: "error",
          title: "Gagal Menyimpan",
          message: res.error || "Gagal menyimpan konfigurasi Redis.",
        });
      }
    } catch (err: unknown) {
      setRedisNotice({
        type: "error",
        title: "Gagal Menyimpan",
        message: err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan konfigurasi.",
      });
    } finally {
      setSavingRedis(false);
    }
  };

  const handleUpdateIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appNameInput.trim()) return;
    setIdentityLoading(true);
    setAlertMsg(null);
    try {
      const res = await updateSystemIdentityAction({
        appName: appNameInput,
        footerText: footerTextInput,
      });
      if (!res.success) throw new Error(res.error);
      setAlertMsg({
        text: `Identitas sekolah dan teks footer berhasil diperbarui.`,
        isError: false,
      });
      router.refresh();
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Gagal menyimpan identitas sistem.",
        isError: true,
      });
    } finally {
      setIdentityLoading(false);
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

  const handleAdminChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !adminNewPassword ||
      adminNewPassword.length < 6 ||
      adminNewPassword !== adminConfirmPassword
    ) {
      return;
    }

    setAdminPasswordLoading(true);
    try {
      const res = await updateAdminSelfPasswordAction({
        newPassword: adminNewPassword,
        confirmPassword: adminConfirmPassword,
      });

      if (!res.success) {
        setAlertMsg({
          text: res.error || "Gagal memperbarui kata sandi admin.",
          isError: true,
        });
        setAdminPasswordLoading(false);
        return;
      }

      setAlertMsg({
        text: "Kata sandi admin berhasil diperbarui. Mengalihkan ke halaman login...",
        isError: false,
      });

      setAdminNewPassword("");
      setAdminConfirmPassword("");

      setTimeout(() => {
        window.location.href = res.redirectUrl || "/login";
      }, 1000);
    } catch (err: unknown) {
      setAlertMsg({
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat memperbarui kata sandi.",
        isError: true,
      });
      setAdminPasswordLoading(false);
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
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[var(--ink)]">
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
              <div className="p-2 rounded-xl bg-[var(--primary)]/15 text-[var(--primary)] shadow-xs flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="text-base sm:text-lg font-bold font-heading text-[var(--ink)]">
                Superadmin
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
              title="Buka Dashboard"
              aria-label="Buka Dashboard"
            >
              <School className="w-4 h-4" aria-hidden="true" />
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button
                type="submit"
                className="touch-target inline-flex items-center justify-center p-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-[var(--ink-muted)] hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                title="Keluar"
                aria-label="Keluar"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 pb-24 md:pb-6 space-y-6">
        {/* Closable Popup Notification Banner (R2) */}
        {alertMsg && (
          <div
            role="alert"
            aria-live="polite"
            className={`fixed top-20 right-4 sm:right-6 z-[60] max-w-md w-[calc(100%-2rem)] sm:w-auto flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border shadow-xl backdrop-blur-md text-sm font-semibold transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
              alertMsg.isError
                ? "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]"
                : "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {alertMsg.isError ? (
                <AlertCircle className="w-5 h-5 shrink-0 text-[var(--status-alpa-fg)]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-[var(--status-success-fg)]" aria-hidden="true" />
              )}
              <span>{alertMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertMsg(null)}
              className="touch-target inline-flex items-center justify-center p-1.5 -mr-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-current transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
              title="Tutup notifikasi"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Overview Stats (R3) */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="w-full card-paper px-3.5 py-3 sm:p-5 rounded-xl sm:rounded-2xl">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate">Total Kelas</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold font-heading text-[var(--ink)]">
              {initialClasses.length}
            </p>
          </div>

          <div className="w-full card-paper px-3.5 py-3 sm:p-5 rounded-xl sm:rounded-2xl">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-slate)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate">Total Wali Kelas</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold font-heading text-[var(--ink)]">
              {initialTeachers.length}
            </p>
          </div>

          <div className="w-full card-paper px-3.5 py-3 sm:p-5 rounded-xl sm:rounded-2xl">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
              <span className="w-2 h-2 rounded-full bg-[var(--status-success-fg)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate">Total Siswa Aktif</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold font-heading text-[var(--ink)]">
              {totalStudentsOverall}
            </p>
          </div>

          <div className="w-full card-paper px-3.5 py-3 sm:p-5 rounded-xl sm:rounded-2xl">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-[var(--ink-muted)] truncate">Total Ketidakhadiran</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold font-heading text-[var(--ink)]">
              {totalAbsencesOverall}
            </p>
          </div>
        </div>

        {/* Tab Header & Action (R5 & R6: Responsive Tabs / Mobile Header) */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
          {/* Desktop Tabs (hidden on mobile, visible on desktop) */}
          <div className="hidden md:flex gap-4 overflow-x-auto">
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
              <span>Pengaturan Tampilan</span>
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
              <Cpu className="w-4 h-4" />
              <span>Pengaturan Teknis</span>
            </button>
          </div>

          {/* Mobile Current Section Title (hidden on desktop, visible on mobile) */}
          <h2 className="md:hidden text-sm font-bold text-[var(--ink)]">
            {activeTab === "classes" && `Manajemen Kelas (${initialClasses.length})`}
            {activeTab === "teachers" && `Akun Wali Kelas (${initialTeachers.length})`}
            {activeTab === "settings" && "Pengaturan Tampilan"}
            {activeTab === "database" && "Pengaturan Teknis"}
          </h2>

          {/* Actions */}
          <div className="shrink-0">
            {activeTab === "classes" && (
              <button
                type="button"
                onClick={() => {
                  setClassSlugInput(generateRandomClassCode(3));
                  setIsClassModalOpen(true);
                }}
                className="touch-target hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Kelas Baru</span>
              </button>
            )}
            {activeTab === "teachers" && (
              <button
                type="button"
                onClick={() => setIsTeacherModalOpen(true)}
                className="touch-target hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Wali Kelas</span>
              </button>
            )}
            {activeTab === "settings" && (
              <span className="hidden md:inline text-xs font-medium text-[var(--ink-muted)]">
                Pengaturan tampilan identitas, tema warna, dan latar belakang
              </span>
            )}
            {activeTab === "database" && (
              <span className="hidden md:inline text-xs font-medium text-[var(--ink-muted)]">
                Integrasi AI, koneksi basis data, migrasi skema, &amp; alihkan sistem
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
                    <tr
                      key={c.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, [role='button']")) return;
                        setEditingClass(c);
                        setEditClassName(c.name);
                        setEditClassSlug(c.slug);
                        setEditClassYear(c.academicYear);
                        setEditClassPeriod(c.periodTitle);
                        setEditClassTeacherId(c.waliKelasId);
                        setEditClassActive(c.isActive);
                      }}
                      className="hover:bg-[var(--canvas-subtle)] transition-colors cursor-pointer"
                      title={`Klik baris untuk edit pengaturan kelas ${c.name}`}
                    >
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
                            className="touch-target p-2 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                            title={`Edit Pengaturan Kelas ${c.name}`}
                            aria-label={`Edit pengaturan kelas ${c.name}`}
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
                    <tr
                      key={t.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, [role='button']")) return;
                        setEditingTeacher(t);
                        setEditTeacherName(t.displayName);
                        setEditTeacherPassword("");
                        setEditTeacherPasswordConfirm("");
                        setShowEditTeacherPassword(false);
                        setShowEditTeacherPasswordConfirm(false);
                        setEditTeacherActive(t.isActive);
                        setEditTeacherClassId(t.assignedClassId || null);
                      }}
                      className="hover:bg-[var(--canvas-subtle)] transition-colors cursor-pointer"
                      title={`Klik baris untuk edit data wali kelas ${t.displayName}`}
                    >
                      <td className="px-4 py-3 font-bold text-[var(--ink)]">
                        {t.displayName}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--ink-muted)]">
                        {t.username}
                      </td>
                      <td className="px-4 py-3">
                        {t.assignedClassName ? (
                          <span className="font-semibold text-xs text-[var(--ink)] whitespace-nowrap">
                            {t.assignedClassName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--ink-muted)] italic whitespace-nowrap">
                            Belum ditugaskan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-medium text-[var(--ink-muted)] whitespace-nowrap">
                        {t.role === "wali_kelas" ? "Wali Kelas" : t.role === "superadmin" ? "Superadmin" : t.role}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold text-xs whitespace-nowrap ${
                            t.isActive
                              ? "text-[var(--status-success-fg)]"
                              : "text-[var(--status-alpa-fg)]"
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
                          className="touch-target p-2 rounded-lg text-[var(--ink-muted)] hover:text-[var(--primary)] hover:bg-[var(--canvas-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                          title={`Edit Data Wali Kelas ${t.displayName}`}
                          aria-label={`Edit data dan kelas wali kelas ${t.displayName}`}
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
            {/* Section 1: Identitas Sistem & Teks Footer */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <School className="w-5 h-5 text-[var(--primary)]" />
                  <span>Identitas Sistem &amp; Teks Footer</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Atur nama resmi instansi sekolah serta catatan hak cipta footer yang tampil di seluruh aplikasi.
                </p>
              </div>

              <form onSubmit={handleUpdateIdentity} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="app-name-input" className="block text-xs font-semibold text-[var(--ink)] mb-1">
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
                    <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                      Tampil di header navigasi, halaman login, dan judul tab browser.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="footer-text-input" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                      Teks Footer &amp; Catatan Hak Cipta
                    </label>
                    <input
                      id="footer-text-input"
                      type="text"
                      maxLength={255}
                      value={footerTextInput}
                      onChange={(e) => setFooterTextInput(e.target.value)}
                      placeholder="Contoh: SMK Negeri 1 Surabaya - Dibuat untuk kenyamanan bersama"
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    />
                    <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                      Jika dikosongkan, sistem otomatis menggunakan teks bawaan aplikasi.
                    </p>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--canvas-subtle)] space-y-1">
                  <span className="text-[10px] font-bold text-[var(--ink-muted)] uppercase tracking-wider block">
                    Pratinjau Langsung (Live Preview) Footer:
                  </span>
                  <p className="text-xs text-[var(--ink-muted)] font-mono">
                    &copy; {new Date().getFullYear()} {footerTextInput.trim() || initialSettings?.footerText || "Sistem Surat Izin & Ketidakhadiran Siswa."}
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={identityLoading || !appNameInput.trim()}
                    className="touch-target inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {identityLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Simpan Perubahan Identitas</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[var(--primary)]" />
                  <span>Logo Sekolah &amp; Ikon Aplikasi (PWA / Favicon)</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Logo ini otomatis tampil di header navigasi, halaman login, favicon browser, dan ikon aplikasi saat <strong>Add to Home Screen</strong> di ponsel Android maupun iPhone.
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
                        Format: PNG, JPG, WEBP, atau SVG. Ukuran maksimal 2MB. Otomatis dikonversi dan disinkronkan ke favicon browser dan ikon aplikasi ponsel (Android &amp; iOS PWA).
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

            {/* Section 2: Tema Warna */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <Palette className="w-5 h-5 text-[var(--primary)]" />
                  <span>Tema Warna</span>
                </h2>
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
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--primary)] text-white">
                              Aktif
                            </span>
                          )}
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

            {/* Section 3: Tema Latar Belakang (5 Pilihan Terkurasi) */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <Palette className="w-5 h-5 text-[var(--primary)]" />
                  <span>Tema Latar Belakang</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                {BG_THEME_PRESETS.map((bgPreset) => {
                  const isSelected = currentBgTheme === bgPreset.id;
                  return (
                    <button
                      key={bgPreset.id}
                      type="button"
                      onClick={() => handleSelectBgTheme(bgPreset.id)}
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
                              style={{ backgroundColor: bgPreset.lightCanvasHex }}
                            />
                            <span className="font-bold text-sm text-[var(--ink)] font-heading">
                              {bgPreset.name}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--primary)] text-white">
                              Aktif
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--ink-muted)] leading-relaxed mb-3">
                          {bgPreset.description}
                        </p>
                      </div>

                      {/* Swatches preview */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)] mt-auto">
                        <span className="text-[10px] text-[var(--ink-muted)] font-medium">Palet:</span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1" title="Mode Terang: Kanvas & Kartu">
                            <span
                              className="w-4 h-4 rounded-md shadow-xs border border-black/15"
                              style={{ backgroundColor: bgPreset.lightCanvasHex }}
                              title="Kanvas (Terang)"
                            />
                            <span
                              className="w-4 h-4 rounded-md shadow-xs border border-black/15"
                              style={{ backgroundColor: bgPreset.lightSurfaceHex }}
                              title="Kartu (Terang)"
                            />
                          </div>
                          <span className="text-[var(--border-strong)] opacity-30 text-xs">&bull;</span>
                          <div className="flex items-center gap-1" title="Mode Gelap: Kanvas & Kartu">
                            <span
                              className="w-4 h-4 rounded-md shadow-xs border border-white/20"
                              style={{ backgroundColor: bgPreset.darkCanvasHex }}
                              title="Kanvas (Gelap)"
                            />
                            <span
                              className="w-4 h-4 rounded-md shadow-xs border border-white/20"
                              style={{ backgroundColor: bgPreset.darkSurfaceHex }}
                              title="Kartu (Gelap)"
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Keamanan Akun Admin */}
            <div className="card-paper p-6 rounded-2xl space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[var(--primary)]" />
                  <span>Keamanan Akun Admin</span>
                </h2>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                  Ganti kata sandi akun login Superadmin. Setelah kata sandi diperbarui, sesi Anda akan otomatis diakhiri dan dialihkan ke halaman login.
                </p>
              </div>

              <form onSubmit={handleAdminChangePassword} className="space-y-4 max-w-xl">
                <div>
                  <label
                    htmlFor="admin-new-password"
                    className="block text-xs font-bold text-[var(--ink)] mb-1"
                  >
                    Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <input
                      id="admin-new-password"
                      type={showAdminNewPassword ? "text" : "password"}
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      placeholder="Masukkan kata sandi baru (min. 6 karakter)"
                      className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminNewPassword(!showAdminNewPassword)}
                      className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      title={showAdminNewPassword ? "Sembunyikan password" : "Lihat password"}
                      aria-label={showAdminNewPassword ? "Sembunyikan kata sandi baru" : "Tampilkan kata sandi baru"}
                    >
                      {showAdminNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {adminNewPassword.length > 0 && adminNewPassword.length < 6 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> Minimal 6 karakter (saat ini {adminNewPassword.length}/6)
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="admin-confirm-password"
                    className="block text-xs font-bold text-[var(--ink)] mb-1"
                  >
                    Ketik Ulang Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <input
                      id="admin-confirm-password"
                      type={showAdminConfirmPassword ? "text" : "password"}
                      value={adminConfirmPassword}
                      onChange={(e) => setAdminConfirmPassword(e.target.value)}
                      placeholder="Ketik ulang kata sandi baru"
                      className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                      className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      title={showAdminConfirmPassword ? "Sembunyikan konfirmasi password" : "Lihat konfirmasi password"}
                      aria-label={showAdminConfirmPassword ? "Sembunyikan konfirmasi kata sandi" : "Tampilkan konfirmasi kata sandi"}
                    >
                      {showAdminConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Realtime verification feedback */}
                  {adminConfirmPassword.length > 0 && (
                    <div className="mt-1.5">
                      {adminNewPassword === adminConfirmPassword ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Kata sandi cocok
                        </span>
                      ) : (
                        <span className="text-[11px] text-red-500 dark:text-red-400 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Kata sandi belum cocok
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={
                      adminPasswordLoading ||
                      !adminNewPassword ||
                      adminNewPassword.length < 6 ||
                      adminNewPassword !== adminConfirmPassword
                    }
                    className="touch-target inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {adminPasswordLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Perbarui Kata Sandi &amp; Keluar</span>
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}

        {/* Tab 4: Pengaturan Teknis (AI & Database) */}
        {activeTab === "database" && (
          <div className="space-y-6">
            {/* Segmented Sub-Tab Switcher (Centered, borderless pill, clean spacing) */}
            <div className="flex items-center justify-center py-2 mb-6">
              <div
                role="tablist"
                aria-label="Kategori Pengaturan Teknis"
                className="inline-flex p-1.5 rounded-full bg-[var(--canvas-subtle)] shadow-xs"
              >
                <button
                  type="button"
                  role="tab"
                  id="tech-tab-ai"
                  aria-selected={technicalSubTab === "ai"}
                  aria-controls="tech-panel-ai"
                  onClick={() => setTechnicalSubTab("ai")}
                  className={`touch-target flex items-center gap-2 px-5 py-2 rounded-full text-xs transition-all ${
                    technicalSubTab === "ai"
                      ? "bg-[var(--surface)] text-[var(--ink)] font-bold shadow-sm"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)] font-medium"
                  }`}
                >
                  <Cpu className="w-4 h-4" />
                  <span>Integrasi AI</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tech-tab-database"
                  aria-selected={technicalSubTab === "database"}
                  aria-controls="tech-panel-database"
                  onClick={() => setTechnicalSubTab("database")}
                  className={`touch-target flex items-center gap-2 px-5 py-2 rounded-full text-xs transition-all ${
                    technicalSubTab === "database"
                      ? "bg-[var(--surface)] text-[var(--ink)] font-bold shadow-sm"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)] font-medium"
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>Manajemen Basis Data</span>
                </button>
              </div>
            </div>

            {/* ============================================================= */}
            {/* SUBTAB 1: INTEGRASI AI                                        */}
            {/* ============================================================= */}
            {technicalSubTab === "ai" && (
              <div
                role="tabpanel"
                id="tech-panel-ai"
                aria-labelledby="tech-tab-ai"
                className="space-y-6"
              >
                <section aria-labelledby="section-ai-heading">
              <div className="card-paper p-6 rounded-2xl space-y-5">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[var(--primary)]/15 text-[var(--primary)] shrink-0">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 id="section-ai-heading" className="text-base font-bold font-heading text-[var(--ink)]">
                        Integrasi AI
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-xs font-semibold ${aiEnabled ? "text-[var(--primary)]" : "text-[var(--ink-muted)]"}`}>
                      {aiEnabled ? "Aktif" : "Nonaktif"}
                    </span>
                    <div className="flex items-center min-h-[44px]">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={aiEnabled}
                        aria-label="Aktifkan Integrasi 9Router"
                        disabled={togglingAi}
                        onClick={handleToggleAi}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2 ${
                          aiEnabled
                            ? "bg-[var(--primary)] border-[var(--primary)]"
                            : "bg-[var(--canvas-subtle)] border-[var(--border-strong)]"
                        } ${togglingAi ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            aiEnabled ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status Bar Terpadu Ala Database */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs py-2.5 px-4 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        !aiEnabled
                          ? "bg-neutral-400 dark:bg-neutral-600"
                          : aiHeartbeat.isConnected
                          ? "bg-emerald-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span
                      className={`font-bold ${
                        !aiEnabled
                          ? "text-[var(--ink-muted)]"
                          : aiHeartbeat.isConnected
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {!aiEnabled
                        ? "Nonaktif"
                        : aiHeartbeat.isConnected
                        ? "Online"
                        : "Offline / Belum Terhubung"}
                    </span>
                  </div>

                  <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                  <span className="font-semibold text-[var(--ink)]">Gateway 9Router</span>

                  <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                  <span className="font-mono text-[var(--ink-muted)] truncate max-w-[200px]" title={aiRouterUrl}>
                    {aiRouterUrl || "http://127.0.0.1:20128/v1"}
                  </span>

                  {aiEnabled && aiHeartbeat.latencyMs !== undefined && (
                    <>
                      <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                      <span className="font-mono text-[var(--ink-muted)]">
                        {aiHeartbeat.latencyMs} ms
                      </span>
                    </>
                  )}

                  {aiRouterModel && (
                    <>
                      <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                      <span className="font-mono text-[var(--ink-muted)] truncate max-w-[200px]" title={aiRouterModel}>
                        {aiRouterModel}
                      </span>
                    </>
                  )}

                  <div className="ml-auto flex items-center">
                    <button
                      type="button"
                      onClick={checkAiHealth}
                      disabled={testingAi || !aiEnabled}
                      className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] cursor-pointer disabled:opacity-50 transition-colors"
                      title="Periksa status koneksi 9router"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingAi ? "animate-spin text-[var(--primary)]" : "text-[var(--ink-muted)]"}`} />
                      <span>Periksa Status</span>
                    </button>
                  </div>
                </div>

                {/* Kartu Status Aktif Terhubung Bergaya Soft Slate (Persis Banner Database Remote) */}
                {aiEnabled && aiHeartbeat.isConnected && (
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-[var(--accent-slate-light)] text-[var(--accent-slate)] shrink-0 mt-0.5">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--ink)]">
                          Layanan 9Router AI Aktif &amp; Terhubung
                        </p>
                        <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                          Ekstraksi berkas OCR surat izin saat ini diproses menggunakan model <span className="font-mono font-bold text-[var(--ink)]">{aiRouterModel}</span> ({aiHeartbeat.latencyMs} ms).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              {/* Floating Notification saat AI Nonaktif */}
              {aiNotice && !aiEnabled && (
                <div
                  role="alert"
                  aria-live="polite"
                  className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-xs ${
                    aiNotice.type === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                      : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {aiNotice.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      {aiNotice.title && <p className="font-bold leading-tight">{aiNotice.title}</p>}
                      <p className={aiNotice.title ? "mt-0.5 opacity-90" : "font-medium"}>{aiNotice.message}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiNotice(null)}
                    className="p-1 -mr-1 -mt-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-opacity cursor-pointer"
                    aria-label="Tutup notifikasi"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Form Konfigurasi (Hanya tampil jika toggle aktif) */}
              {aiEnabled && (
                <form onSubmit={handleSaveAiSettings} className="space-y-4">
                  {/* Grid Input: URL Endpoint & API Key */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ai-url-input" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                        URL Endpoint 9router
                      </label>
                      <input
                        id="ai-url-input"
                        type="url"
                        required
                        value={aiRouterUrl}
                        onChange={(e) => setAiRouterUrl(e.target.value)}
                        placeholder="http://127.0.0.1:20128/v1"
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                      />
                      <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                        Standar gateway lokal: <code className="bg-[var(--canvas-subtle)] px-1 rounded">http://127.0.0.1:20128/v1</code>
                      </p>
                    </div>

                    <div>
                      <label htmlFor="ai-key-input" className="block text-xs font-semibold text-[var(--ink)] mb-1">
                        API Key 9router
                      </label>
                      <div className="relative">
                        <input
                          id="ai-key-input"
                          type={showAiApiKey ? "text" : "password"}
                          value={aiRouterApiKey}
                          onChange={(e) => setAiRouterApiKey(e.target.value)}
                          placeholder="sk-..."
                          className="w-full pr-10 pl-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAiApiKey(!showAiApiKey)}
                          tabIndex={-1}
                          className="touch-target absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                          aria-label={showAiApiKey ? "Sembunyikan API key" : "Lihat API key"}
                        >
                          {showAiApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--ink-muted)] mt-1">
                        Opsional jika 9router lokal tidak memerlukan autentikasi.
                      </p>
                    </div>
                  </div>

                  {/* Tombol Uji Koneksi & Status Dot (Tepat di bawah URL & API Key) */}
                  <div className="flex flex-wrap items-center gap-3 pt-0.5">
                    <button
                      type="button"
                      onClick={handleTestAiConnection}
                      disabled={testingAi}
                      className="touch-target inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {testingAi ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-[var(--primary)]" />
                      )}
                      <span>Uji Koneksi</span>
                    </button>

                    <div
                      className="inline-flex items-center gap-2 text-xs font-mono text-[var(--ink-muted)] px-1"
                      title={aiHeartbeat.isConnected ? `Terhubung (${aiHeartbeat.latencyMs} ms)` : "Belum terhubung"}
                    >
                      <span
                        className={`w-2 h-2 rounded-full transition-colors ${
                          aiHeartbeat.isConnected ? "bg-emerald-500" : "bg-neutral-400 dark:bg-neutral-600"
                        }`}
                      />
                      <span>
                        {aiHeartbeat.isConnected
                          ? `${aiHeartbeat.latencyMs} ms (Terhubung)`
                          : "Belum terhubung / Offline"}
                      </span>
                    </div>
                  </div>

                  {/* Pilihan Model */}
                  <div className="space-y-1.5 pt-1">
                    <label htmlFor="ai-model-input" className="block text-xs font-semibold text-[var(--ink)]">
                      Pilihan Model
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {availableModels.length > 0 ? (
                        <select
                          id="ai-model-input"
                          value={aiRouterModel}
                          onChange={(e) => setAiRouterModel(e.target.value)}
                          className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                        >
                          {availableModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="ai-model-input"
                          type="text"
                          value={aiRouterModel}
                          onChange={(e) => setAiRouterModel(e.target.value)}
                          placeholder="gemini/gemini-2.5-flash"
                          className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                        />
                      )}

                      <button
                        type="button"
                        onClick={handleFetchModels}
                        disabled={fetchingModels}
                        className="touch-target inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-semibold text-[var(--ink)] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? "animate-spin" : "text-[var(--primary)]"}`} />
                        <span>Ambil Model dari 9router</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--ink-muted)]">
                      Direkomendasikan model multimodal (contoh: <code className="bg-[var(--canvas-subtle)] px-1 rounded">gemini/gemini-2.5-flash</code>).
                    </p>
                  </div>

                  {/* Floating In-Card Popup Banner Notification */}
                  {aiNotice && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-xs ${
                        aiNotice.type === "success"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                          : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {aiNotice.type === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          {aiNotice.title && <p className="font-bold leading-tight">{aiNotice.title}</p>}
                          <p className={aiNotice.title ? "mt-0.5 opacity-90" : "font-medium"}>{aiNotice.message}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiNotice(null)}
                        className="p-1 -mr-1 -mt-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-opacity cursor-pointer"
                        aria-label="Tutup notifikasi"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Action Buttons (Footer: Hanya Simpan Pengaturan) */}
                  <div className="flex items-center justify-end pt-3 border-t border-[var(--border)]">
                    <button
                      type="submit"
                      disabled={savingAiSettings}
                      className="touch-target inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] text-xs font-bold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {savingAiSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>Simpan Pengaturan</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ============================================================= */}
      {/* SUBTAB 2: MANAJEMEN BASIS DATA (DATABASE)                     */}
      {/* ============================================================= */}
      {technicalSubTab === "database" && (
        <div
          role="tabpanel"
          id="tech-panel-database"
          aria-labelledby="tech-tab-database"
          className="space-y-6"
        >
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs py-2.5 px-4 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          activeDbInfo.isConnected ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                      <span
                        className={`font-bold ${
                          activeDbInfo.isConnected
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-700 dark:text-red-400"
                        }`}
                      >
                        {activeDbInfo.isConnected ? "Online" : "Offline"}
                      </span>
                    </div>

                    <span className="text-[var(--border-strong)] opacity-40">&bull;</span>

                    <span className="font-semibold text-[var(--ink)]">
                      {activeDbInfo.isLocal ? "Database MariaDB Lokal" : "Database Remote Aktif"}
                    </span>

                    <span className="text-[var(--border-strong)] opacity-40">&bull;</span>

                    <span className="font-mono text-[var(--ink-muted)]">
                      {activeDbInfo.host}:{activeDbInfo.port}
                    </span>

                    {activeDbInfo.latencyMs !== undefined && (
                      <>
                        <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                        <span className="font-mono text-[var(--ink-muted)]">
                          {activeDbInfo.latencyMs} ms
                        </span>
                      </>
                    )}

                    {activeDbInfo.serverVersion && (
                      <>
                        <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                        <span className="font-mono text-[var(--ink-muted)] truncate max-w-[240px]" title={activeDbInfo.serverVersion}>
                          {activeDbInfo.serverVersion}
                        </span>
                      </>
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

                  <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                          Connection URI Aktif
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border border-[var(--border)]">
                          Disensor
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyUri}
                        className="touch-target inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border)] bg-[var(--canvas-subtle)] hover:bg-[var(--border)] text-[var(--ink)] cursor-pointer transition-colors"
                        title="Salin Connection URI ke Clipboard"
                      >
                        {copiedUri ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                            <span>Salin URI</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-xs text-[var(--ink)] bg-[var(--canvas-subtle)] p-2.5 rounded-lg border border-[var(--border)] break-all select-all">
                      {activeDbInfo.currentUri}
                    </div>
                  </div>

                  {!activeDbInfo.isLocal && (
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-[var(--accent-slate-light)] text-[var(--accent-slate)] shrink-0 mt-0.5">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[var(--ink)]">
                            Koneksi Database Remote Aktif
                          </p>
                          <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                            Sistem terhubung ke database eksternal. Anda dapat beralih kembali ke basis data lokal kapan saja.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRevertModalOpen(true)}
                        className="touch-target inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] text-xs font-bold shadow-xs cursor-pointer transition-colors whitespace-nowrap shrink-0"
                      >
                        <ArrowRightLeft className="w-4 h-4 text-[var(--accent-slate)]" />
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
                      Hapus &amp; buat ulang tabel (DROP TABLES)
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] block">
                      Mereset seluruh data kelas dan absensi ke kondisi bersih di remote. Akun Superadmin lokal dijamin tetap tersimpan aman sehingga Anda tidak akan terkunci.
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testDbLoading || migrationLoading || applyLoading || (!remoteHost && !remoteUri)}
                  className="touch-target inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-bold text-[var(--ink)] transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                >
                  {testDbLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                  ) : (
                    <Wifi className="w-4 h-4 text-[var(--primary)]" />
                  )}
                  <span>Uji Koneksi Saja</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(true)}
                  disabled={testDbLoading || migrationLoading || applyLoading || (!remoteHost && !remoteUri)}
                  className="touch-target inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                >
                  {migrationLoading || applyLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-4 h-4" />
                  )}
                  <span>Migrasi &amp; Aktifkan Database Remote</span>
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
              {/* Safe bottom margin inside technical tab */}
              <div className="pb-6" />
            </div>

            {/* ============================================================= */}
            {/* CARD 4: REDIS CACHE SERVER                                    */}
            {/* ============================================================= */}
            <div className="border-t border-[var(--border)] my-6" />

            <section aria-labelledby="section-redis-heading">
              <div className="card-paper p-6 rounded-2xl space-y-4">
                {/* Header & Toggle */}
                <div
                  className={`flex items-center justify-between gap-4 ${
                    redisEnabled ? "border-b border-[var(--border)] pb-3" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] shrink-0">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h2
                        id="section-redis-heading"
                        className="text-base font-bold font-heading text-[var(--ink)]"
                      >
                        Redis Cache Server
                      </h2>
                      <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                        Akselerasi query basis data, rate limiting terdistribusi, dan caching inferensi dokumen.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-medium text-[var(--ink-muted)] hidden sm:inline">
                      {redisEnabled ? "Aktif" : "Nonaktif"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={redisEnabled}
                      onClick={handleToggleRedis}
                      disabled={togglingRedis}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50 ${
                        redisEnabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
                      }`}
                      title={redisEnabled ? "Nonaktifkan Redis" : "Aktifkan Redis"}
                    >
                      <span className="sr-only">Toggle Redis Cache</span>
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          redisEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Floating Notification */}
                {redisNotice && (
                  <div
                    role="alert"
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs animate-in fade-in duration-200 ${
                      redisNotice.type === "success"
                        ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                        : "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
                    }`}
                  >
                    {redisNotice.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      {redisNotice.title && (
                        <p className="font-bold">{redisNotice.title}</p>
                      )}
                      <p className="opacity-90">{redisNotice.message}</p>
                    </div>
                  </div>
                )}

                {/* Realtime Status Indicator Bar & Configuration Form (Hanya Tampil Saat Toggle Enable) */}
                {redisEnabled && (
                  <>
                    {/* Realtime Status Indicator Bar (Serasi dengan Card Database) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs py-2.5 px-4 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              checkingRedis
                                ? "bg-amber-400 animate-pulse"
                                : !redisHeartbeat.checked
                                ? "bg-amber-400"
                                : redisHeartbeat.isConnected
                                ? "bg-emerald-500"
                                : "bg-red-500"
                            }`}
                          />
                          <span
                            className={`font-bold ${
                              checkingRedis || !redisHeartbeat.checked
                                ? "text-amber-700 dark:text-amber-300"
                                : redisHeartbeat.isConnected
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-red-700 dark:text-red-400"
                            }`}
                          >
                            {checkingRedis
                              ? "Memeriksa..."
                              : !redisHeartbeat.checked
                              ? "Siap Diuji"
                              : redisHeartbeat.isConnected
                              ? "Online"
                              : "Offline"}
                          </span>
                        </div>

                        <span className="text-[var(--border-strong)] opacity-40">&bull;</span>

                        <span className="font-semibold text-[var(--ink)]">
                          Redis Cache Server
                        </span>

                        <span className="text-[var(--border-strong)] opacity-40">&bull;</span>

                        <span className="font-mono text-[var(--ink-muted)]">
                          {redisHost || "127.0.0.1"}:{redisPort || "6379"}
                        </span>

                        {redisHeartbeat.isConnected && redisHeartbeat.latencyMs !== undefined && (
                          <>
                            <span className="text-[var(--border-strong)] opacity-40">&bull;</span>
                            <span className="font-mono text-[var(--ink-muted)]">
                              {redisHeartbeat.latencyMs} ms
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={checkRedisHealth}
                          disabled={checkingRedis}
                          className="touch-target inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-[var(--ink)] cursor-pointer disabled:opacity-50 transition-colors"
                          title="Periksa status koneksi Redis sekarang"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${checkingRedis ? "animate-spin" : ""}`} />
                          <span>Periksa Status</span>
                        </button>
                      </div>
                    </div>

                    {/* Redis Structured Configuration Form */}
                    <form onSubmit={handleSaveRedisSettings} className="space-y-4 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-2">
                          <label
                            htmlFor="redis-host-input"
                            className="block text-xs font-semibold text-[var(--ink-muted)] mb-1"
                          >
                            Host / Alamat Server Redis
                          </label>
                          <input
                            id="redis-host-input"
                            type="text"
                            value={redisHost}
                            onChange={(e) => setRedisHost(e.target.value)}
                            placeholder="Contoh: 127.0.0.1 atau 192.168.47.20"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                            spellCheck={false}
                            autoCapitalize="none"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="redis-port-input"
                            className="block text-xs font-semibold text-[var(--ink-muted)] mb-1"
                          >
                            Port Redis
                          </label>
                          <input
                            id="redis-port-input"
                            type="text"
                            value={redisPort}
                            onChange={(e) => setRedisPort(e.target.value)}
                            placeholder="6379"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                            spellCheck={false}
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="redis-password-input"
                          className="block text-xs font-semibold text-[var(--ink-muted)] mb-1"
                        >
                          Password Redis (Opsional)
                        </label>
                        <div className="relative">
                          <input
                            id="redis-password-input"
                            type={showRedisPassword ? "text" : "password"}
                            value={redisPassword}
                            onChange={(e) => setRedisPassword(e.target.value)}
                            placeholder="Kosongkan jika tanpa password"
                            className="w-full pl-3 pr-10 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            onClick={() => setShowRedisPassword(!showRedisPassword)}
                            className="touch-target absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                            title={showRedisPassword ? "Sembunyikan password Redis" : "Lihat password Redis"}
                          >
                            {showRedisPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Synchronized URI Preview */}
                      <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)]">
                        <span className="block text-[11px] font-semibold text-[var(--ink-muted)] mb-0.5">
                          URI Tersinkron (Otomatis):
                        </span>
                        <span className="font-mono text-xs text-[var(--ink)] break-all block">
                          {formatMaskedRedisUrl(redisHost, redisPort, redisPassword)}
                        </span>
                      </div>

                      {/* Action Buttons Toolbar */}
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handleTestRedisConnection}
                          disabled={testingRedis || savingRedis}
                          className="touch-target inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] text-xs font-bold text-[var(--ink)] transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                        >
                          {testingRedis ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                          ) : (
                            <Wifi className="w-4 h-4 text-[var(--primary)]" />
                          )}
                          <span>{testingRedis ? "Menguji..." : "Uji Koneksi"}</span>
                        </button>

                        <button
                          type="submit"
                          disabled={savingRedis || testingRedis}
                          className="touch-target inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                        >
                          {savingRedis ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          <span>{savingRedis ? "Menyimpan..." : "Simpan Pengaturan"}</span>
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    )}

        {/* Floating Action Button (FAB) on Mobile for Classes and Teachers */}
        {(activeTab === "classes" || activeTab === "teachers") && (
          <button
            type="button"
            onClick={() => {
              if (activeTab === "classes") {
                setClassSlugInput(generateRandomClassCode(3));
                setIsClassModalOpen(true);
              } else {
                setIsTeacherModalOpen(true);
              }
            }}
            className="touch-target md:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center bg-[var(--primary)] text-white shadow-lg hover:bg-[var(--primary-hover)] active:scale-95 transition-all border border-white/10"
            aria-label={activeTab === "classes" ? "Buat Kelas Baru" : "Tambah Wali Kelas"}
            title={activeTab === "classes" ? "Buat Kelas Baru" : "Tambah Wali Kelas"}
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {/* In-flow AppFooter right below content, clears fixed bottom nav bar */}
        <AppFooter text={footerTextInput} className="pb-20 md:pb-6 pt-4" />
      </main>

      {/* 4-Tab Bottom Navigation Bar on Mobile (R5 & R6) */}
      <nav
        aria-label="Navigasi Bawah Admin"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface)] border-t border-[var(--border)] shadow-lg px-3 py-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] flex items-center justify-around gap-1"
      >
        <button
          type="button"
          onClick={() => setActiveTab("classes")}
          aria-label="Manajemen Kelas"
          aria-current={activeTab === "classes" ? "page" : undefined}
          title="Manajemen Kelas"
          className={`touch-target flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
            activeTab === "classes"
              ? "text-[var(--primary)] bg-[var(--primary)]/15 font-bold shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
          }`}
        >
          <School className="w-5 h-5" />
          <span className="sr-only">Manajemen Kelas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("teachers")}
          aria-label="Akun Wali Kelas"
          aria-current={activeTab === "teachers" ? "page" : undefined}
          title="Akun Wali Kelas"
          className={`touch-target flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
            activeTab === "teachers"
              ? "text-[var(--primary)] bg-[var(--primary)]/15 font-bold shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="sr-only">Akun Wali Kelas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          aria-label="Pengaturan Tampilan"
          aria-current={activeTab === "settings" ? "page" : undefined}
          title="Pengaturan Tampilan"
          className={`touch-target flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
            activeTab === "settings"
              ? "text-[var(--primary)] bg-[var(--primary)]/15 font-bold shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
          }`}
        >
          <Palette className="w-5 h-5" />
          <span className="sr-only">Pengaturan Tampilan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("database")}
          aria-label="Pengaturan Teknis"
          aria-current={activeTab === "database" ? "page" : undefined}
          title="Pengaturan Teknis"
          className={`touch-target flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
            activeTab === "database"
              ? "text-[var(--primary)] bg-[var(--primary)]/15 font-bold shadow-xs"
              : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)]"
          }`}
        >
          <Cpu className="w-5 h-5" />
          <span className="sr-only">Pengaturan Teknis</span>
        </button>
      </nav>

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

      {/* Modal Konfirmasi: Migrasi & Aktifkan Database Remote */}
      {isApplyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-db-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !applyLoading && !migrationLoading) setIsApplyModalOpen(false);
          }}
        >
          <div className="card-paper p-6 rounded-2xl w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 id="apply-db-modal-title" className="text-base font-bold font-heading text-[var(--ink)] flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Konfirmasi Migrasi &amp; Pengalihan Database</span>
              </h3>
              <button
                type="button"
                onClick={() => !applyLoading && !migrationLoading && setIsApplyModalOpen(false)}
                className="touch-target inline-flex items-center justify-center p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--ink)]">
              <p>
                Aplikasi akan menyiapkan skema tabel pada server database remote berikut dan langsung menjadikannya database utama:
              </p>

              <div className="p-3 rounded-xl bg-[var(--canvas-subtle)] border border-[var(--border)] space-y-1 font-mono text-xs">
                <div><span className="text-[var(--ink-muted)]">Target Host:</span> {remoteHost || parseDbUrl(remoteUri).host || "127.0.0.1"}:{remotePort || parseDbUrl(remoteUri).port || 3306}</div>
                <div><span className="text-[var(--ink-muted)]">Nama Database:</span> {remoteDatabase || parseDbUrl(remoteUri).database || "-"}</div>
                <div><span className="text-[var(--ink-muted)]">User Kredensial:</span> {remoteUser || parseDbUrl(remoteUri).user || "root"}</div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-1.5 text-xs">
                <div className="font-bold text-[var(--ink)]">Ringkasan Konfigurasi:</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--ink-muted)]">Salin Seluruh Data Lokal:</span>
                  <span className="font-semibold text-[var(--ink)]">
                    {copyDataOption ? "Ya (Guru, Kelas, Siswa, Absensi)" : "Hanya Struktur Tabel"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--ink-muted)]">Reset Tabel (DROP TABLES):</span>
                  <span className={`font-semibold ${dropTablesOption ? "text-red-600 dark:text-red-400" : "text-[var(--ink)]"}`}>
                    {dropTablesOption ? "Ya (Data lama direset)" : "Tidak (Aman)"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border)]">
                  <span className="text-[var(--ink-muted)]">Proteksi Akun Superadmin:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Terjamin Aman (Tidak Akan Terkunci)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200">
                <span className="font-bold block mb-0.5">Otomatis &amp; Cepat:</span>
                File konfigurasi <code className="font-mono font-bold">.env</code> akan diperbarui dan service aplikasi <code className="font-mono font-bold">surat-ijin</code> akan dimuat ulang seketika (~350ms) setelah migrasi berhasil.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={applyLoading || migrationLoading}
                onClick={() => setIsApplyModalOpen(false)}
                className="touch-target px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold hover:bg-[var(--canvas-subtle)] cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={applyLoading || migrationLoading}
                onClick={handleMigrateAndApplyAllInOne}
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                {applyLoading || migrationLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>
                  {applyLoading || migrationLoading
                    ? "Memproses Migrasi & Mengalihkan..."
                    : "Konfirmasi & Alihkan Sekarang"}
                </span>
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
                <HardDrive className="w-5 h-5 text-[var(--primary)]" />
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
                className="touch-target inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
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
