import { type NextRequest, NextResponse } from "next/server";
import { trackLead } from "@/services/utm";

// Endpoint público — llamado desde landing pages con UTM params.
// No requiere auth: es de captación, el teléfono es el identificador.
export async function POST(request: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { telefono, nombre, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, privacidad_aceptada } = body;

  if (!telefono || typeof telefono !== "string" || !/^\+?[0-9]{10,15}$/.test(telefono.trim())) {
    return NextResponse.json({ error: "telefono inválido" }, { status: 422 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? undefined;

  try {
    const resultado = await trackLead({
      telefono: telefono.trim(),
      nombre: nombre?.trim() || undefined,
      email: email?.trim() || undefined,
      privacidad_aceptada: privacidad_aceptada === "true",
      utm_source: utm_source || undefined,
      utm_medium: utm_medium || undefined,
      utm_campaign: utm_campaign || undefined,
      utm_content: utm_content || undefined,
      utm_term: utm_term || undefined,
      referrer: referrer || undefined,
      ip_address: ip,
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    console.error("[track/lead]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
