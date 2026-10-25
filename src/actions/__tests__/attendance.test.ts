import { describe, it, expect } from "vitest";
import { generateDateRange } from "@/lib/date-utils";

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

  it("should correctly expand multi-day rentang tanggal across months", () => {
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
});
