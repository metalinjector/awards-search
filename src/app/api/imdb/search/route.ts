import { NextRequest, NextResponse } from "next/server";
import { searchImdbTitles } from "@/lib/imdb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название (минимум 2 символа)" },
      { status: 400 },
    );
  }
  try {
    const results = await searchImdbTitles(q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "IMDb не отвечает, попробуйте ещё раз" },
      { status: 502 },
    );
  }
}
