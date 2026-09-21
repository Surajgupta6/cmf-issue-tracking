import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy /api requests to the backend during development
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:5000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
