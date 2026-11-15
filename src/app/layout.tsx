import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://awards.zonner.site"),
  applicationName: "Кинонаграды",
  title: {
    default: "Кинонаграды — победители и номинанты",
    template: "%s — Кинонаграды",
  },
  description:
    "Ищите награды фильмов и церемоний по Кинопоиску, IMDb и TMDB. Победители, номинанты, поиск и экспорт в XLSX, Markdown и HTML.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: "Кинонаграды",
    title: "Кинонаграды — победители и номинанты",
    description: "Награды фильмов и церемоний по Кинопоиску, IMDb и TMDB.",
  },
  twitter: {
    card: "summary",
    title: "Кинонаграды — победители и номинанты",
    description: "Награды фильмов и церемоний по Кинопоиску, IMDb и TMDB.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
