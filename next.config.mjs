import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const customOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "192.168.70.9:3000",
        "192.168.70.9",
        "0.0.0.0:3000",
        ...customOrigins,
      ],
    },
  },
};

export default nextConfig;
