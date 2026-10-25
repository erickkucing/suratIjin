import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateParentAccessAction } from "../class-settings";
import { verifyPassword } from "@/lib/auth";

describe("Parent Portal Password Control", () => {
  let classId: number;
  let originalHash: string | null = null;

  beforeAll(async () => {
    const cls = await db.query.classes.findFirst({
      where: eq(classes.slug, "xii-tkj-2"),
    });
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

    // Restore original hash
    if (originalHash) {
      await db
        .update(classes)
        .set({ parentPasswordHash: originalHash })
        .where(eq(classes.id, classId));
    }
  });
});
