import { type NextRequest, NextResponse } from "next/server";
import { procesarCola } from "@/services/mensajes-cola";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await procesarCola();
  console.log("[procesar-cola]", resultado);
  return NextResponse.json(resultado);
}
