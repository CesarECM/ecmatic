import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";

const MAX_INTENTOS = 3;
const LOTE = 50;

export async function encolarMensaje(telefono: string, contenido: string): Promise<void> {
  const db = createServiceClient();
  await db.from("mensajes_cola").insert({ telefono, contenido });
}

export async function procesarCola(): Promise<{ procesados: number; fallidos: number }> {
  const db = createServiceClient();

  const { data: pendientes } = await db
    .from("mensajes_cola")
    .select("*")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true })
    .limit(LOTE);

  if (!pendientes?.length) return { procesados: 0, fallidos: 0 };

  let procesados = 0;
  let fallidos = 0;

  for (const msg of pendientes) {
    try {
      await sendTextMessage(msg.telefono, msg.contenido);
      await db
        .from("mensajes_cola")
        .update({ estado: "enviado" })
        .eq("id", msg.id);
      procesados++;
    } catch (err) {
      const nuevosIntentos = msg.intentos + 1;
      const estado = nuevosIntentos >= MAX_INTENTOS ? "fallido" : "pendiente";
      await db
        .from("mensajes_cola")
        .update({ intentos: nuevosIntentos, estado, error_detalle: String(err) })
        .eq("id", msg.id);
      if (estado === "fallido") fallidos++;
    }
  }

  return { procesados, fallidos };
}
