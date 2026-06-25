import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { obtenerToquesPendientes, avanzarToque } from "@/services/lead-protocolo";
import { enviarRespuestaWhatsApp } from "@/services/whatsapp-sender";
import { logSistema } from "@/services/log-sistema";

export type ResultadoEjecucion = {
  ejecutados: number;
  enAprobacion: number;
  tareas: number;
  errores: number;
  omitidos: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

function sustituirVariables(
  template: string,
  vars: { nombre: string | null; link: string | null }
): string {
  return template
    .replace(/\[Nombre\]/gi, vars.nombre ?? "ahí")
    .replace(/\[Vendedor\]/gi, "Centro ECM")
    .replace(/\[LINK\]/gi, vars.link ?? "[link de agendado pendiente]");
}

export async function ejecutarProtocolosPendientes(
  opts?: { soloLeadId?: string; forzarEnvio?: boolean }
): Promise<ResultadoEjecucion> {
  const traceId = crypto.randomUUID();
  const resultado: ResultadoEjecucion = { ejecutados: 0, enAprobacion: 0, tareas: 0, errores: 0, omitidos: 0 };

  let [pendientes, modo] = await Promise.all([obtenerToquesPendientes(), obtenerModo()]);
  if (opts?.soloLeadId) pendientes = pendientes.filter(p => p.lead.id === opts.soloLeadId);
  const enviarDirecto = opts?.forzarEnvio === true;
  if (!pendientes.length) return resultado;

  void logSistema({
    categoria: "cron", tipoAccion: "cron.protocolos-ejecutar", fase: "inicio", traceId,
    resultado: `${pendientes.length} toques pendientes | modo: ${modo}`,
  });

  for (const item of pendientes) {
    const { leadProtocolo: lp, lead, toque, protocolo } = item;
    const ahora = new Date().toISOString();

    try {
      const { data: reg } = await db()
        .from("lead_toque_registro")
        .insert({
          lead_id: lead.id,
          protocolo_id: protocolo.id,
          toque_id: toque.id,
          programado_at: lp.proximo_toque_at ?? ahora,
          resultado: "pendiente",
        })
        .select("id")
        .single();
      const registroId: string | null = reg?.id ?? null;

      if (toque.canal === "llamada") {
        if (lead.vendedor_id) {
          const motivo = [
            `[${protocolo.nombre}] ${toque.nombre}`,
            toque.objetivo ? `Objetivo: ${toque.objetivo}` : "",
            toque.guion_principal ? `\nGuión si contesta:\n${toque.guion_principal}` : "",
            toque.guion_alternativo ? `\nSi NO contesta:\n${toque.guion_alternativo}` : "",
            toque.nota_interna ? `\nNota: ${toque.nota_interna}` : "",
          ].filter(Boolean).join("\n");

          await db().from("lead_tarea_activa").upsert(
            { lead_id: lead.id, tipo: "seguimiento", motivo, vence_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString() },
            { onConflict: "lead_id" }
          );
        }
        if (registroId) {
          await db().from("lead_toque_registro")
            .update({ resultado: "pendiente", ejecutado_at: ahora })
            .eq("id", registroId);
        }
        resultado.tareas++;

      } else if (toque.canal === "whatsapp") {
        if (!lead.telefono) { resultado.omitidos++; continue; }

        const mensaje = sustituirVariables(toque.guion_principal ?? "", {
          nombre: lead.nombre,
          link: protocolo.link_agendado,
        });

        if (modo === "depuracion" && !enviarDirecto) {
          const { data: cola } = await db()
            .from("mensajes_cola_aprobacion")
            .insert({
              lead_id: lead.id,
              telefono: lead.telefono,
              respuesta: mensaje,
              bloques: [mensaje],
            })
            .select("id")
            .single();

          if (registroId) {
            await db().from("lead_toque_registro")
              .update({ resultado: "en_aprobacion", ejecutado_at: ahora, mensaje_cola_id: cola?.id ?? null })
              .eq("id", registroId);
          }
          resultado.enAprobacion++;
        } else {
          await enviarRespuestaWhatsApp(lead.telefono, [mensaje]);
          if (registroId) {
            await db().from("lead_toque_registro")
              .update({ resultado: "enviado", ejecutado_at: ahora })
              .eq("id", registroId);
          }
          resultado.ejecutados++;
        }
      } else {
        if (registroId) {
          await db().from("lead_toque_registro")
            .update({ resultado: "pendiente", ejecutado_at: ahora })
            .eq("id", registroId);
        }
        resultado.omitidos++;
      }

      await avanzarToque(lp.id, lp.protocolo_id, lp.toque_actual);
    } catch (err) {
      console.error(`[ejecutor-protocolos] error lead ${lead.id}:`, err);
      resultado.errores++;
    }
  }

  void logSistema({
    categoria: "cron", tipoAccion: "cron.protocolos-ejecutar", fase: "ok", traceId,
    resultado: JSON.stringify(resultado), metadata: resultado,
  });

  return resultado;
}
