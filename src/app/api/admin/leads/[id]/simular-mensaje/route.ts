import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { procesarConversacion } from "@/services/conversacion";
import { logSistema } from "@/services/log-sistema";

const MSG_SELECT = "id, canal, direccion, contenido, intencion_clasificada, interceptado, created_at";

// POST { contenido } — simula un mensaje entrante del lead en modo depuración.
// procesarConversacion guarda el mensaje y la respuesta IA (interceptada, no va a WA real).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const modo = await obtenerModo();
  if (modo !== "depuracion") {
    return NextResponse.json({ error: "Solo disponible en modo depuración" }, { status: 403 });
  }

  const { id } = await params;

  let contenido: string;
  try {
    const body = await req.json();
    contenido = (body.contenido ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!contenido) return NextResponse.json({ error: "Contenido vacío" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, telefono")
    .eq("id", id)
    .single();

  if (!lead?.telefono) return NextResponse.json({ error: "Lead sin teléfono" }, { status: 400 });

  void logSistema({ categoria: "ui", tipoAccion: "leads.simular-mensaje", fase: "inicio", leadId: id });
  try {
    await procesarConversacion(lead.telefono, [contenido]);

    // Los 2 más recientes: [0]=saliente IA (interceptado), [1]=entrante simulado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ultimos } = await (supabase as any)
      .from("mensajes")
      .select(MSG_SELECT)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(2);

    const [mensajeSaliente, mensajeEntrante] = (ultimos ?? []);
    void logSistema({ categoria: "ui", tipoAccion: "leads.simular-mensaje", fase: "ok", leadId: id });
    return NextResponse.json({ mensajeEntrante: mensajeEntrante ?? null, mensajeSaliente: mensajeSaliente ?? null });
  } catch (err) {
    void logSistema({ categoria: "ui", tipoAccion: "leads.simular-mensaje", fase: "error", leadId: id, resultado: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
