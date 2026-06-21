// S27.5/S27.6 — Diagnóstico WhatsApp: GET = estado del número, POST = mensaje de prueba
import { NextResponse } from "next/server";
import { obtenerDiagnosticoWA } from "@/lib/whatsapp/diagnostico";
import { sendTextMessage } from "@/lib/whatsapp/client";

export async function GET() {
  try {
    const diagnostico = await obtenerDiagnosticoWA();
    return NextResponse.json(diagnostico);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: envía un mensaje de prueba al número de ADMIN_WHATSAPP
export async function POST() {
  const adminWA = process.env.ADMIN_WHATSAPP;
  if (!adminWA) {
    return NextResponse.json({ error: "ADMIN_WHATSAPP no configurado" }, { status: 400 });
  }
  try {
    await sendTextMessage(adminWA, "✅ ECMatic — prueba de conexión WhatsApp exitosa.");
    return NextResponse.json({ ok: true, destino: adminWA });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
