#!/usr/bin/env tsx
import { parseDbUrl, testRemoteConnection } from "../src/lib/db-remote";
import { runRemoteMigration } from "../src/lib/db-migration-runner";

async function main() {
  console.log("=================================================");
  console.log("   SURAT IJIN - REMOTE DATABASE MIGRATION CLI    ");
  console.log("=================================================\n");

  const args = process.argv.slice(2);
  let urlArg = "";
  let copyData = false;
  let dropTables = false;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log("Penggunaan:");
      console.log('  npm run db:migrate-remote -- --url="mysql://user:pass@host:3306/dbname" [--copy-data] [--drop]');
      console.log("\nOpsi:");
      console.log("  --url=<uri>      MySQL Connection URI target");
      console.log("  --copy-data, -c  Salin data lokal ke database remote");
      console.log("  --drop, -d       Hapus tabel lama jika sudah ada (DROP TABLES IF EXISTS)");
      console.log("  --help, -h       Tampilkan bantuan");
      process.exit(0);
    } else if (arg.startsWith("--url=")) {
      urlArg = arg.replace("--url=", "").trim();
    } else if (arg === "--copy-data" || arg === "-c") {
      copyData = true;
    } else if (arg === "--drop" || arg === "-d") {
      dropTables = true;
    }
  }

  const targetUrl = urlArg || process.env.DATABASE_URL;

  if (!targetUrl) {
    console.error("❌ Galat: URL database target tidak disediakan.");
    console.log("Penggunaan:");
    console.log("  npx tsx scripts/migrate-remote.ts --url=\"mysql://user:pass@host:3306/dbname\" [--copy-data] [--drop]");
    process.exit(1);
  }

  const config = parseDbUrl(targetUrl);
  console.log(`Target Host: ${config.host}:${config.port}`);
  console.log(`Database   : ${config.database}`);
  console.log(`Username   : ${config.user}`);
  console.log(`Salin Data : ${copyData ? "Ya" : "Tidak"}\n`);

  console.log("1. Menguji koneksi ke database target...");
  const testRes = await testRemoteConnection(config);
  if (!testRes.success) {
    console.error(`❌ Koneksi gagal: ${testRes.error}`);
    process.exit(1);
  }

  console.log(`✓ Terhubung! Latensi: ${testRes.latencyMs}ms | MySQL: ${testRes.serverVersion}\n`);

  console.log("2. Menjalankan migrasi skema...");
  const migrationRes = await runRemoteMigration(config, {
    copyExistingData: copyData,
    dropExistingTables: dropTables,
  });

  for (const log of migrationRes.logs) {
    console.log(`  ${log}`);
  }

  if (!migrationRes.success) {
    console.error(`\n❌ Migrasi gagal: ${migrationRes.error}`);
    process.exit(1);
  }

  console.log("\n=================================================");
  console.log("   MIGRASI DATABASE REMOTE SELESAI SUKSES 100%   ");
  console.log("=================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
