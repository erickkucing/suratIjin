import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalize origin string to match Next.js 15 Server Actions origin validation.
 * Strips protocols (http://, https://), paths, trailing slashes, and default web ports (:80, :443).
 * Retains non-standard ports (e.g. :3000, :3001, :8443) and wildcards (e.g. *.domain.com).
 */
function normalizeOrigin(origin) {
  if (!origin || typeof origin !== "string") return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const hostOnly = withoutProtocol.replace(/\/.*$/, "").trim();
  const cleanHost = hostOnly.replace(/:(?:80|443)$/, "").trim();
  return cleanHost || null;
}

const customOrigins = new Set();

const rawEnvOrigins = (process.env.ALLOWED_ORIGINS || "").split(",");
for (const entry of rawEnvOrigins) {
  const normalized = normalizeOrigin(entry);
  if (normalized) {
    customOrigins.add(normalized);
  }
}

if (process.env.NEXT_PUBLIC_APP_URL) {
  const normalizedAppUrl = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (normalizedAppUrl) {
    customOrigins.add(normalizedAppUrl);
  }
}

const baseAllowedOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  "localhost:3001",
  "127.0.0.1:3001",
  "192.168.70.9:3000",
  "192.168.70.9",
  "0.0.0.0:3000",
];

const allowedOrigins = Array.from(
  new Set([...baseAllowedOrigins, ...customOrigins])
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
      allowedOrigins,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
