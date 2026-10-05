import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker — produces a self-contained
  // bundle in .next/standalone that doesn't need node_modules at runtime.
  // This reduces the Docker image size dramatically (~300MB → ~80MB).
  output: "standalone",

  // In Docker: backend is at the internal service name, not localhost.
  // BACKEND_URL is injected via docker-compose environment.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:5000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
