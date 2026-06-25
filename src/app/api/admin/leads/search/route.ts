import { type NextRequest, NextResponse } from "next/server";
import { buscarLeads } from "@/services/leads-search";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  try {
    const results = await buscarLeads(q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[leads/search]", err);
    return NextResponse.json({ error: "Error en búsqueda" }, { status: 500 });
  }
}
