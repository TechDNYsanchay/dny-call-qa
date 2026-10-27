import type { MetadataRoute } from "next";
import { ICON_VERSION } from "@/lib/icon-version";

// Lets the app be installed on a phone or computer: its own icon, opening full screen.
// The icon addresses carry ICON_VERSION, so an already-installed app sees new icons and updates.
export default function manifest(): MetadataRoute.Manifest {
  const icon = (file: string) => `/icons/${file}?v=${ICON_VERSION}`;
  return {
    // A fixed identity, so a changed manifest updates the installed app instead of looking like a new one.
    id: "/",
    name: "DNY Sales Agent",
    short_name: "DNY Sales",
    description: "Daily QA scores, coaching and follow-ups for DNY Hospitality's sales calls",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1a1a19",
    theme_color: "#c23b2f",
    icons: [
      { src: icon("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
