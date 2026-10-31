// @vitest-environment happy-dom
import React from "react";
(globalThis as any).React = React;
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { BatchLetterScannerModal } from "../batch-letter-scanner-modal";
import { Student } from "@/db/schema";

// Mock client-side image compression
vi.mock("@/lib/client-image-compress", () => ({
  processFileBeforeUpload: vi.fn().mockImplementation(async (file: File) => ({
    file,
    originalSize: file.size,
    compressedSize: Math.round(file.size * 0.8),
    reductionPercentage: 20,
  })),
}));

// Mock URL object methods for happy-dom
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
  {
    id: 102,
    name: "Bunga Citra Lestari",
    nis: "1002",
    classId: 1,
    isActive: true,
    createdAt: new Date(),
  },
  {
    id: 103,
    name: "Dimas Anggara",
    nis: "1003",
    classId: 1,
    isActive: true,
    createdAt: new Date(),
  },
];

describe("Milestone 2 Empirical Tests: BatchLetterScannerModal & Hybrid Approval", () => {
  const originalFetch = globalThis.fetch;
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Default window width desktop
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

  // =========================================================================
  // 1. HYBRID APPROVAL BOUNDARY CONDITIONS
  // =========================================================================

  it("1.1 [Hybrid Auto-Apply] automatically calls /api/attendance/batch-sync when allHighConfidence is true (>=85%)", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 2,
      allHighConfidence: true,
      items: [
        {
          tempFileId: "tmp-file-1",
          previewUrl: "blob:http://localhost/letter-1.webp",
          studentId: 101,
          studentName: "Ahmad Rizky Pratama",
          candidateName: "Ahmad Rizky",
          matchConfidence: 0.95,
          status: "Izin",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Acara keluarga",
          actionType: "update",
          existingRecordId: 50,
        },
        {
          tempFileId: "tmp-file-2",
          previewUrl: "blob:http://localhost/letter-2.webp",
          studentId: 102,
          studentName: "Bunga Citra Lestari",
          candidateName: "Bunga Citra",
          matchConfidence: 0.88,
          status: "Sakit",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Flu dan demam",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 1.2,
    };

    const syncResponse = {
      success: true,
      updatedCount: 1,
      createdCount: 1,
      totalProcessed: 2,
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/ocr/letter/batch")) {
        return {
          ok: true,
          json: async () => ocrResponse,
        };
      }
      if (url.includes("/api/attendance/batch-sync")) {
        return {
          ok: true,
          json: async () => syncResponse,
        };
      }
      return { ok: false, status: 404 };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    // Add a file
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = createDummyFile("letter1.jpg", "image/jpeg");
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click Start Scan
    const scanButton = screen.getByRole("button", { name: /Mulai Pindai/i });
    await act(async () => {
      fireEvent.click(scanButton);
      await vi.runAllTimersAsync();
    });

    // Verification:
    // 1. /api/ocr/letter/batch was called
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ocr/letter/batch",
      expect.objectContaining({ method: "POST" })
    );

    // 2. /api/attendance/batch-sync was automatically called without manual review
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attendance/batch-sync",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: 1,
          items: [
            {
              tempFileId: "tmp-file-1",
              studentId: 101,
              status: "Izin",
              startDate: "2026-10-31",
              endDate: null,
              isMultiDay: false,
              description: "Acara keluarga",
              actionType: "update",
              existingRecordId: 50,
            },
            {
              tempFileId: "tmp-file-2",
              studentId: 102,
              status: "Sakit",
              startDate: "2026-10-31",
              endDate: null,
              isMultiDay: false,
              description: "Flu dan demam",
              actionType: "create",
              existingRecordId: null,
            },
          ],
        }),
      })
    );

    // 3. Modal was closed, toast displayed, and onSuccess triggered
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnShowToast).toHaveBeenCalledWith(
      "Berhasil: 1 catatan diperbarui, 1 dibuat baru",
      "success"
    );
    expect(mockOnSuccess).toHaveBeenCalledWith({ updatedCount: 1, createdCount: 1 });

    // 4. Review Drawer was never displayed
    expect(screen.queryByText(/Tinjau Hasil Pemindaian/i)).toBeNull();
  });

  it("1.2 [Fallback to Review Drawer] opens Review Drawer when confidence is < 85% (e.g. 0.84)", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 1,
      allHighConfidence: false, // Below threshold
      items: [
        {
          tempFileId: "tmp-file-low",
          previewUrl: "blob:http://localhost/letter-low.webp",
          studentId: 101,
          studentName: "Ahmad Rizky Pratama",
          candidateName: "Ahmad",
          matchConfidence: 0.84, // Boundary: 84% < 85%
          status: "Izin",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Izin keperluan keluarga",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 0.9,
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/ocr/letter/batch")) {
        return {
          ok: true,
          json: async () => ocrResponse,
        };
      }
      return { ok: false };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("letter.jpg", "image/jpeg")] } });

    const scanButton = screen.getByRole("button", { name: /Mulai Pindai/i });
    await act(async () => {
      fireEvent.click(scanButton);
      await vi.runAllTimersAsync();
    });

    // Verification:
    // 1. /api/attendance/batch-sync was NOT called!
    expect(fetchMock).not.toHaveBeenCalledWith("/api/attendance/batch-sync", expect.anything());

    // 2. Modal is still open (onClose was NOT called)
    expect(mockOnClose).not.toHaveBeenCalled();

    // 3. Review Drawer title is now rendered
    expect(screen.getByText(/Tinjau Hasil Pemindaian \(1 Surat\)/i)).toBeDefined();

    // 4. Warning badge is shown indicating confidence 84%
    expect(screen.getByText(/Perlu Dicek \(84%\)/i)).toBeDefined();
    expect(screen.getByText(/1 Perlu Dicek/i)).toBeDefined();
  });

  it("1.3 [Fallback to Review Drawer] opens Review Drawer when studentId is null/unresolved", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 1,
      allHighConfidence: false,
      items: [
        {
          tempFileId: "tmp-file-unmatched",
          previewUrl: "blob:http://localhost/letter-unmatched.webp",
          studentId: null, // Student not resolved automatically
          studentName: null,
          candidateName: "Rizky Santoso",
          matchConfidence: 0.90, // Even with 90% confidence on text, studentId is null
          status: "Sakit",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Demam berdarah",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 0.8,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ocrResponse,
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("letter.jpg", "image/jpeg")] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mulai Pindai/i }));
      await vi.runAllTimersAsync();
    });

    // Verification:
    expect(screen.getByText(/Tinjau Hasil Pemindaian \(1 Surat\)/i)).toBeDefined();
    expect(screen.getByText(/Terdeteksi: "Rizky Santoso"/i)).toBeDefined();
    expect(screen.getByText(/1 Perlu Dicek/i)).toBeDefined();

    // Student select should have default "-- Pilih Siswa Kelas --"
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("0");
  });

  it("1.4 [Empty Detection Boundary] handles 0 items detected gracefully without entering Review Drawer", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 0,
      allHighConfidence: false,
      items: [],
      processingTimeSeconds: 0.5,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ocrResponse,
    });

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("blank.jpg", "image/jpeg")] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mulai Pindai/i }));
      await vi.runAllTimersAsync();
    });

    // Verification: Error message shown, stays in picker mode
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/Tidak dapat mengekstrak data dari berkas/i)).toBeDefined();
    expect(screen.queryByText(/Tinjau Hasil Pemindaian/i)).toBeNull();
  });

  // =========================================================================
  // 2. NETWORK FAILURE RESILIENCE DURING AUTO-APPLY
  // =========================================================================

  it("2.1 [Network Resilience] preserves items and falls back to Review Drawer when auto-apply fetch throws network error", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 1,
      allHighConfidence: true,
      items: [
        {
          tempFileId: "tmp-file-resilience-1",
          previewUrl: "blob:http://localhost/letter-res.webp",
          studentId: 101,
          studentName: "Ahmad Rizky Pratama",
          candidateName: "Ahmad Rizky",
          matchConfidence: 0.96,
          status: "Izin",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Keperluan keluarga",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 1.0,
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/ocr/letter/batch")) {
        return { ok: true, json: async () => ocrResponse };
      }
      if (url.includes("/api/attendance/batch-sync")) {
        // Network drop simulation
        throw new Error("Koneksi jaringan terputus (Network connection failure)");
      }
      return { ok: false };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("letter.jpg", "image/jpeg")] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mulai Pindai/i }));
      await vi.runAllTimersAsync();
    });

    // Verification:
    // 1. Data was NOT lost! Modal switched to Review Drawer
    expect(screen.getByText(/Tinjau Hasil Pemindaian \(1 Surat\)/i)).toBeDefined();

    // 2. Error message banner alerts the user about the network failure
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Sinkronisasi otomatis gagal");
    expect(alert.textContent).toContain("Koneksi jaringan terputus");

    // 3. User can manually review and submit
    expect(screen.getByRole("button", { name: /Simpan & Sinkronkan/i })).toBeDefined();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("2.2 [Server Error Resilience] falls back to Review Drawer when auto-apply returns HTTP 500", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 1,
      allHighConfidence: true,
      items: [
        {
          tempFileId: "tmp-file-500",
          previewUrl: "blob:http://localhost/letter-500.webp",
          studentId: 102,
          studentName: "Bunga Citra Lestari",
          candidateName: "Bunga Citra",
          matchConfidence: 0.91,
          status: "Sakit",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Flu",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 1.0,
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/ocr/letter/batch")) {
        return { ok: true, json: async () => ocrResponse };
      }
      if (url.includes("/api/attendance/batch-sync")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ success: false, error: "Database lock timeout error" }),
        };
      }
      return { ok: false };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("letter.jpg", "image/jpeg")] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mulai Pindai/i }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText(/Tinjau Hasil Pemindaian \(1 Surat\)/i)).toBeDefined();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Database lock timeout error");
  });

  // =========================================================================
  // 3. REVIEW DRAWER EDITING & MANUAL SUBMIT
  // =========================================================================

  it("3.1 [Validation on Manual Submit] blocks submission and alerts when studentId is unselected", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 1,
      allHighConfidence: false,
      items: [
        {
          tempFileId: "tmp-file-empty-student",
          previewUrl: "blob:http://localhost/letter-empty.webp",
          studentId: null,
          studentName: null,
          candidateName: "Calon Siswa",
          matchConfidence: 0.70,
          status: "Izin",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Izin",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 0.7,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ocrResponse,
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("letter.jpg", "image/jpeg")] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mulai Pindai/i }));
      await vi.runAllTimersAsync();
    });

    // Try to click Simpan & Sinkronkan without selecting a student
    const submitBtn = screen.getByRole("button", { name: /Simpan & Sinkronkan/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Verification:
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain('Siswa belum dipilih untuk surat "Calon Siswa". Harap pilih nama siswa.');
    expect(fetchMock).not.toHaveBeenCalledWith("/api/attendance/batch-sync", expect.anything());
  });

  it("3.2 [Successful Manual Submission] allows editing student, status, multi-day range and successfully submits", async () => {
    const ocrResponse = {
      success: true,
      mode: "multi_file",
      totalDetected: 1,
      allHighConfidence: false,
      items: [
        {
          tempFileId: "tmp-edit-manual",
          previewUrl: "blob:http://localhost/letter-edit.webp",
          studentId: null,
          studentName: null,
          candidateName: "Dimas",
          matchConfidence: 0.65,
          status: "Izin",
          startDate: "2026-10-31",
          endDate: null,
          isMultiDay: false,
          description: "Sakit demam",
          actionType: "create",
          existingRecordId: null,
        },
      ],
      processingTimeSeconds: 0.6,
    };

    const syncResponse = {
      success: true,
      updatedCount: 0,
      createdCount: 2, // 2 days multi-day
      totalProcessed: 2,
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/ocr/letter/batch")) {
        return { ok: true, json: async () => ocrResponse };
      }
      if (url.includes("/api/attendance/batch-sync")) {
        return { ok: true, json: async () => syncResponse };
      }
      return { ok: false };
    });
    globalThis.fetch = fetchMock;

    renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [createDummyFile("letter.jpg", "image/jpeg")] } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mulai Pindai/i }));
      await vi.runAllTimersAsync();
    });

    // 1. Select student Dimas Anggara (id: 103)
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "103" } });

    // 2. Change status to Sakit
    const sakitButton = screen.getByRole("button", { name: /^Sakit$/i });
    fireEvent.click(sakitButton);

    // 3. Toggle Multi-day checkbox
    const multiDayCheckbox = screen.getByLabelText(/Rentang Beberapa Hari/i) as HTMLInputElement;
    fireEvent.click(multiDayCheckbox);

    // Set end date to 2026-11-01
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2); // startDate and endDate
    fireEvent.change(dateInputs[1], { target: { value: "2026-11-01" } });

    // 4. Click Simpan & Sinkronkan
    const submitBtn = screen.getByRole("button", { name: /Simpan & Sinkronkan/i });
    await act(async () => {
      fireEvent.click(submitBtn);
      await vi.runAllTimersAsync();
    });

    // Verification:
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attendance/batch-sync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          classId: 1,
          items: [
            {
              tempFileId: "tmp-edit-manual",
              studentId: 103,
              status: "Sakit",
              startDate: "2026-10-31",
              endDate: "2026-11-01",
              isMultiDay: true,
              description: "Sakit demam",
              actionType: "create",
              existingRecordId: null,
            },
          ],
        }),
      })
    );

    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnShowToast).toHaveBeenCalledWith("Berhasil: 0 catatan diperbarui, 2 dibuat baru", "success");
    expect(mockOnSuccess).toHaveBeenCalledWith({ updatedCount: 0, createdCount: 2 });
  });

  // =========================================================================
  // 4. TOUCH TARGETS (>= 48px), A11Y & BOTTOM SHEET GESTURES
  // =========================================================================

  it("4.1 [WCAG 2.2 AA Touch Targets] satisfies minimum 48px height across interactive elements", () => {
    renderModal();

    // Tab buttons
    const tabMultiFile = screen.getByRole("button", { name: /Pilih Banyak File/i });
    const tabTableScan = screen.getByRole("button", { name: /Foto Meja/i });

    expect(tabMultiFile.className).toContain("min-h-[48px]");
    expect(tabTableScan.className).toContain("min-h-[48px]");

    // Primary action button
    const scanButton = screen.getByRole("button", { name: /Mulai Pindai/i });
    expect(scanButton.className).toContain("min-h-[48px]");

    // Close button and back button have touch-target class
    const closeBtn = screen.getByLabelText("Tutup modal");
    expect(closeBtn.className).toContain("touch-target");

    // Modal dialog accessibility
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("batch-scanner-title");
  });

  it("4.2 [Mobile Bottom Sheet Gestures] dismisses when dragged down > 50px threshold", async () => {
    // Switch to mobile viewport (< 640px)
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });

    renderModal();

    const dragHandle = document.querySelector("[data-drag-handle]") as HTMLElement;
    expect(dragHandle).toBeDefined();

    // 1. Simulate downward drag of 70px (> threshold 50px)
    act(() => {
      fireEvent.touchStart(dragHandle, {
        touches: [{ clientY: 100 }],
      });
    });
    act(() => {
      fireEvent.touchMove(dragHandle, {
        touches: [{ clientY: 170 }], // deltaY = +70
      });
    });
    act(() => {
      fireEvent.touchEnd(dragHandle);
    });

    // Advance 200ms to trigger the 180ms dismissal timeout
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    // Should call onClose
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("4.3 [Mobile Bottom Sheet Gestures] does not dismiss when drag is < 50px (springs back)", async () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });

    renderModal();

    const dragHandle = document.querySelector("[data-drag-handle]") as HTMLElement;

    // Simulate downward drag of 25px (< threshold 50px)
    await act(async () => {
      fireEvent.touchStart(dragHandle, {
        touches: [{ clientY: 100 }],
      });
      fireEvent.touchMove(dragHandle, {
        touches: [{ clientY: 125 }], // deltaY = +25
      });
      fireEvent.touchEnd(dragHandle);
      await vi.runAllTimersAsync();
    });

    // Should NOT call onClose
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("4.4 [Mobile Bottom Sheet Gestures] does not drag when touching interactive buttons", async () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });

    renderModal();

    const button = screen.getByRole("button", { name: /Batal/i });

    // Touch event directly on button should be ignored by useBottomSheetGesture
    await act(async () => {
      fireEvent.touchStart(button, {
        touches: [{ clientY: 100 }],
      });
      fireEvent.touchMove(button, {
        touches: [{ clientY: 200 }],
      });
      fireEvent.touchEnd(button);
      await vi.runAllTimersAsync();
    });

    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
