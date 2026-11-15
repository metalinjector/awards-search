import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://awards.zonner.site";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/film?", "/imdb?", "/event?", "/person?"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
