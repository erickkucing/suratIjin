import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";

describe("Files API Route - On-demand PWA Icon Generation", () => {
  const storageBase = process.env.STORAGE_PATH || "./storage/uploads";
  const systemDir = path.resolve(storageBase, "system");
  const testTs = "9999999999999";
  const sourceLogoPath = path.resolve(systemDir, `logo-${testTs}.png`);
  const onDemandIcon192Path = path.resolve(systemDir, `icon-192-${testTs}.png`);
  const onDemandAppleIconPath = path.resolve(systemDir, `apple-icon-${testTs}.png`);

  beforeEach(async () => {
    if (!fs.existsSync(systemDir)) {
      fs.mkdirSync(systemDir, { recursive: true });
    }

    // Create a dummy source logo
    await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 4,
        background: { r: 181, g: 72, b: 38, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
      .then((buf) => fs.writeFileSync(sourceLogoPath, buf));

    // Ensure icon variants do not exist before request
    if (fs.existsSync(onDemandIcon192Path)) fs.unlinkSync(onDemandIcon192Path);
    if (fs.existsSync(onDemandAppleIconPath)) fs.unlinkSync(onDemandAppleIconPath);
  });

  afterEach(() => {
    [sourceLogoPath, onDemandIcon192Path, onDemandAppleIconPath].forEach((p) => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
  });

  it("should generate icon-192 on the fly if only logo exists and serve it", async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/system/icon-192-${testTs}.png`);
    const params = Promise.resolve({ path: ["system", `icon-192-${testTs}.png`] });

    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");

    expect(fs.existsSync(onDemandIcon192Path)).toBe(true);
    const meta = await sharp(onDemandIcon192Path).metadata();
    expect(meta.width).toBe(192);
    expect(meta.height).toBe(192);
  });

  it("should generate apple-icon (180x180) on the fly if only logo exists and serve it", async () => {
    const req = new NextRequest(`http://localhost:3000/api/files/system/apple-icon-${testTs}.png`);
    const params = Promise.resolve({ path: ["system", `apple-icon-${testTs}.png`] });

    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");

    expect(fs.existsSync(onDemandAppleIconPath)).toBe(true);
    const meta = await sharp(onDemandAppleIconPath).metadata();
    expect(meta.width).toBe(180);
    expect(meta.height).toBe(180);
  });
});
