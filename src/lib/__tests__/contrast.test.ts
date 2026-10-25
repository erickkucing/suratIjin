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

describe("WCAG 2.2 AA Color Contrast Verification", () => {
  const pairings = [
    {
      name: "Light - Body Text (#1E2A26) on Cream Canvas (#FDF8EE)",
      fg: "#1E2A26",
      bg: "#FDF8EE",
      minRatio: 4.5,
    },
    {
      name: "Light - Body Text (#1E2A26) on White Card (#FFFFFF)",
      fg: "#1E2A26",
      bg: "#FFFFFF",
      minRatio: 4.5,
    },
    {
      name: "Light - Muted Text (#4A5651) on Cream Canvas (#FDF8EE)",
      fg: "#4A5651",
      bg: "#FDF8EE",
      minRatio: 4.5,
    },
    {
      name: "Light - Chalkboard Header (#FFFFFF on #1F6F54)",
      fg: "#FFFFFF",
      bg: "#1F6F54",
      minRatio: 4.5,
    },
    {
      name: "Light - Izin Badge Text (#164E87 on #E7F2FD)",
      fg: "#164E87",
      bg: "#E7F2FD",
      minRatio: 4.5,
    },
    {
      name: "Light - Sakit Badge Text (#145A3A on #E6F6EE)",
      fg: "#145A3A",
      bg: "#E6F6EE",
      minRatio: 4.5,
    },
    {
      name: "Light - Alpa Badge Text (#982613 on #FCEBE7)",
      fg: "#982613",
      bg: "#FCEBE7",
      minRatio: 4.5,
    },
    {
      name: "Dark - Chalk Text (#F3EFE6) on Dark Slate Canvas (#111916)",
      fg: "#F3EFE6",
      bg: "#111916",
      minRatio: 4.5,
    },
    {
      name: "Dark - Chalk Text (#F3EFE6) on Elevated Surface (#192420)",
      fg: "#F3EFE6",
      bg: "#192420",
      minRatio: 4.5,
    },
    {
      name: "Dark - Muted Text (#A6B5AE) on Elevated Surface (#192420)",
      fg: "#A6B5AE",
      bg: "#192420",
      minRatio: 4.5,
    },
  ];

  pairings.forEach(({ name, fg, bg, minRatio }) => {
    it(`should meet WCAG AA (ratio >= ${minRatio}:1) for ${name}`, () => {
      const ratio = getContrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(minRatio);
    });
  });
});
