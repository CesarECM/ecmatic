import { NextRequest, NextResponse } from "next/server";
import { logSistema } from "@/services/log-sistema";

// POST /api/log-evento — recibe errores de cliente y acciones admin con intención
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tipo_accion, fase, resultado, metadata } = body as Record<string, unknown>;

  if (typeof tipo_accion !== "string" || !tipo_accion) {
    return NextResponse.json({ error: "tipo_accion requerido" }, { status: 400 });
  }

  await logSistema({
    categoria:   "ui",
    tipoAccion:  tipo_accion,
    fase:        (fase as "error" | "warn" | "debug" | "ok") ?? "debug",
    resultado:   typeof resultado === "string" ? resultado : undefined,
    metadata:    (metadata as Record<string, unknown>) ?? {},
  });

  return NextResponse.json({ ok: true });
}
