import type { MetadataRoute } from "next";

// Lets the app be installed on a phone or computer: its own icon, opening full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DNY Sales Agent",
    short_name: "DNY Sales",
    description: "Daily QA scores, coaching and follow-ups for DNY Hospitality's sales calls",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1a1a19",
    theme_color: "#c23b2f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
