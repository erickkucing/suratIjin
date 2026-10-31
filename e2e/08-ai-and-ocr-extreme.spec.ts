import { test, expect } from "@playwright/test";
import path from "path";
import { db } from "@/db";
import { attendanceRecords, students, systemSettings } from "@/db/schema";
import { like, eq, or } from "drizzle-orm";
import { deleteCache } from "@/lib/redis";

test.describe("08. AI Vision & OCR Extreme Suite (Full End-to-End)", () => {
  const TEST_TAG = "__E2E_AI_TEST__";
  const FIXTURES_DIR = path.resolve(__dirname, "fixtures");

  const cleanupDatabase = async () => {
    try {
      await db
        .delete(attendanceRecords)
        .where(like(attendanceRecords.description, `%${TEST_TAG}%`));
      await db
        .delete(students)
        .where(
          or(
            like(students.name, `%${TEST_TAG}%`),
            like(students.name, "%Bambang Pamungkas%"),
            like(students.name, "%Siti Nurhaliza%")
          )
        );
    } catch (e) {
      console.warn("[E2E Cleanup] Warning during DB cleanup:", e);
    }
  };

  test.beforeAll(async () => {
    await cleanupDatabase();

    // Configure 9router AI in MySQL database
    await db
      .update(systemSettings)
      .set({
        aiEnabled: true,
        aiRouterUrl: "http://127.0.0.1:20128/v1",
        aiRouterApiKey: "sk-af4afa1811721fd9-fvv5li-e50e6214",
        aiRouterModel: "mycombo",
      })
      .where(eq(systemSettings.id, 1));

    await deleteCache("cache:settings:global");
  });

  test.afterAll(async () => {
    await cleanupDatabase();

    // Reset AI to disabled in DB
    await db
      .update(systemSettings)
      .set({
        aiEnabled: false,
      })
      .where(eq(systemSettings.id, 1));

    await deleteCache("cache:settings:global");
  });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("01. Admin: 9Router AI Gateway & PaddleOCR Microservice Connectivity", async ({ page }) => {
    test.setTimeout(90000);

    // Login as Superadmin
    await page.goto("/login");
    await page.fill("#username", "admin");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    // Go to Pengaturan Teknis
    await page.click('button:has-text("Pengaturan Teknis")');

    // Click subtab "Integrasi AI"
    const aiSubTab = page.locator('#tech-tab-ai, button:has-text("Integrasi AI")').first();
    await expect(aiSubTab).toBeVisible();
    await aiSubTab.click();

    // Verify AI Enabled switch
    const toggle = page.locator('button[role="switch"][aria-label*="Integrasi 9Router"]');
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // Click "Uji Koneksi 9router" button
    const testConnBtn = page.locator('button[title*="koneksi 9router"], button:has-text("Uji Koneksi")').first();
    await expect(testConnBtn).toBeVisible();
    await testConnBtn.click();

    // Verify success banner / latency indicator
    await expect(page.locator("body")).toContainText("ms", { timeout: 20000 });
    await expect(page.locator("body")).toContainText("Layanan 9Router AI Aktif");
  });

  test("02. Single Letter: OCR & AI Vision Refinement on Extreme Cursive Handwriting", async ({ page }) => {
    test.setTimeout(120000);

    // Login as Wali Kelas
    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    // Open Add Attendance modal via "Catat Ketidakhadiran"
    await page.click('button:has-text("Catat Ketidakhadiran")');
    const modal = page.locator('div[role="dialog"]');
    await expect(modal.locator("#attendance-modal-title")).toBeVisible();

    // Upload extreme cursive letter
    const cursiveFile = path.join(FIXTURES_DIR, "extreme_letter_cursive.png");
    const fileInput = modal.locator('input[accept*=".pdf,.jpg"]').first();
    await fileInput.setInputFiles(cursiveFile);

    // Wait for student combobox to auto-fill from OCR
    await expect(modal.locator("#student-combobox")).not.toHaveValue("", { timeout: 60000 });

    // Check if AI Refinement button is available and trigger it
    const refineBtn = modal.locator('button:has-text("Analisis dengan AI"), button:has-text("Sempurnakan tulisan tangan dengan AI")').first();
    if (await refineBtn.isVisible()) {
      await refineBtn.click();
      await page.waitForSelector('text=Menganalisis...', { state: "detached", timeout: 60000 });
    }

    // Verify candidate matched: Adrian Manuel Hartono
    const searchVal = await modal.locator("#student-combobox").inputValue();
    expect(searchVal.toLowerCase()).toContain("adrian");

    // Verify status Sakit is selected (active button has ring-2)
    const sakitBtn = modal.locator('button:has-text("Sakit")').first();
    await expect(sakitBtn).toHaveClass(/ring-2/);

    // Fill test description with TEST_TAG
    await modal.locator("#keterangan").fill(`${TEST_TAG} Cursive Letter Test`);

    // Submit form
    await modal.locator('button[type="submit"]:has-text("Simpan Catatan")').click();

    // Wait for modal to close
    await expect(page.locator("#attendance-modal-title")).toHaveCount(0, { timeout: 20000 });

    // Verify dashboard table contains Adrian
    await expect(page.locator("table")).toContainText("Adrian", { timeout: 15000 });
  });

  test("03. Single Letter: Semantic Reasoning on Scratched-Out / Corrected Date & Status", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    await page.click('button:has-text("Catat Ketidakhadiran")');
    const modal = page.locator('div[role="dialog"]');
    await expect(modal.locator("#attendance-modal-title")).toBeVisible();

    const struckFile = path.join(FIXTURES_DIR, "extreme_letter_struck_correction.png");
    const fileInput = modal.locator('input[accept*=".pdf,.jpg"]').first();
    await fileInput.setInputFiles(struckFile);

    // Wait for student combobox or OCR banner
    await expect(modal.locator("#student-combobox")).not.toHaveValue("", { timeout: 60000 });

    // Trigger AI Refinement
    const refineBtn = modal.locator('button:has-text("Analisis dengan AI"), button:has-text("Sempurnakan tulisan tangan dengan AI")').first();
    if (await refineBtn.isVisible()) {
      await refineBtn.click();
      await page.waitForSelector('text=Menganalisis...', { state: "detached", timeout: 60000 });
    }

    // Verify student candidate matched: Alfeus
    const searchVal = await modal.locator("#student-combobox").inputValue();
    expect(searchVal.toLowerCase()).toContain("alfeus");

    // Verify status Sakit (corrected from crossed out Izin)
    const sakitBtn = modal.locator('button:has-text("Sakit")').first();
    await expect(sakitBtn).toHaveClass(/ring-2/);

    // Verify start date is 2026-10-29 (not struck-through 2026-10-25)
    const startDateVal = await modal.locator("#start-date").inputValue();
    expect(startDateVal).toBe("2026-10-29");

    await modal.locator("#keterangan").fill(`${TEST_TAG} Semantic Correction Test`);
    await modal.locator('button[type="submit"]:has-text("Simpan Catatan")').click();
    await expect(page.locator("#attendance-modal-title")).toHaveCount(0, { timeout: 20000 });
  });

  test("04. Batch & Tabletop Scan: Multi-Letter Segmentation and Batch Sync", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    // Open Batch Letter Scanner Modal
    await page.click('button:has-text("Pindai Banyak Surat"), button:has-text("Batch Scan")');
    const batchModal = page.locator('div[role="dialog"]');
    await expect(batchModal.locator('#batch-scanner-title')).toBeVisible();

    // Upload extreme tabletop multi-letter image
    const tableFile = path.join(FIXTURES_DIR, "extreme_table_multiletter.png");
    const multiInput = batchModal.locator('input[type="file"][multiple]').first();
    await multiInput.setInputFiles(tableFile);

    // Click "Proses & Pindai"
    const startScanBtn = batchModal.locator('button:has-text("Proses & Pindai")');
    await expect(startScanBtn).toBeVisible({ timeout: 10000 });
    await startScanBtn.click();

    // Either it auto-applies and closes the modal, OR displays review drawer with "Simpan & Sinkronkan"
    const syncBtn = batchModal.locator('button:has-text("Simpan & Sinkronkan")');
    const isReview = await syncBtn.isVisible({ timeout: 45000 }).catch(() => false);
    if (isReview) {
      await syncBtn.click();
    }

    // Verify batch modal closes
    await expect(page.locator('#batch-scanner-title')).toHaveCount(0, { timeout: 35000 });

    // Verify tabletop letter records appear on dashboard
    await expect(page.locator("table")).toContainText("Davin", { timeout: 15000 });
  });

  test("05. Roster Management: Handwritten Roster OCR / AI Import", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    // Open Student Roster Modal
    await page.click('button:has-text("Kelola Siswa")');
    const rosterModal = page.locator('div[role="dialog"]');
    await expect(rosterModal.locator('#student-roster-title')).toBeVisible();

    // Switch to Impor Massal tab
    await rosterModal.locator('button:has-text("Impor Massal")').click();

    // Switch to Foto/PDF mode
    await rosterModal.locator('button:has-text("Foto/PDF")').click();

    // Upload handwritten roster
    const rosterFile = path.join(FIXTURES_DIR, "extreme_roster_handwritten.png");
    const rosterInput = rosterModal.locator('input[type="file"][accept*=".pdf"]').last();
    await rosterInput.setInputFiles(rosterFile);

    // Wait for OCR extraction using getByText
    await expect(rosterModal.getByText(/Hasil Ekstraksi OCR/i)).toBeVisible({ timeout: 60000 });
    await expect(rosterModal.getByText(/Siswa Terdeteksi/i)).toBeVisible({ timeout: 60000 });

    // Verify student name extracted (use :visible to select active responsive viewport element)
    await expect(rosterModal.locator('input[value*="Adrian Manuel Hartono"]:visible')).toBeVisible({ timeout: 10000 });

    // Close modal
    await page.keyboard.press("Escape");
    await expect(page.locator('#student-roster-title')).toHaveCount(0, { timeout: 5000 });
  });

  test("06. Dashboard AI Insights: Narrative Attendance Insights Synthesis", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    // Click "Insight"
    const insightsBtn = page.locator('button[title*="Insight"], button:has-text("Insight")').first();
    await expect(insightsBtn).toBeVisible({ timeout: 10000 });
    await insightsBtn.click();

    // Wait for insights modal
    await expect(page.locator('#insights-modal-title')).toBeVisible();

    // Click Narasi Laporan & WhatsApp tab
    const narrativeTab = page.locator('button:has-text("Narasi Laporan")').first();
    await expect(narrativeTab).toBeVisible({ timeout: 15000 });
    await narrativeTab.click();

    // Verify narrative content loaded
    await expect(page.locator('button:has-text("Salin Teks WhatsApp"), button:has-text("Salin"), textarea, .font-mono').first()).toBeVisible({ timeout: 45000 });

    // Close modal
    await page.keyboard.press("Escape");
  });
});
