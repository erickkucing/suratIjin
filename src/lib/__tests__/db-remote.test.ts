import { describe, it, expect } from "vitest";
import { parseDbUrl, buildDbUrl, testRemoteConnection } from "../db-remote";

describe("Remote Database Connection & Configuration Utilities", () => {
  it("should parse MySQL connection string into structured parameters", () => {
    const uri = "mysql://myuser:secret123@db.example.com:3307/school_db?ssl=true";
    const parsed = parseDbUrl(uri);

    expect(parsed.host).toBe("db.example.com");
    expect(parsed.port).toBe(3307);
    expect(parsed.user).toBe("myuser");
    expect(parsed.password).toBe("secret123");
    expect(parsed.database).toBe("school_db");
    expect(parsed.ssl).toBe(true);
  });

  it("should handle encoded passwords with special characters in URI", () => {
    const rawPass = "P@ssw#rd$2026!";
    const encodedPass = encodeURIComponent(rawPass);
    const uri = `mysql://admin:${encodedPass}@sql.remoteserver.net:3306/presensi`;

    const parsed = parseDbUrl(uri);
    expect(parsed.password).toBe(rawPass);
    expect(parsed.database).toBe("presensi");
  });

  it("should build valid connection URI from structured config", () => {
    const config = {
      host: "mariadb.cloud.com",
      port: 3306,
      user: "dbadmin",
      password: "strongpassword",
      database: "db_surat",
      ssl: false,
    };

    const built = buildDbUrl(config);
    expect(built).toBe("mysql://dbadmin:strongpassword@mariadb.cloud.com:3306/db_surat");
  });

  it("should include SSL query flag when ssl is enabled", () => {
    const config = {
      host: "aws-rds.amazonaws.com",
      port: 3306,
      user: "master",
      password: "pass",
      database: "prod_db",
      ssl: true,
    };

    const built = buildDbUrl(config);
    expect(built).toBe("mysql://master:pass@aws-rds.amazonaws.com:3306/prod_db?ssl=true");
  });

  it("should test connection against local database and return latency and version", async () => {
    const localUri = process.env.DATABASE_URL || "mysql://surat_user:surat_pass_2026@127.0.0.1:3306/db_suratizin";
    const config = parseDbUrl(localUri);

    const result = await testRemoteConnection(config);
    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.serverVersion).toBeDefined();
    expect(result.databaseName).toBeDefined();
  });

  it("should gracefully handle unreachable host with user-friendly error without throwing", async () => {
    const bogusConfig = {
      host: "127.0.0.1",
      port: 59999, // Unused port to trigger fast connection refusal
      user: "wrong",
      password: "bad",
      database: "nonexistent",
    };

    const result = await testRemoteConnection(bogusConfig);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorCode).toBe("ECONNREFUSED");
  });
});
