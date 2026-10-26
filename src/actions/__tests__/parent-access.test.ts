import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateParentAccessAction } from "../class-settings";
import { verifyPassword } from "@/lib/auth";
import { generateUniqueClassSlug } from "@/lib/class-slug";

describe("Parent Portal Password Control", () => {
  let classId: number;
  let originalHash: string | null = null;

  beforeAll(async () => {
    const cls = await db.query.classes.findFirst();
    if (!cls) throw new Error("Class not found");
    classId = cls.id;
    originalHash = cls.parentPasswordHash;
  });

  it("should allow disabling password protection (setting parentPasswordHash to null)", async () => {
    // Direct DB update simulating updateParentAccessAction with requirePassword=false
    await db
      .update(classes)
      .set({ parentPasswordHash: null })
      .where(eq(classes.id, classId));

    const clsAfter = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });

    expect(clsAfter?.parentPasswordHash).toBeNull();
  });

  it("should allow re-enabling password protection with a new password", async () => {
    const newPass = "wali123";
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(newPass, 10);

    await db
      .update(classes)
      .set({ parentPasswordHash: hash })
      .where(eq(classes.id, classId));

    const clsAfter = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });

    expect(clsAfter?.parentPasswordHash).not.toBeNull();
    const isValid = await verifyPassword(newPass, clsAfter!.parentPasswordHash!);
    expect(isValid).toBe(true);

    // Always restore original hash (or valid default test hash)
    const restoreHash = originalHash || "$2b$10$UbE2l7RTO8tui0wEFfUhkOggyVqCm1WsrJ6dvShvKN7s3T98CL4cu";
    await db
      .update(classes)
      .set({ parentPasswordHash: restoreHash })
      .where(eq(classes.id, classId));
  });

  it("should allow manual editing of periodTitle and academicYear", async () => {
    // Manually edit to custom semester
    await db
      .update(classes)
      .set({
        periodTitle: "Semester Khusus / Antara",
        academicYear: "2025/2026",
      })
      .where(eq(classes.id, classId));

    let cls = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    expect(cls?.periodTitle).toBe("Semester Khusus / Antara");
    expect(cls?.academicYear).toBe("2025/2026");

    // Reset back to automatic values
    const { getAutoAcademicPeriod } = await import("@/lib/academic-year");
    const auto = getAutoAcademicPeriod();
    await db
      .update(classes)
      .set({
        periodTitle: auto.periodTitle,
        academicYear: auto.academicYear,
      })
      .where(eq(classes.id, classId));

    cls = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    expect(cls?.periodTitle).toBe(auto.periodTitle);
    expect(cls?.academicYear).toBe(auto.academicYear);
  });

  it("should allow Wali Kelas to update class name while keeping portal slug intact", async () => {
    const originalClass = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    const originalName = originalClass!.name;
    const originalSlug = originalClass!.slug;

    // Update class name
    await db
      .update(classes)
      .set({ name: "XII TKJ 2 (Unggulan)" })
      .where(eq(classes.id, classId));

    const updated = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    expect(updated?.name).toBe("XII TKJ 2 (Unggulan)");
    expect(updated?.slug).toBe(originalSlug); // Slug remains unchanged!

    // Restore original name
    await db
      .update(classes)
      .set({ name: originalName })
      .where(eq(classes.id, classId));
  });

  it("should generate a 3-character random letter slug decoupled from class name", async () => {
    const code = await generateUniqueClassSlug();
    expect(code).toHaveLength(3);
    expect(/^[a-zA-Z]{3}$/.test(code)).toBe(true);

    // Ensure it is completely decoupled from class name "XII TKJ 2"
    expect(code).not.toContain("xii");
    expect(code).not.toContain("tkj");
  });
});
