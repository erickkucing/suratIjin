import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "../roster/route";
import { _clearRateLimitStoreForTesting } from "@/lib/rate-limiter";
import { db } from "@/db";
import { users, classes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import fs from "fs";
import path from "path";

describe("OCR Roster API Route (/api/ocr/roster)", () => {
  beforeEach(() => {
    _clearRateLimitStoreForTesting();
  });

  it("should return 401 when user is not authenticated", async () => {
    const formData = new FormData();
    formData.append("classId", "1");
    formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Sesi tidak valid");
  });

  it("should return 400 when classId or file is missing", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const formData = new FormData();
    // Missing file

    const req = new Request("http://localhost:3000/api/ocr/roster", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("should return 400 when file format has invalid magic bytes", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("file", new Blob(["plain text dummy content that is not pdf or image"], { type: "text/plain" }), "fake.png");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Format file tidak valid");
  });

  it("should successfully extract students when proxying valid image to local OCR service", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    // Read the committed test table fixture
    const fixturePath = path.join(__dirname, "fixtures", "test_table.png");
    const testBuffer = fs.readFileSync(fixturePath);

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("file", new Blob([testBuffer], { type: "image/png" }), "test_table.png");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalStudents).toBe(3);
    expect(body.students[0].name).toBe("Ahmad Dahlan");
    expect(body.students[0].nis).toBe("1001");
    expect(body.students[1].name).toBe("Budi Santoso");
    expect(body.students[1].nis).toBe("1002");
    expect(body.students[2].name).toBe("Citra Lestari");
    expect(body.students[2].nis).toBe("1003");
  }, 30000);

  it("should successfully extract students from multi-page PDF document", async () => {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "superadmin"),
    });
    if (!adminUser) throw new Error("Superadmin user not found");

    const token = await createSessionToken({
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      role: adminUser.role,
    });

    const testClass = await db.query.classes.findFirst();
    if (!testClass) throw new Error("Class not found");

    const fixturePath = path.join(__dirname, "fixtures", "test_multipage.pdf");
    const pdfBuffer = fs.readFileSync(fixturePath);

    const formData = new FormData();
    formData.append("classId", String(testClass.id));
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), "test_multipage.pdf");

    const req = new Request("http://localhost:3000/api/ocr/roster", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: formData,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pagesProcessed).toBe(2);
    expect(body.totalStudents).toBe(4);
    expect(body.students.some((s: any) => s.name === "Ahmad Dahlan" && s.nis === "1001")).toBe(true);
    expect(body.students.some((s: any) => s.name === "Fajar Ramadhan" && s.nis === "1004")).toBe(true);
  }, 30000);
});
