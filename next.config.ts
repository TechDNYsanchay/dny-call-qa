import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The scoring API serves the guide from the repo, so the file must ship with the function.
  outputFileTracingIncludes: { "/api/scoring/[action]": ["./scoring/**/*.md"] },
  // Call sheet PDFs are uploaded through a server action (Vercel's request limit is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
