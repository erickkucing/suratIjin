export type ThemeColor = "terracotta" | "emerald" | "ocean" | "indigo" | "burgundy";
export type BgTheme = "warm-zinc" | "clean-slate" | "subtle-cream" | "deep-charcoal" | "nordic-cool";

export interface BgThemePreset {
  id: BgTheme;
  name: string;
  description: string;
  lightCanvasHex: string;
  lightSurfaceHex: string;
  darkCanvasHex: string;
  darkSurfaceHex: string;
}

export const BG_THEME_PRESETS: BgThemePreset[] = [
  {
    id: "warm-zinc",
    name: "Warm Paper",
    description: "Nuansa kertas hangat bernuansa arsip klasik dokumen sekolah.",
    lightCanvasHex: "#F5EFEB",
    lightSurfaceHex: "#FDFBF7",
    darkCanvasHex: "#171413",
    darkSurfaceHex: "#241F1D",
  },
  {
    id: "clean-slate",
    name: "Clean Slate",
    description: "Abu-abu netral sejuk dan kontras tinggi untuk kenyamanan membaca.",
    lightCanvasHex: "#EBF0F5",
    lightSurfaceHex: "#F8FAFC",
    darkCanvasHex: "#0B1320",
    darkSurfaceHex: "#162338",
  },
  {
    id: "subtle-cream",
    name: "Subtle Cream",
    description: "Krem lembut ramah mata dan hangat untuk durasi kerja panjang.",
    lightCanvasHex: "#F5EEDB",
    lightSurfaceHex: "#FDFBF4",
    darkCanvasHex: "#181511",
    darkSurfaceHex: "#27221C",
  },
  {
    id: "deep-charcoal",
    name: "Minimal Zinc",
    description: "Abu-abu monokrom netral modern dengan batas kartu tegas.",
    lightCanvasHex: "#EEEEF0",
    lightSurfaceHex: "#F8F8FA",
    darkCanvasHex: "#101012",
    darkSurfaceHex: "#1E1E23",
  },
  {
    id: "nordic-cool",
    name: "Nordic Cool",
    description: "Palet skandinavia beraksen es sejuk yang bersih dan tenang.",
    lightCanvasHex: "#E5EEF5",
    lightSurfaceHex: "#F4F9FD",
    darkCanvasHex: "#0D151E",
    darkSurfaceHex: "#182737",
  },
];

export interface ThemePreset {
  id: ThemeColor;
  name: string;
  badge: string;
  description: string;
  primaryLightHex: string;
  primaryDarkHex: string;
  hoverLightHex: string;
  accentBgHex: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "terracotta",
    name: "Warm Terracotta",
    badge: "Bawaan",
    description: "Hangat, bersahabat, khas warna dokumen arsip sekolah.",
    primaryLightHex: "#B54826",
    primaryDarkHex: "#B54826",
    hoverLightHex: "#96391C",
    accentBgHex: "#FCEEE9",
  },
  {
    id: "emerald",
    name: "Emerald Forest",
    badge: "Akademis",
    description: "Hijau zamrud elegan, sejuk, dan berkarakter formal.",
    primaryLightHex: "#1E6B4B",
    primaryDarkHex: "#1E6B4B",
    hoverLightHex: "#155038",
    accentBgHex: "#EBF6F0",
  },
  {
    id: "ocean",
    name: "Ocean Navy",
    badge: "Institusional",
    description: "Biru maritim profesional, terpercaya, dan modern.",
    primaryLightHex: "#1B5299",
    primaryDarkHex: "#1B5299",
    hoverLightHex: "#143E73",
    accentBgHex: "#EBF2FA",
  },
  {
    id: "indigo",
    name: "Deep Indigo",
    badge: "Modern",
    description: "Ungu gelap terpelajar, fokus tajam, dan kontras tinggi.",
    primaryLightHex: "#4338CA",
    primaryDarkHex: "#4338CA",
    hoverLightHex: "#3730A3",
    accentBgHex: "#EEF2FF",
  },
  {
    id: "burgundy",
    name: "Classic Burgundy",
    badge: "Wibawa",
    description: "Merah marun berwibawa, klasik, dan resmi.",
    primaryLightHex: "#881337",
    primaryDarkHex: "#881337",
    hoverLightHex: "#700F2E",
    accentBgHex: "#FFE4E6",
  },
];

export interface SystemSettingsData {
  appName: string;
  logoUrl: string | null;
  themeColor: ThemeColor;
  bgTheme?: BgTheme;
  footerText?: string;
  aiEnabled: boolean;
  aiRouterUrl: string;
  aiRouterApiKey: string | null;
  aiRouterModel: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsData = {
  appName: "Sistem Surat Izin Siswa",
  logoUrl: null,
  themeColor: "terracotta",
  bgTheme: "warm-zinc",
  footerText: "Sistem Surat Izin & Ketidakhadiran Siswa.",
  aiEnabled: false,
  aiRouterUrl: "http://127.0.0.1:20128/v1",
  aiRouterApiKey: null,
  aiRouterModel: "gemini/gemini-3.8-flash",
};
