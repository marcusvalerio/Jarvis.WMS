import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Drivers PostgreSQL usam APIs nativas do Node e nao devem ser empacotados.
  serverExternalPackages: ["pg", "@neondatabase/serverless", "ws"],
  typedRoutes: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
