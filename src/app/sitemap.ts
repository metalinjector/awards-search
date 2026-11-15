import type { MetadataRoute } from "next";
import { listAllReports } from "@/lib/report-service";

// The database is intentionally unavailable during an image build. Generate
// the map at runtime so cached reports are never omitted from a build-time file.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://awards.zonner.site";
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/imdb`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tmdb`, changeFrequency: "monthly", priority: 0.6 },
  ];
  try {
    const reports = await listAllReports();
    return [
      ...staticPages,
      ...reports.map((report) => ({
        url: `${base}/report/${report.awardSlug}/${report.year}`,
        lastModified: report.fetchedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticPages;
  }
}
