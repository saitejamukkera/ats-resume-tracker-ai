import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    // In dev, proxy /api/* to the backend (makes cookies same-origin for CSRF)
    if (!process.env.NEXT_PUBLIC_API_URL) {
      return [
        {
          source: "/api/:path*",
          destination: `${apiUrl}/api/:path*`,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
