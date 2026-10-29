import { describe, it, expect } from "vitest";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe("WCAG 2.2 AA Color Contrast Verification (Warm Terracotta & Slate)", () => {
  const pairings = [
    {
      name: "Light - Body Text (#231F1E) on Warm Linen Canvas (#FBF7F2)",
      fg: "#231F1E",
      bg: "#FBF7F2",
      minRatio: 4.5,
    },
    {
      name: "Light - Body Text (#231F1E) on White Card (#FFFFFF)",
      fg: "#231F1E",
      bg: "#FFFFFF",
      minRatio: 4.5,
    },
    {
      name: "Light - Muted Text (#574F4A) on Warm Linen Canvas (#FBF7F2)",
      fg: "#574F4A",
      bg: "#FBF7F2",
      minRatio: 4.5,
    },
    {
      name: "Light - Subtle Text (#6E655F) on Warm Linen Canvas (#FBF7F2)",
      fg: "#6E655F",
      bg: "#FBF7F2",
      minRatio: 4.5,
    },
    {
      name: "Light - Warm Terracotta Button (#FFFFFF on #B54826)",
      fg: "#FFFFFF",
      bg: "#B54826",
      minRatio: 4.5,
    },
    {
      name: "Light - Warm Terracotta Hover (#FFFFFF on #96391C)",
      fg: "#FFFFFF",
      bg: "#96391C",
      minRatio: 4.5,
    },
    {
      name: "Light - Soft Slate Navy Element (#FFFFFF on #264663)",
      fg: "#FFFFFF",
      bg: "#264663",
      minRatio: 4.5,
    },
    {
      name: "Light - Izin Badge Text (#1E4363 on #EBF2F7)",
      fg: "#1E4363",
      bg: "#EBF2F7",
      minRatio: 4.5,
    },
    {
      name: "Light - Sakit Badge Text (#8A4D0E on #FEF4E6)",
      fg: "#8A4D0E",
      bg: "#FEF4E6",
      minRatio: 4.5,
    },
    {
      name: "Light - Alpa Badge Text (#962326 on #FCECEB)",
      fg: "#962326",
      bg: "#FCECEB",
      minRatio: 4.5,
    },
    {
      name: "Light - 100% Apresiasi Badge Text (#8A4D0E on #FDF3E3)",
      fg: "#8A4D0E",
      bg: "#FDF3E3",
      minRatio: 4.5,
    },
    {
      name: "Light - Sukses/WA Indicator Text (#36582C on #EFF5EC)",
      fg: "#36582C",
      bg: "#EFF5EC",
      minRatio: 4.5,
    },
    {
      name: "Light - Warning Badge Text (#8A4D0E on #FEF4E6)",
      fg: "#8A4D0E",
      bg: "#FEF4E6",
      minRatio: 4.5,
    },
    {
      name: "Dark - Primary Ink (#F5EFEA) on Espresso Canvas (#181514)",
      fg: "#F5EFEA",
      bg: "#181514",
      minRatio: 4.5,
    },
    {
      name: "Dark - Primary Ink (#F5EFEA) on Dark Surface (#26211F)",
      fg: "#F5EFEA",
      bg: "#26211F",
      minRatio: 4.5,
    },
    {
      name: "Dark - Muted Text (#B8ACA3) on Dark Surface (#26211F)",
      fg: "#B8ACA3",
      bg: "#26211F",
      minRatio: 4.5,
    },
    {
      name: "Non-text Contrast - Strong Border (#988777) on Linen Canvas (#FBF7F2)",
      fg: "#988777",
      bg: "#FBF7F2",
      minRatio: 3.0,
    },
    {
      name: "Dark - Izin Badge Text (#90CDF4 on #162C40)",
      fg: "#90CDF4",
      bg: "#162C40",
      minRatio: 4.5,
    },
    {
      name: "Dark - Sakit Badge Text (#FBD38D on #382A15)",
      fg: "#FBD38D",
      bg: "#382A15",
      minRatio: 4.5,
    },
    {
      name: "Dark - Alpa Badge Text (#FEB2B2 on #3D1B1B)",
      fg: "#FEB2B2",
      bg: "#3D1B1B",
      minRatio: 4.5,
    },
    {
      name: "Dark - 100% Apresiasi Badge Text (#FBD38D on #382A15)",
      fg: "#FBD38D",
      bg: "#382A15",
      minRatio: 4.5,
    },
    {
      name: "Dark - Sukses Indicator Text (#A3D9A5 on #1C301B)",
      fg: "#A3D9A5",
      bg: "#1C301B",
      minRatio: 4.5,
    },
    {
      name: "Dark - Warning Badge Text (#FBD38D on #382A15)",
      fg: "#FBD38D",
      bg: "#382A15",
      minRatio: 4.5,
    },
    {
      name: "Non-text Contrast - Dark Strong Border (#6E6058) on Espresso Canvas (#181514)",
      fg: "#6E6058",
      bg: "#181514",
      minRatio: 3.0,
    },
    {
      name: "Dark - Terracotta Primary Button (#FFFFFF on #B54826)",
      fg: "#FFFFFF",
      bg: "#B54826",
      minRatio: 4.5,
    },
    {
      name: "Dark - Emerald Primary Button (#FFFFFF on #1E6B4B)",
      fg: "#FFFFFF",
      bg: "#1E6B4B",
      minRatio: 4.5,
    },
    {
      name: "Dark - Ocean Primary Button (#FFFFFF on #1B5299)",
      fg: "#FFFFFF",
      bg: "#1B5299",
      minRatio: 4.5,
    },
    {
      name: "Dark - Indigo Primary Button (#FFFFFF on #4338CA)",
      fg: "#FFFFFF",
      bg: "#4338CA",
      minRatio: 4.5,
    },
    {
      name: "Dark - Burgundy Primary Button (#FFFFFF on #881337)",
      fg: "#FFFFFF",
      bg: "#881337",
      minRatio: 4.5,
    },
  ];

  pairings.forEach(({ name, fg, bg, minRatio }) => {
    it(`should meet WCAG (${minRatio}:1) for ${name}`, () => {
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(minRatio);
    });
  });

  it("should verify all THEME_PRESETS primaryLightHex and primaryDarkHex pass >= 4.5:1 against #FFFFFF", async () => {
    const { THEME_PRESETS } = await import("../system-settings-constants");
    for (const preset of THEME_PRESETS) {
      const lightRatio = getContrastRatio("#FFFFFF", preset.primaryLightHex);
      const darkRatio = getContrastRatio("#FFFFFF", preset.primaryDarkHex);
      expect(lightRatio).toBeGreaterThanOrEqual(4.5);
      expect(darkRatio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
