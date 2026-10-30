import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { db } from "@/db";
import { attendanceRecords } from "@/db/schema";
import { like } from "drizzle-orm";

test.describe("02. Dashboard & Attendance Workflow", () => {
  const TEST_DESC = "__E2E_TEST_ATTENDANCE__";
  let samplePngBuffer: Buffer;

  const cleanupTestRecords = async () => {
    try {
      await db.delete(attendanceRecords).where(like(attendanceRecords.description, `%${TEST_DESC}%`));
    } catch {
      // Best-effort cleanup
    }
  };

  test.beforeAll(async () => {
    await cleanupTestRecords();

    samplePngBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  test.afterAll(async () => {
    await cleanupTestRecords();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", "erick");
    await page.fill("#password", "feelgood6969");
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 10000 }),
      page.click('button[type="submit"]'),
    ]);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("should filter table when clicking stat cards", async ({ page }) => {
    const alpaCard = page.locator('button:has-text("Total Alpa")').first();
    await alpaCard.click();
    await expect(alpaCard).toHaveClass(/ring-2/);

    const izinCard = page.locator('button:has-text("Total Izin")').first();
    await izinCard.click();
    await expect(izinCard).toHaveClass(/ring-2/);
    await expect(alpaCard).not.toHaveClass(/ring-2/);
  });

  test("should create test attendance record with letter file and verify in table", async ({ page }) => {
    const openBtn = page.locator('button:has-text("Catat Ketidakhadiran")');
    await openBtn.click();
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    // Select student from combobox
    const studentInput = modal.locator("#student-combobox");
    await studentInput.click();
    const firstOption = modal.locator('#student-listbox [role="option"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    await firstOption.click();

    const izinBtn = modal.locator('button:has-text("Izin")').first();
    await izinBtn.click();

    const fileInput = modal.locator('input[type="file"][accept*=".pdf"]');
    const [ocrResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/ocr/letter")),
      fileInput.setInputFiles({
        name: "surat_dokter_dummy.png",
        mimeType: "image/png",
        buffer: samplePngBuffer,
      }),
    ]);
    await ocrResponse.finished();

    await expect(modal.locator('img[alt="Pratinjau Surat"]')).toBeVisible({ timeout: 10000 });

    // Allow OCR auto-fill state to settle, then set test description explicitly
    await page.waitForTimeout(500);
    await page.fill("#keterangan", TEST_DESC);

    const submitBtn = modal.locator('button[type="submit"]:has-text("Simpan Catatan")');
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await expect(modal).not.toBeVisible({ timeout: 10000 });

    const tableRow = page.locator(`tr:has-text("${TEST_DESC}")`);
    await expect(tableRow).toBeVisible({ timeout: 10000 });
  });

  test("should open lightbox for letter and close with Escape key", async ({ page }) => {
    const tableRow = page.locator(`tr:has-text("${TEST_DESC}")`);
    await expect(tableRow).toBeVisible({ timeout: 7000 });

    const viewLetterBtn = tableRow.locator('button:has-text("Lihat Surat")');
    await viewLetterBtn.click();

    const lightbox = page.locator('div[role="dialog"][aria-label*="Surat Keterangan"]');
    await expect(lightbox).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(lightbox).not.toBeVisible({ timeout: 5000 });
  });

  test("should copy WhatsApp parent portal message from settings modal", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const portalBtn = page.locator('button:has-text("Pengaturan Kelas & Portal")');
    await portalBtn.click();

    const settingsModal = page.locator('div[role="dialog"]');
    await expect(settingsModal).toBeVisible();

    const copyWaBtn = settingsModal.locator('button:has-text("Salin Pesan WhatsApp")');
    await copyWaBtn.click();

    await expect(settingsModal.locator('text=Format WA Tersalin!')).toBeVisible({ timeout: 5000 });

    const closeBtn = settingsModal.locator('button[aria-label="Tutup dialog"]');
    await closeBtn.click();
    await expect(settingsModal).not.toBeVisible();
  });

  test("should trigger PDF and Excel export without errors", async ({ page }) => {
    const exportPdfBtn = page.locator('button:has-text("Export PDF")');
    await expect(exportPdfBtn).toBeVisible();
    await exportPdfBtn.click();

    const exportExcelBtn = page.locator('button:has-text("Export Excel")');
    await expect(exportExcelBtn).toBeVisible();
    await exportExcelBtn.click();

    await page.waitForTimeout(1000);
  });

  test("teardown: should delete test attendance record cleanly", async ({ page }) => {
    const tableRow = page.locator(`tr:has-text("${TEST_DESC}")`);
    await expect(tableRow).toBeVisible({ timeout: 7000 });

    const deleteBtn = tableRow.locator('button[title="Hapus Data"]');
    await expect(deleteBtn).toBeVisible();

    await deleteBtn.click();

    // Confirm using custom alertdialog button
    const confirmBtn = page.locator('div[role="alertdialog"]').getByRole("button", { name: "Hapus Catatan", exact: true });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    await expect(page.locator(`tr:has-text("${TEST_DESC}")`)).not.toBeVisible({ timeout: 7000 });
  });
});
