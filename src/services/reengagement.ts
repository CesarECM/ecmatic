import { sendTextMessage } from "@/lib/whatsapp/client";
import { registrarEnvioNurturing, yaRecibioSecuencia } from "@/services/nurturing";
import { obtenerLeadsParaNurturing } from "@/services/nurturing";
import { enviarEmailNurturing } from "@/lib/email/transaccional";
import { obtenerGatillosActivos, formatearGatillosParaPrompt } from "@/services/gatillos";
import { createServiceClient } from "@/lib/supabase/service";
import type { PipelineRuta } from "@/lib/supabase/types";

// S4.4 — Sustituye {nombre} y añade gatillos activos al final del mensaje
function aplicarPlantilla(plantilla: string, nombre: string | null, sufijo = ""): string {
  const base = plantilla.replace(/\{nombre\}/gi, nombre ?? "Candidato");
  return sufijo ? `${base}\n\n${sufijo}` : base;
}

// S4.4 — Guarda el mensaje saliente de nurturing en la tabla mensajes
async function registrarMensajeSaliente(leadId: string, contenido: string, canal: "whatsapp" | "email") {
  const supabase = createServiceClient();
  await supabase.from("mensajes").insert({
    lead_id: leadId,
    canal,
    direccion: "saliente",
    contenido,
    procesado_por_ia: false,
  }).then(({ error }) => {
    if (error) console.error("[reengagement] Error registrando mensaje:", error.message);
  });
}

// S4.4 — Envía un mensaje WhatsApp de re-engagement y registra el intento
async function enviarWaNurturing(
  leadId: string,
  telefono: string,
  nombre: string | null,
  secuenciaId: string,
  mensajePlantilla: string
): Promise<void> {
  const texto = aplicarPlantilla(mensajePlantilla, nombre);
  try {
    await sendTextMessage(telefono, texto);
    await registrarMensajeSaliente(leadId, texto, "whatsapp");
    await registrarEnvioNurturing(leadId, secuenciaId, "whatsapp", "enviado");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await registrarEnvioNurturing(leadId, secuenciaId, "whatsapp", "fallido", msg);
    console.error(`[reengagement] Fallo WA lead ${leadId}:`, msg);
  }
}

// S4.4 — Envía email de re-engagement y registra el intento
async function enviarEmailReengagement(
  leadId: string,
  email: string,
  nombre: string | null,
  secuenciaId: string,
  mensajePlantilla: string
): Promise<void> {
  try {
    await enviarEmailNurturing({ nombre, email }, mensajePlantilla);
    await registrarMensajeSaliente(leadId, aplicarPlantilla(mensajePlantilla, nombre), "email");
    await registrarEnvioNurturing(leadId, secuenciaId, "email", "enviado");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await registrarEnvioNurturing(leadId, secuenciaId, "email", "fallido", msg);
    console.error(`[reengagement] Fallo email lead ${leadId}:`, msg);
  }
}

// S4.4 — Punto de entrada: ejecuta el ciclo completo de re-engagement
// Diseñado para llamarse desde un cron job o endpoint protegido
export async function ejecutarCicloReengagement(): Promise<{
  procesados: number;
  enviados: number;
  omitidos: number;
}> {
  const leads = await obtenerLeadsParaNurturing();
  let enviados = 0;
  let omitidos = 0;

  // S6.4 — Obtener gatillos activos una vez para todo el ciclo
  const gatillosActivos = await obtenerGatillosActivos();
  const sufijoGatillos = gatillosActivos.length > 0
    ? gatillosActivos.map((g) => g.valor_actual).join(" · ")
    : "";

  for (const lead of leads) {
    const { id, nombre, telefono, email, secuencia_aplicable: sec } = lead;
    const ruta = (lead as { pipeline_ruta?: PipelineRuta }).pipeline_ruta;

    // Anti-spam: saltar si ya recibió esta secuencia en las últimas 24h
    const yaEnviado = await yaRecibioSecuencia(id, sec.id);
    if (yaEnviado) {
      omitidos++;
      continue;
    }

    // S6.4 — Filtrar gatillos por audiencia del lead
    const gatillosFiltrados = gatillosActivos.filter(
      (g) => g.audiencia_objetivo === "all" || g.audiencia_objetivo === ruta
    );
    const sufijo = gatillosFiltrados.length > 0
      ? gatillosFiltrados.map((g) => g.valor_actual).join(" · ")
      : "";

    const plantillaBase = sec.mensaje_fallback ?? "Hola {nombre}, ¿podemos ayudarte con tu certificación CONOCER?";
    const plantilla = aplicarPlantilla(plantillaBase, nombre, sufijo);
    void sufijoGatillos; // usado para referencia

    if (sec.canal === "whatsapp" && telefono) {
      await enviarWaNurturing(id, telefono, nombre, sec.id, plantilla);
      enviados++;
    } else if (sec.canal === "email" && email) {
      await enviarEmailReengagement(id, email, nombre, sec.id, plantilla);
      enviados++;
    } else {
      await registrarEnvioNurturing(id, sec.id, sec.canal, "omitido", "Sin dato de contacto");
      omitidos++;
    }
  }

  console.info(`[reengagement] Ciclo completo — procesados: ${leads.length}, enviados: ${enviados}, omitidos: ${omitidos}`);
  return { procesados: leads.length, enviados, omitidos };
}
