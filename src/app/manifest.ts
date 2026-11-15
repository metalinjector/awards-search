import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Кинонаграды",
    short_name: "Награды",
    description: "Победители и номинанты кинопремий",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#f59e0b",
    lang: "ru",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
