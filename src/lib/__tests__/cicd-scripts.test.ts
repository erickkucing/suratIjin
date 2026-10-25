import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("CI/CD & Deployment Scripts Verification", () => {
  const rootDir = path.resolve(".");

  it("should have a valid GitHub Actions CI/CD workflow file", () => {
    const workflowPath = path.join(rootDir, ".github/workflows/ci-cd.yml");
    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, "utf8");
    expect(content).toContain("name: CI/CD Pipeline");
    expect(content).toContain("node-version: 20");
    expect(content).toContain("npm run lint");
    expect(content).toContain("npm run test:unit");
    expect(content).toContain("npm run build");
    expect(content).toContain("appleboy/ssh-action");
    expect(content).toContain("./scripts/deploy.sh prod");
    expect(content).toContain("permissions:\n  contents: read");
    expect(content).toContain("concurrency:");
  });

  it("should have an executable deploy.sh script supporting dev and prod ports", () => {
    const deployScriptPath = path.join(rootDir, "scripts/deploy.sh");
    expect(fs.existsSync(deployScriptPath)).toBe(true);

    const stat = fs.statSync(deployScriptPath);
    // Check executable bit
    expect(stat.mode & 0o111).toBeGreaterThan(0);

    const content = fs.readFileSync(deployScriptPath, "utf8");
    expect(content).toContain("#!/usr/bin/env bash");
    expect(content).toContain("set -euo pipefail");
    expect(content).toContain("PORT=80");
    expect(content).toContain("PORT=3000");
    expect(content).toContain("systemctl stop nginx");
    expect(content).toContain("systemctl restart \"$SERVICE_NAME\"");
    expect(content).toContain("HEALTHCHECK_URL=");
  });

  it("should have an executable update.sh script with safe git rebase and rollback", () => {
    const updateScriptPath = path.join(rootDir, "scripts/update.sh");
    expect(fs.existsSync(updateScriptPath)).toBe(true);

    const stat = fs.statSync(updateScriptPath);
    // Check executable bit
    expect(stat.mode & 0o111).toBeGreaterThan(0);

    const content = fs.readFileSync(updateScriptPath, "utf8");
    expect(content).toContain("#!/usr/bin/env bash");
    expect(content).toContain("set -euo pipefail");
    expect(content).toContain("git stash push");
    expect(content).toContain("git pull --rebase");
    expect(content).toContain("git rebase --abort");
    expect(content).toContain("git reset --hard");
    expect(content).toContain("deploy.sh");
  });
});
