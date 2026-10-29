import { describe, it, expect } from "vitest";
import { toTitleCase, generateRandomClassCode, isValidClassCode } from "../string-utils";

describe("toTitleCase Utility", () => {
  it("should capitalize the first letter of each word", () => {
    expect(toTitleCase("erick pratama")).toBe("Erick Pratama");
    expect(toTitleCase("budi santoso")).toBe("Budi Santoso");
    expect(toTitleCase("AHMAD DAHLAN")).toBe("Ahmad Dahlan");
    expect(toTitleCase("SITI NURHALIZA")).toBe("Siti Nurhaliza");
  });

  it("should properly preserve and capitalize academic titles with dots", () => {
    expect(toTitleCase("erick s.kom")).toBe("Erick S.Kom");
    expect(toTitleCase("drs. ahmad suparno, m.pd")).toBe("Drs. Ahmad Suparno, M.Pd");
    expect(toTitleCase("ir. h. muhammad ridwan, m.sc., ph.d")).toBe("Ir. H. Muhammad Ridwan, M.Sc., Ph.D");
  });

  it("should handle names with hyphens", () => {
    expect(toTitleCase("siti nur-haliza")).toBe("Siti Nur-Haliza");
  });

  it("should handle single words, extra spaces, and empty strings gracefully", () => {
    expect(toTitleCase("")).toBe("");
    expect(toTitleCase("ani")).toBe("Ani");
    expect(toTitleCase("  dewi   lestari  ")).toBe("  Dewi   Lestari  ");
  });

  describe("generateRandomClassCode", () => {
    it("should generate a 3-character random letter code by default", () => {
      const code = generateRandomClassCode();
      expect(code).toHaveLength(3);
      expect(/^[a-zA-Z]{3}$/.test(code)).toBe(true);
    });

    it("should generate random codes across multiple invocations", () => {
      const set = new Set<string>();
      for (let i = 0; i < 20; i++) {
        set.add(generateRandomClassCode(3));
      }
      expect(set.size).toBeGreaterThan(1);
    });
  });

  describe("isValidClassCode", () => {
    it("should validate proper codes", () => {
      expect(isValidClassCode("xYZ")).toBe(true);
      expect(isValidClassCode("AbC")).toBe(true);
      expect(isValidClassCode("xii-tkj-2")).toBe(true);
      expect(isValidClassCode("a")).toBe(false);
      expect(isValidClassCode("")).toBe(false);
    });
  });
});
