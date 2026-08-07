import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
};
export default nextConfig;
