import fs from "fs";
import path from "path";
import { db } from "../src/db";
import { attendanceRecords } from "../src/db/schema";
import { isNotNull } from "drizzle-orm";

async function cleanupOrphanedUploads(dryRun: boolean = false) {
  console.log(`==> Starting Orphaned Uploads Cleanup (dryRun: ${dryRun})...`);

  const storageBase = path.resolve(process.env.STORAGE_PATH || "./storage/uploads");
  if (!fs.existsSync(storageBase)) {
    console.log(`Storage path ${storageBase} does not exist. Nothing to clean.`);
    return;
  }

  // Fetch all registered letter file paths
  const records = await db
    .select({ filePath: attendanceRecords.letterFilePath })
    .from(attendanceRecords)
    .where(isNotNull(attendanceRecords.letterFilePath));

  const validPaths = new Set(records.map((r) => r.filePath).filter(Boolean) as string[]);
  console.log(`Registered letter files in database: ${validPaths.size}`);

  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  let scannedCount = 0;
  let orphanedCount = 0;
  let freedBytes = 0;

  function scanDir(currentDir: string, relativeDir: string = "") {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip reserved directories
        if (relPath === "legacy" || relPath === "system") {
          continue;
        }
        scanDir(fullPath, relPath);
      } else if (entry.isFile()) {
        scannedCount++;
        // Check if referenced
        if (!validPaths.has(relPath)) {
          const stat = fs.statSync(fullPath);
          // Only delete files older than 1 hour to prevent race conditions during upload
          if (now - stat.mtimeMs > ONE_HOUR_MS) {
            orphanedCount++;
            freedBytes += stat.size;
            console.log(`[ORPHAN] ${relPath} (${(stat.size / 1024).toFixed(1)} KB)`);

            if (!dryRun) {
              try {
                fs.unlinkSync(fullPath);
              } catch (e) {
                console.warn(`Failed to delete ${relPath}:`, e);
              }
            }
          }
        }
      }
    }
  }

  scanDir(storageBase);

  console.log(`\n==> Summary:`);
  console.log(`    Total files scanned: ${scannedCount}`);
  console.log(`    Orphaned files found: ${orphanedCount}`);
  console.log(`    Storage freed: ${(freedBytes / (1024 * 1024)).toFixed(2)} MB`);
  if (dryRun) {
    console.log(`    (Dry run completed: no files were deleted)`);
  }
}

const isDryRun = process.argv.includes("--dry-run");

cleanupOrphanedUploads(isDryRun)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup error:", err);
    process.exit(1);
  });
