import { describe, it, expect } from "vitest";
import { generateDateRange, getDaysDifference, getLocalDateString } from "@/lib/date-utils";
import { isValidLetterFilePath } from "@/lib/attendance-security";

describe("Attendance Business Rules & Date Calculations", () => {
  it("should return a single date if no endDate is provided", () => {
    const dates = generateDateRange("2026-09-02");
    expect(dates).toEqual(["2026-09-02"]);
  });

  it("should return a single date if endDate is earlier or equal to startDate", () => {
    const datesEarlier = generateDateRange("2026-09-05", "2026-09-01");
    expect(datesEarlier).toEqual(["2026-09-05"]);

    const datesSame = generateDateRange("2026-09-05", "2026-09-05");
    expect(datesSame).toEqual(["2026-09-05"]);
  });

  it("should correctly expand multi-day rentang tanggal across months without timezone skew", () => {
    // Consecutive absence like Imanuel Hariadi from 2026-09-29 to 2026-10-02 (4 days)
    const dates = generateDateRange("2026-09-29", "2026-10-02");
    expect(dates).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("should respect the safety cap of maximum 14 consecutive days", () => {
    const dates = generateDateRange("2026-09-01", "2026-09-30");
    expect(dates.length).toBe(14);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates[13]).toBe("2026-09-14");
  });

  it("should correctly compute days difference between dates inclusive", () => {
    expect(getDaysDifference("2026-10-01", "2026-10-01")).toBe(1);
    expect(getDaysDifference("2026-10-01", "2026-10-03")).toBe(3);
    expect(getDaysDifference("2026-09-28", "2026-10-02")).toBe(5);
    // Respects 14 day cap
    expect(getDaysDifference("2026-09-01", "2026-10-01")).toBe(14);
  });

  it("should format local calendar date without UTC drift", () => {
    const specificDate = new Date(2026, 9, 25, 2, 30, 0); // Oct 25, 2026 02:30 AM local
    const formatted = getLocalDateString(specificDate);
    expect(formatted).toBe("2026-10-25");
  });
});

describe("SEC-FINDING-01: Cross-Class Letter File Path Isolation & Traversal Prevention", () => {
  it("should allow legitimate files belonging to the target class", () => {
    expect(isValidLetterFilePath("1/2026-10/1729838493_a1b2c3.webp", 1)).toBe(true);
    expect(isValidLetterFilePath("42/2026-11/surat.pdf", 42)).toBe(true);
    expect(isValidLetterFilePath(null, 1)).toBe(true);
    expect(isValidLetterFilePath(undefined, 1)).toBe(true);
  });

  it("should reject cross-class letter paths (BOLA prevention)", () => {
    // Teacher in class 1 attempting to link letter from class 2
    expect(isValidLetterFilePath("2/2026-10/1729838493_a1b2c3.webp", 1)).toBe(false);
    expect(isValidLetterFilePath("10/2026-10/surat.pdf", 1)).toBe(false);
  });

  it("should reject path traversal attempts", () => {
    // Traversal via ../ or backslashes
    expect(isValidLetterFilePath("1/../2/2026-10/secret.webp", 1)).toBe(false);
    expect(isValidLetterFilePath("1/..\\2/2026-10/secret.webp", 1)).toBe(false);
    expect(isValidLetterFilePath("../etc/passwd", 1)).toBe(false);
  });

  it("should allow preserving existing legacy path if unchanged on edit", () => {
    const legacyPath = "legacy/sample_surat_izin.webp";
    // Allowed when existing record already has this path
    expect(isValidLetterFilePath(legacyPath, 1, legacyPath)).toBe(true);
    // Disallowed when creating a new record or modifying path to a legacy path
    expect(isValidLetterFilePath(legacyPath, 1, "1/2026-10/other.webp")).toBe(false);
    expect(isValidLetterFilePath(legacyPath, 1)).toBe(false);
  });
});
