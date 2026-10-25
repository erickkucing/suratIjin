export type ThemeColor = "terracotta" | "emerald" | "ocean" | "indigo" | "burgundy";

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
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsData = {
  appName: "Sistem Surat Izin Siswa",
  logoUrl: null,
  themeColor: "terracotta",
};
