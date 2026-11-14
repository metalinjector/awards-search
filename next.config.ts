import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image is built as a self-contained server (.next/standalone);
  // a plain `npm run build && npm start` keeps the regular output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
};

export default nextConfig;
