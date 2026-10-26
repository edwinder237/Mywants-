import type { NextConfig } from "next";

// Static export: the whole app is client-side and can be hosted on any free
// static host. A postbuild step writes the offline service worker into `out/`.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
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
