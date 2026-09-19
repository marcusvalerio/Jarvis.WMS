import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["node:sqlite"],
  typedRoutes: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
