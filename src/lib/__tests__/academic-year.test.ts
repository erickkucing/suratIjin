import { describe, it, expect } from "vitest";
import { getAutoAcademicPeriod, isAutoPeriod } from "../academic-year";

describe("Automatic Academic Period & Year Calculation", () => {
  it("should calculate Semester Ganjil and correct academic year for July through December", () => {
    // July (month index 6 in JS Date)
    const jul = getAutoAcademicPeriod(new Date(2026, 6, 15, 10, 0, 0));
    expect(jul.periodTitle).toBe("Semester Ganjil");
    expect(jul.academicYear).toBe("2026/2027");
    expect(jul.semester).toBe("ganjil");

    // October (month index 9 in JS Date)
    const oct = getAutoAcademicPeriod(new Date(2026, 9, 25, 16, 0, 0));
    expect(oct.periodTitle).toBe("Semester Ganjil");
    expect(oct.academicYear).toBe("2026/2027");

    // December (month index 11 in JS Date)
    const dec = getAutoAcademicPeriod(new Date(2026, 11, 20, 12, 0, 0));
    expect(dec.periodTitle).toBe("Semester Ganjil");
    expect(dec.academicYear).toBe("2026/2027");
  });

  it("should calculate Semester Genap and correct academic year for January through June", () => {
    // January (month index 0 in JS Date)
    const jan = getAutoAcademicPeriod(new Date(2027, 0, 10, 10, 0, 0));
    expect(jan.periodTitle).toBe("Semester Genap");
    expect(jan.academicYear).toBe("2026/2027");
    expect(jan.semester).toBe("genap");

    // April (month index 3 in JS Date)
    const apr = getAutoAcademicPeriod(new Date(2027, 3, 15, 12, 0, 0));
    expect(apr.periodTitle).toBe("Semester Genap");
    expect(apr.academicYear).toBe("2026/2027");

    // June (month index 5 in JS Date)
    const jun = getAutoAcademicPeriod(new Date(2027, 5, 25, 10, 0, 0));
    expect(jun.periodTitle).toBe("Semester Genap");
    expect(jun.academicYear).toBe("2026/2027");
  });

  it("should transition academic year properly on July 1st of the next year", () => {
    // June 30th (month index 5)
    const juneEnd = getAutoAcademicPeriod(new Date(2027, 5, 30, 12, 0, 0));
    expect(juneEnd.periodTitle).toBe("Semester Genap");
    expect(juneEnd.academicYear).toBe("2026/2027");

    // July 1st (month index 6)
    const julyStart = getAutoAcademicPeriod(new Date(2027, 6, 1, 10, 0, 0));
    expect(julyStart.periodTitle).toBe("Semester Ganjil");
    expect(julyStart.academicYear).toBe("2027/2028");
  });

  it("should correctly test isAutoPeriod comparison", () => {
    const refDate = new Date(2026, 9, 25, 10, 0, 0); // October 2026
    expect(isAutoPeriod("Semester Ganjil", "2026/2027", refDate)).toBe(true);
    expect(isAutoPeriod("semester ganjil", "2026/2027", refDate)).toBe(true);
    expect(isAutoPeriod("Semester Genap", "2026/2027", refDate)).toBe(false);
    expect(isAutoPeriod("Semester 1", "2026/2027", refDate)).toBe(false);
    expect(isAutoPeriod("Semester Ganjil", "2025/2026", refDate)).toBe(false);
  });
});
