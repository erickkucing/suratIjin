import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    env: {
      DATABASE_URL: "mysql://surat_user:surat_pass_2026@127.0.0.1:3306/db_suratizin_test",
      NODE_ENV: "test",
    },
  },
});
