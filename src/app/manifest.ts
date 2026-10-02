import type { MetadataRoute } from "next";

// Lets the site be installed on an iPhone home screen (Share → Add to Home Screen).
// It opens on the admin dashboard; clients who install it land on their account.
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_STUDIO_NAME ?? "Studio";
  return {
    name,
    short_name: name,
    start_url: "/admin",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#2f6f5e",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
