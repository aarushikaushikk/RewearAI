import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Stop `next dev` from generating AGENTS.md / AI agent instruction files.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
