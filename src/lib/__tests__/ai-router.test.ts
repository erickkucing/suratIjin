import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  testAiRouterConnection,
  parseLetterWithAi,
  parseRosterWithAi,
  AiRouterConfig,
} from "../ai-router";

describe("ai-router library", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("testAiRouterConnection", () => {
    it("should return isConnected=false when AI is disabled", async () => {
      const result = await testAiRouterConnection({
        enabled: false,
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: "fake-key",
        model: "gemini/gemini-3.8-flash",
      });

      expect(result.isConnected).toBe(false);
      expect(result.error).toContain("dinonaktifkan");
    });

    it("should return isConnected=true with latency and models when server responds 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: "gemini/gemini-3.8-flash" },
            { id: "gemini/gemini-3.7-flash" },
          ],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await testAiRouterConnection({
        enabled: true,
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: "test-key",
        model: "gemini/gemini-3.8-flash",
      });

      expect(result.isConnected).toBe(true);
      expect(result.models).toContain("gemini/gemini-3.8-flash");
      expect(result.models).toContain("gemini/gemini-3.7-flash");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("should return isConnected=false with descriptive error when server returns 401", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: "Invalid API key" },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await testAiRouterConnection({
        enabled: true,
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: "wrong-key",
        model: "gemini/gemini-3.8-flash",
      });

      expect(result.isConnected).toBe(false);
      expect(result.error).toContain("Invalid API key");
    });

    it("should return isConnected=false on network failure or abort", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await testAiRouterConnection({
        enabled: true,
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: "test-key",
        model: "gemini/gemini-3.8-flash",
      });

      expect(result.isConnected).toBe(false);
      expect(result.error).toContain("Connection refused");
    });
  });

  describe("parseLetterWithAi", () => {
    it("should return null immediately if AI is disabled", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await parseLetterWithAi({
        rawLines: ["Surat Izin", "Sakit demam", "Nama: Budi Santoso"],
        studentCandidates: [{ id: 1, name: "Budi Santoso", nis: "1001" }],
        configOverride: {
          enabled: false,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "test-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should parse text OCR lines and return matched student data", async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                studentId: 1,
                studentName: "Budi Santoso",
                candidateName: "Budi Santoso",
                className: "XII TKJ 2",
                matchConfidence: 0.95,
                status: "Sakit",
                startDate: "2026-10-29",
                endDate: null,
                isMultiDay: false,
                description: "Demam dan flu",
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAiResponse,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await parseLetterWithAi({
        rawLines: [
          "Kepada Yth. Bapak/Ibu Wali Kelas",
          "Dengan ini kami beritahukan bahwa anak kami:",
          "Nama: Budi Santoso",
          "Kelas: XII TKJ 2",
          "Tidak dapat masuk sekolah pada 29 Oktober 2026 karena sakit demam.",
        ],
        studentCandidates: [
          { id: 1, name: "Budi Santoso", nis: "1001" },
          { id: 2, name: "Citra Lestari", nis: "1002" },
        ],
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.studentId).toBe(1);
      expect(result?.studentName).toBe("Budi Santoso");
      expect(result?.status).toBe("Sakit");
      expect(result?.startDate).toBe("2026-10-29");
      expect(result?.isMultiDay).toBe(false);
      expect(result?.matchConfidence).toBe(0.95);
    });

    it("should return null gracefully if AI fetch fails or throws", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Timeout after 12s"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await parseLetterWithAi({
        rawLines: ["Surat Izin"],
        studentCandidates: [{ id: 1, name: "Budi", nis: "1001" }],
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("parseRosterWithAi", () => {
    it("should return null if AI is disabled", async () => {
      const result = await parseRosterWithAi({
        rawLines: ["1", "1001", "Ahmad Dahlan"],
        configOverride: {
          enabled: false,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "test-key",
          model: "gemini/gemini-3.8-flash",
        },
      });
      expect(result).toBeNull();
    });

    it("should extract students array when AI succeeds", async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify([
                { name: "Ahmad Dahlan", nis: "1001" },
                { name: "Budi Santoso", nis: "1002" },
              ]),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAiResponse,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await parseRosterWithAi({
        rawLines: ["No | NIS | Nama", "1 | 1001 | Ahmad Dahlan", "2 | 1002 | Budi Santoso"],
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.length).toBe(2);
      expect(result?.[0].name).toBe("Ahmad Dahlan");
      expect(result?.[0].nis).toBe("1001");
    });
  });
});
