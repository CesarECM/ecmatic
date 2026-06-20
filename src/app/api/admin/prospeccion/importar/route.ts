import { NextRequest, NextResponse } from "next/server";
import { importarCSV } from "@/services/importador-prospeccion";
import type { FilaCSV } from "@/services/importador-prospeccion";

export async function POST(req: NextRequest) {
  try {
    const { filas } = await req.json() as { filas: FilaCSV[] };
    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: "filas requeridas" }, { status: 400 });
    }
    if (filas.length > 500) {
      return NextResponse.json({ error: "Máximo 500 filas por importación" }, { status: 400 });
    }
    const resultado = await importarCSV(filas);
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[prospeccion/importar]", error);
    return NextResponse.json({ error: "Error interno al importar" }, { status: 500 });
  }
}
