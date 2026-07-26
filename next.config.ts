import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Azure Container Apps runs the production image from Next's traced server
  // output. This keeps the runtime image small and self-contained.
  output: "standalone",
};

export default nextConfig;
