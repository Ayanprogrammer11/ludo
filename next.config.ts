import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  experimental: {
    instantNavigationDevToolsToggle: true,
  },
};

export default nextConfig;
