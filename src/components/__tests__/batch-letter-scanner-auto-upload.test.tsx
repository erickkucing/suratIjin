// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { BatchLetterScannerModal } from "../batch-letter-scanner-modal";
import { Student } from "@/db/schema";

vi.mock("@/lib/client-image-compress", () => ({
  processFileBeforeUpload: vi.fn().mockImplementation(async (file: File) => ({
    file,
    originalSize: file.size,
    compressedSize: Math.round(file.size * 0.8),
    reductionPercentage: 20,
  })),
}));

if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-preview-url");
}
if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = vi.fn();
}

const mockStudents: Student[] = [
  {
    id: 101,
    name: "Ahmad Rizky Pratama",
    nis: "1001",
    classId: 1,
    isActive: true,
    createdAt: new Date(),
  },
];

describe("Auto-Upload and Lifecycle Cleanup in BatchLetterScannerModal", () => {
  const originalFetch = globalThis.fetch;
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  const renderModal = (isOpen = true) => {
    return render(
      <BatchLetterScannerModal
        isOpen={isOpen}
        onClose={mockOnClose}
        classId={1}
        classNameTitle="XII RPL 1"
        studentsList={mockStudents}
        onSuccess={mockOnSuccess}
        onShowToast={mockOnShowToast}
      />
    );
  };

  const createDummyFile = (name: string, type: string, size = 1024) => {
    return new File(["dummy-content"], name, { type });
  };

  it("1. Automatically uploads file with mode 'letter_temp' immediately upon selection", async () => {
    const uploadCalls: Array<{ url: string; body: FormData }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("/api/upload")) {
        uploadCalls.push({ url, body: init.body });
        return {
          ok: true,
          json: async () => ({
            success: true,
            filePath: "1/temp/letter_123.webp",
            tempFileId: "letter_123",
            mimeType: "image/webp",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("surat_ijin.jpg", "image/jpeg");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await vi.runAllTimersAsync();
    });

    // Verification: /api/upload was called immediately without clicking Process
    expect(uploadCalls.length).toBe(1);
    expect(uploadCalls[0].url).toContain("/api/upload");
    expect(uploadCalls[0].body.get("classId")).toBe("1");
    expect(uploadCalls[0].body.get("mode")).toBe("letter_temp");

    // Selesai status rendered on thumbnail
    expect(screen.getByText(/Selesai ✓/i)).toBeDefined();
  });

  it("2. When files are auto-uploaded, clicking Scan sends 'from_paths' to /api/ocr/letter/batch", async () => {
    const ocrCalls: Array<{ url: string; body: any }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("/api/upload")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            filePath: "1/temp/letter_456.webp",
            tempFileId: "letter_456",
            mimeType: "image/webp",
          }),
        };
      }
      if (url.includes("/api/ocr/letter/batch")) {
        ocrCalls.push({ url, body: JSON.parse(init.body) });
        return {
          ok: true,
          json: async () => ({
            success: true,
            mode: "multi_file",
            totalDetected: 1,
            allHighConfidence: true,
            items: [
              {
                tempFileId: "letter_456",
                previewUrl: "blob:http://localhost/letter_456.webp",
                studentId: 101,
                studentName: "Ahmad Rizky Pratama",
                candidateName: "Ahmad Rizky",
                matchConfidence: 0.95,
                status: "Izin",
                startDate: "2026-10-31",
                endDate: null,
                isMultiDay: false,
                description: "Sakit demam",
                actionType: "create",
                existingRecordId: null,
              },
            ],
            processingTimeSeconds: 1.0,
          }),
        };
      }
      if (url.includes("/api/attendance/batch-sync")) {
        return {
          ok: true,
          json: async () => ({ success: true, updatedCount: 0, createdCount: 1 }),
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("letter.jpg", "image/jpeg");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await vi.runAllTimersAsync();
    });

    const scanButton = screen.getByRole("button", { name: /Proses dan pindai/i });
    await act(async () => {
      fireEvent.click(scanButton);
      await vi.runAllTimersAsync();
    });

    // Verification: /api/ocr/letter/batch received filePaths mode
    expect(ocrCalls.length).toBe(1);
    expect(ocrCalls[0].body.mode).toBe("from_paths");
    expect(ocrCalls[0].body.filePaths).toEqual(["1/temp/letter_456.webp"]);
    expect(ocrCalls[0].body.classId).toBe(1);
  });

  it("3. Automatically calls /api/upload/cleanup when modal is closed before scanning", async () => {
    const cleanupCalls: Array<{ url: string; body: any }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("/api/upload/cleanup")) {
        cleanupCalls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({ success: true, deletedCount: 1 }) };
      }
      if (url.includes("/api/upload")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            filePath: "1/temp/letter_unscanned.webp",
            tempFileId: "letter_unscanned",
            mimeType: "image/webp",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("surat_batal.jpg", "image/jpeg");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await vi.runAllTimersAsync();
    });

    // Close button (X) clicked
    const closeBtn = screen.getByRole("button", { name: /Tutup modal/i });
    await act(async () => {
      fireEvent.click(closeBtn);
      await vi.runAllTimersAsync();
    });

    // Verification: cleanup was requested for uploaded temp file
    expect(cleanupCalls.length).toBe(1);
    expect(cleanupCalls[0].url).toContain("/api/upload/cleanup");
    expect(cleanupCalls[0].body.filePaths).toEqual(["1/temp/letter_unscanned.webp"]);
  });

  it("4. Calls /api/upload/cleanup when an individual uploaded file is deleted", async () => {
    const cleanupCalls: Array<{ url: string; body: any }> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (url.includes("/api/upload/cleanup")) {
        cleanupCalls.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => ({ success: true, deletedCount: 1 }) };
      }
      if (url.includes("/api/upload")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            filePath: "1/temp/letter_single.webp",
            tempFileId: "letter_single",
            mimeType: "image/webp",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("single.jpg", "image/jpeg");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await vi.runAllTimersAsync();
    });

    const trashBtn = screen.getByRole("button", { name: /Hapus foto 1/i });
    await act(async () => {
      fireEvent.click(trashBtn);
      await vi.runAllTimersAsync();
    });

    expect(cleanupCalls.length).toBe(1);
    expect(cleanupCalls[0].body.filePaths).toEqual(["1/temp/letter_single.webp"]);
  });

  it("5. Does NOT call cleanup if sync succeeds (files promoted to permanent storage)", async () => {
    const cleanupCalls: Array<string> = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/upload/cleanup")) {
        cleanupCalls.push(url);
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes("/api/upload")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            filePath: "1/temp/letter_success.webp",
            tempFileId: "letter_success",
            mimeType: "image/webp",
          }),
        };
      }
      if (url.includes("/api/ocr/letter/batch")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            mode: "multi_file",
            totalDetected: 1,
            allHighConfidence: true,
            items: [
              {
                tempFileId: "letter_success",
                previewUrl: "blob:http://localhost/letter_success.webp",
                studentId: 101,
                studentName: "Ahmad Rizky Pratama",
                candidateName: "Ahmad",
                matchConfidence: 0.95,
                status: "Izin",
                startDate: "2026-10-31",
                endDate: null,
                isMultiDay: false,
                description: "Izin",
                actionType: "create",
                existingRecordId: null,
              },
            ],
            processingTimeSeconds: 0.8,
          }),
        };
      }
      if (url.includes("/api/attendance/batch-sync")) {
        return {
          ok: true,
          json: async () => ({ success: true, updatedCount: 0, createdCount: 1 }),
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("success.jpg", "image/jpeg");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await vi.runAllTimersAsync();
    });

    const scanButton = screen.getByRole("button", { name: /Proses dan pindai/i });
    await act(async () => {
      fireEvent.click(scanButton);
      await vi.runAllTimersAsync();
    });

    // Auto-apply finished, modal closed
    expect(mockOnClose).toHaveBeenCalled();
    // Cleanup must NOT have been called because file was promoted to permanent storage!
    expect(cleanupCalls.length).toBe(0);
  });

  it("6. Allows retrying upload when initial upload fails", async () => {
    let uploadAttempt = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/upload")) {
        uploadAttempt++;
        if (uploadAttempt === 1) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ success: false, error: "Network glitch" }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            filePath: "1/temp/retry_success.webp",
            tempFileId: "retry_success",
            mimeType: "image/webp",
          }),
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("glitch.jpg", "image/jpeg");

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await vi.runAllTimersAsync();
    });

    // Error state rendered with Coba Lagi button
    const retryBtn = screen.getByRole("button", { name: /Coba Lagi ↻/i });
    expect(retryBtn).toBeDefined();

    // Click retry
    await act(async () => {
      fireEvent.click(retryBtn);
      await vi.runAllTimersAsync();
    });

    expect(uploadAttempt).toBe(2);
    expect(screen.getByText(/Selesai ✓/i)).toBeDefined();
  });
});
