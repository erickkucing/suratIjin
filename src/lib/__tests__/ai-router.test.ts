import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  testAiRouterConnection,
  parseLetterWithAi,
  parseRosterWithAi,
  segmentAndParseTableLettersWithAi,
  normalizeBoundingBox,
  createMockTableScanAiResponse,
  generateAttendanceInsightsWithAi,
  generateFallbackAttendanceInsights,
  createMockAttendanceInsightsAiResponse,
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

    it("should normalize unpadded dates and reject student birth dates", async () => {
      const currentYear = new Date().getFullYear();
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                studentId: 1,
                studentName: "Budi Santoso",
                candidateName: "Budi Santoso",
                status: "Izin",
                startDate: `${currentYear}-10-5`, // Unpadded day
                endDate: `${currentYear}-10-8`,
                isMultiDay: true,
                description: "Acara keluarga",
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
        rawLines: ["Surat Izin"],
        studentCandidates: [{ id: 1, name: "Budi Santoso", nis: "1001" }],
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.startDate).toBe(`${currentYear}-10-05`);
      expect(result?.endDate).toBe(`${currentYear}-10-08`);
      expect(result?.isMultiDay).toBe(true);
    });

    it("should reject hallucinated studentId not present in candidates and infer Sakit from description", async () => {
      const currentYear = new Date().getFullYear();
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                studentId: 9999, // Hallucinated ID
                studentName: "Budi Santoso",
                candidateName: "Budi",
                status: "Absen", // Generic status
                startDate: `${currentYear}-10-28`,
                endDate: null,
                isMultiDay: false,
                description: "Surat keterangan istirahat dokter demam tinggi",
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
        rawLines: ["Surat Dokter"],
        studentCandidates: [{ id: 5, name: "Budi Santoso", nis: "1005" }],
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).not.toBeNull();
      // Should resolve to actual candidate ID 5, not hallucinated 9999
      expect(result?.studentId).toBe(5);
      expect(result?.studentName).toBe("Budi Santoso");
      // Status should be inferred as Sakit due to medical description keywords
      expect(result?.status).toBe("Sakit");
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

    it("should extract and normalize composite NIS format (e.g. 9259/110/066)", async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify([
                { name: "Adrian Manuel Hartono", nis: "9259 / 110 / 066" },
                { name: "Yohanes Elkan Nathanael", nis: "9509/181/066" },
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
        rawLines: ["1 | Adrian Manuel Hartono | 9259 / 110 / 066"],
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.length).toBe(2);
      expect(result?.[0].name).toBe("Adrian Manuel Hartono");
      expect(result?.[0].nis).toBe("9259/110/066");
      expect(result?.[1].nis).toBe("9509/181/066");
    });
  });

  describe("normalizeBoundingBox (ai-router)", () => {
    it("should normalize 0-1000 integer coordinates into 0.0-1.0 floats", () => {
      const box = normalizeBoundingBox([100, 50, 480, 480]);
      expect(box).toEqual([0.1, 0.05, 0.48, 0.48]);
    });

    it("should handle object format with ymin, xmin, ymax, xmax", () => {
      const box = normalizeBoundingBox({ ymin: 200, xmin: 150, ymax: 800, xmax: 850 });
      expect(box).toEqual([0.2, 0.15, 0.8, 0.85]);
    });

    it("should reject invalid or degenerative bounding boxes", () => {
      expect(normalizeBoundingBox("invalid")).toBeNull();
      expect(normalizeBoundingBox([10, 10, 15, 15])).toBeNull(); // < 0.02
    });
  });

  describe("segmentAndParseTableLettersWithAi", () => {
    it("should return null immediately if AI is disabled", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await segmentAndParseTableLettersWithAi({
        imageBase64: "base64data",
        studentCandidates: [{ id: 1, name: "Budi Santoso", nis: "1001" }],
        configOverride: { enabled: false },
      });

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should normalize 0-1000 integer bounding boxes to 0.0-1.0 floats and match students", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createMockTableScanAiResponse(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await segmentAndParseTableLettersWithAi({
        imageBase64: "tableImageBase64",
        studentCandidates: [
          { id: 1, name: "Budi Santoso", nis: "1001" },
          { id: 2, name: "Citra Lestari", nis: "1002" },
        ],
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result).not.toBeNull();
      expect(result?.length).toBe(2);

      expect(result?.[0].boundingBox).toEqual([0.1, 0.05, 0.48, 0.48]);
      expect(result?.[0].studentId).toBe(1);
      expect(result?.[0].studentName).toBe("Budi Santoso");
      expect(result?.[0].status).toBe("Sakit");

      expect(result?.[1].boundingBox).toEqual([0.52, 0.51, 0.95, 0.96]);
      expect(result?.[1].studentId).toBe(2);
      expect(result?.[1].status).toBe("Izin");
      expect(result?.[1].isMultiDay).toBe(true);
    });

    it("should reject student birth date and enforce zero-hallucination student validation", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          createMockTableScanAiResponse([
            {
              boundingBox: [50, 50, 450, 450],
              studentId: 99999, // Hallucinated ID
              studentName: "Unknown Student",
              candidateName: "Unknown",
              status: "Sakit",
              startDate: "2012-05-15", // Birth date
              description: "Sakit cacar",
            },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await segmentAndParseTableLettersWithAi({
        imageBase64: "tableImageBase64",
        studentCandidates: [{ id: 1, name: "Budi Santoso", nis: "1001" }],
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result).not.toBeNull();
      expect(result?.length).toBe(1);
      expect(result?.[0].studentId).toBeNull();
      expect(result?.[0].studentName).toBeNull();
      expect(result?.[0].candidateName).toBe("Unknown");
      expect(result?.[0].matchConfidence).toBeLessThanOrEqual(0.60);
      expect(result?.[0].startDate).toBe("");
    });

    it("should handle timeout gracefully and return null", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Timeout"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await segmentAndParseTableLettersWithAi({
        imageBase64: "tableImageBase64",
        studentCandidates: [{ id: 1, name: "Budi Santoso", nis: "1001" }],
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result).toBeNull();
    });
  });

  describe("generateAttendanceInsightsWithAi & fallbacks", () => {
    const baseInput = {
      className: "XII TKJ 2",
      period: "month" as const,
      periodLabel: "Oktober 2026",
      summaryStats: {
        totalStudents: 32,
        totalAbsences: 12,
        totalAlpa: 2,
        totalIzin: 4,
        totalSakit: 6,
        totalSuratBelum: 1,
        attendanceRatePercent: 94.2,
      },
      atRiskStudents: [
        {
          studentId: 1,
          studentName: "Budi Santoso",
          nis: "1001",
          urgency: "Kritis" as const,
          anomalyTypes: ["alpa_berulang"],
          ruleDescriptions: ["Akumulasi 3 hari Alpa tanpa keterangan"],
          stats: {
            alpa: 3,
            izin: 1,
            sakit: 1,
            total: 5,
            pendingLetters: 0,
          },
        },
        {
          studentId: 2,
          studentName: "Citra Lestari",
          nis: "1002",
          urgency: "Waspada" as const,
          anomalyTypes: ["pola_senin_jumat"],
          ruleDescriptions: ["Absen berulang pada hari Senin dan Jumat (60%)"],
          stats: {
            alpa: 0,
            izin: 2,
            sakit: 2,
            total: 4,
            pendingLetters: 1,
            mondayFridayRatio: 0.6,
          },
        },
      ],
    };

    it("should return deterministic fallback with aiGenerated=false when AI is disabled", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await generateAttendanceInsightsWithAi({
        ...baseInput,
        configOverride: { enabled: false },
      });

      expect(result.aiGenerated).toBe(false);
      expect(result.executiveSummary).toContain("XII TKJ 2");
      expect(result.executiveSummary).toContain("12 ketidakhadiran");
      expect(result.principalReport).toContain("Yth. Bapak/Ibu Pimpinan Sekolah");
      expect(result.principalReport).toContain("32 siswa terdaftar");
      expect(result.parentGroupMessage).toContain("Yth. Bapak/Ibu Orang Tua/Wali Murid Kelas XII TKJ 2");
      // Ensure privacy in fallback
      expect(result.parentGroupMessage).not.toContain("Budi Santoso");
      expect(result.parentGroupMessage).not.toContain("Citra Lestari");
      expect(result.bkRecommendations.length).toBe(2);
      expect(result.bkRecommendations[0].studentName).toBe("Budi Santoso");
      expect(result.bkRecommendations[0].riskLevel).toBe("Kritis");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return deterministic fallback with aiGenerated=false when bypassAi is true", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await generateAttendanceInsightsWithAi({
        ...baseInput,
        bypassAi: true,
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result.aiGenerated).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return AI-generated narratives with aiGenerated=true when 9router AI succeeds", async () => {
      const mockAiPayload = createMockAttendanceInsightsAiResponse();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAiPayload,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await generateAttendanceInsightsWithAi({
        ...baseInput,
        configOverride: {
          enabled: true,
          baseUrl: "http://127.0.0.1:20128/v1",
          apiKey: "valid-key",
          model: "gemini/gemini-3.8-flash",
        },
      });

      expect(result.aiGenerated).toBe(true);
      expect(result.executiveSummary).toContain("XII TKJ 2");
      expect(result.principalReport).toContain("Kepala Sekolah");
      expect(result.parentGroupMessage).toContain("Selamat pagi/siang");
      expect(result.bkRecommendations.length).toBe(2);
      expect(result.bkRecommendations[0].studentName).toBe("Budi Santoso");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("http://127.0.0.1:20128/v1/chat/completions");
      const reqBody = JSON.parse(callArgs[1].body);
      expect(reqBody.model).toBe("gemini/gemini-3.8-flash");
      expect(reqBody.temperature).toBe(0.2);
    });

    it("should handle AI timeout (15s abort) or network error gracefully with fallback", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Timeout after 15s"));
      vi.stubGlobal("fetch", mockFetch);

      const result = await generateAttendanceInsightsWithAi({
        ...baseInput,
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result.aiGenerated).toBe(false);
      expect(result.executiveSummary).toContain("XII TKJ 2");
      expect(result.bkRecommendations.length).toBe(2);
    });

    it("should handle malformed JSON from AI and fall back gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Maaf, saya tidak dapat merespons dalam format JSON." } }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await generateAttendanceInsightsWithAi({
        ...baseInput,
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result.aiGenerated).toBe(false);
      expect(result.executiveSummary).toContain("XII TKJ 2");
    });

    it("should trigger privacy guard and sanitize parentGroupMessage if AI leaks student name", async () => {
      const mockLeakyAiPayload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                executiveSummary: "Ringkasan kelas terpantau baik.",
                principalReport: "Laporan resmi untuk Kepala Sekolah.",
                parentGroupMessage: "Selamat pagi orang tua kelas XII TKJ 2, kami mohon perhatian khusus untuk Budi Santoso yang sering alpa.",
                bkRecommendations: [
                  {
                    studentName: "Budi Santoso",
                    riskLevel: "Kritis",
                    recommendation: "Konseling orang tua.",
                  },
                ],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLeakyAiPayload,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await generateAttendanceInsightsWithAi({
        ...baseInput,
        configOverride: { enabled: true, apiKey: "valid-key" },
      });

      expect(result.aiGenerated).toBe(true);
      // Leaked name should be replaced with the safe parentGroupMessage template
      expect(result.parentGroupMessage).not.toContain("Budi Santoso");
      expect(result.parentGroupMessage).toContain("Yth. Bapak/Ibu Orang Tua/Wali Murid Kelas XII TKJ 2");
    });

    it("should generate healthy fallback narrative for classes with zero absences", () => {
      const zeroAbsenceInput = {
        className: "X RPL 1",
        period: "month" as const,
        periodLabel: "Oktober 2026",
        summaryStats: {
          totalStudents: 36,
          totalAbsences: 0,
          totalAlpa: 0,
          totalIzin: 0,
          totalSakit: 0,
          totalSuratBelum: 0,
          attendanceRatePercent: 100,
        },
        atRiskStudents: [],
      };

      const fallback = generateFallbackAttendanceInsights(zeroAbsenceInput);
      expect(fallback.executiveSummary).toContain("kondisi prima dengan tingkat kehadiran 100%");
      expect(fallback.principalReport).toContain("36 siswa terdaftar");
      expect(fallback.principalReport).toContain("0 kejadian ketidakhadiran");
      expect(fallback.bkRecommendations).toEqual([]);
    });
  });
});
