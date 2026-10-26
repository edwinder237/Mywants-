import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "my wants.",
    short_name: "my wants.",
    description: "Want it. Earn it. Enjoy it. A private wishlist where each want unlocks after three things you choose.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f6f1",
    theme_color: "#f9f6f1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
