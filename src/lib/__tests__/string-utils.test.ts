import { describe, it, expect } from "vitest";
import { toTitleCase } from "../string-utils";

describe("toTitleCase Utility", () => {
  it("should capitalize the first letter of each word", () => {
    expect(toTitleCase("erick pratama")).toBe("Erick Pratama");
    expect(toTitleCase("budi santoso")).toBe("Budi Santoso");
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
});
