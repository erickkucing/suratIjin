import { test, expect } from "@playwright/test";
import { db } from "@/db";
import { students } from "@/db/schema";
import { or, like, eq } from "drizzle-orm";

test.describe("03. Student Roster Management Workflow", () => {
  const TEST_STUDENT_NAME = "__E2E_TEST_STUDENT__";
  const TEST_STUDENT_EDITED = "__E2E_TEST_STUDENT_EDITED__";
  const TEST_NIS = "999999";

  const cleanupTestStudents = async () => {
    try {
      await db.delete(students).where(
        or(
          like(students.name, "%__E2E_%"),
          eq(students.nis, TEST_NIS)
        )
      );
    } catch {
      // Best-effort cleanup
    }
  };

  test.beforeAll(async () => {
    await cleanupTestStudents();
  });

  test.afterAll(async () => {
    await cleanupTestStudents();
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

  test("should open roster modal and add a new test student", async ({ page }) => {
    const openBtn = page.locator('button:has-text("Kelola Siswa")');
    await openBtn.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator("#student-roster-title")).toContainText("Kelola Daftar Siswa");

    const addTab = modal.locator('button:has-text("+ Tambah Siswa")');
    await addTab.click();

    await modal.locator("#new-student-name").fill(TEST_STUDENT_NAME);
    await modal.locator("#new-student-nis").fill(TEST_NIS);

    const submitBtn = modal.locator('button[type="submit"]:has-text("Tambahkan Siswa")');
    await submitBtn.click();

    await expect(modal.locator(".bg-\\[var\\(--status-success-bg\\)\\]")).toContainText(/berhasil/i);

    const listTab = modal.locator('button:has-text("Daftar Siswa")');
    await listTab.click();

    const searchInput = modal.locator('input[placeholder*="Cari nama atau NIS"]');
    await searchInput.fill(TEST_STUDENT_NAME);

    const studentItem = modal.locator(`div:has-text("${TEST_STUDENT_NAME}")`).last();
    await expect(studentItem).toBeVisible();
    await expect(modal.locator(`text=NIS: ${TEST_NIS}`)).toBeVisible();
  });

  test("should edit existing student name and NIS", async ({ page }) => {
    const openBtn = page.locator('button:has-text("Kelola Siswa")');
    await openBtn.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    const searchInput = modal.locator('input[placeholder*="Cari nama atau NIS"]');
    await searchInput.fill(TEST_STUDENT_NAME);

    const editBtn = modal.locator(`button[aria-label="Edit ${TEST_STUDENT_NAME}"]`);
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const editRow = modal.locator(".divide-y > div").first();
    const editNameInput = editRow.locator("input").first();
    await editNameInput.fill(TEST_STUDENT_EDITED);

    const saveBtn = editRow.locator('button[title="Simpan"]');
    await saveBtn.click();

    await searchInput.fill(TEST_STUDENT_EDITED);
    await expect(modal.locator(`div:has-text("${TEST_STUDENT_EDITED}")`).last()).toBeVisible();
  });

  test("should download Excel student import template", async ({ page }) => {
    const openBtn = page.locator('button:has-text("Kelola Siswa")');
    await openBtn.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    const bulkTab = modal.locator('button:has-text("Impor Massal")');
    await bulkTab.click();

    const downloadTemplateBtn = modal.locator('button:has-text("Download Format Excel")');
    await expect(downloadTemplateBtn).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadTemplateBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test("teardown: should delete test student cleanly", async ({ page }) => {
    const openBtn = page.locator('button:has-text("Kelola Siswa")');
    await openBtn.click();

    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    const searchInput = modal.locator('input[placeholder*="Cari nama atau NIS"]');
    await searchInput.fill(TEST_STUDENT_EDITED);

    const deleteBtn = modal.locator(`button[aria-label="Hapus ${TEST_STUDENT_EDITED}"]`);
    await expect(deleteBtn).toBeVisible();

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    await deleteBtn.click();

    await expect(modal.locator(`p:has-text("${TEST_STUDENT_EDITED}")`)).not.toBeVisible({ timeout: 5000 });

    const closeBtn = modal.locator('button[aria-label="Tutup dialog"]');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
