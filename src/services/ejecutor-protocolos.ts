import { createServiceClient } from "@/lib/supabase/service";
import { obtenerModo } from "@/services/sistema";
import { obtenerToquesPendientes, avanzarToque } from "@/services/lead-protocolo";
import { enviarRespuestaWhatsApp } from "@/services/whatsapp-sender";
import { guardarMensaje } from "@/services/mensajes";
import { logSistema } from "@/services/log-sistema";
import {
  crearLlamadaPendienteProtocolo,
  tieneLlamadaPendienteParaToque,
} from "@/services/llamadas";

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
    resultado: `${pendientes.length} toques pendientes | modo: ${modo}${enviarDirecto ? " | forzarEnvio:true" : ""}`,
    metadata: { soloLeadId: opts?.soloLeadId ?? null, enviarDirecto },
  });

  for (const item of pendientes) {
    const { leadProtocolo: lp, lead, toque, protocolo } = item;
    const ahora = new Date().toISOString();

    try {
      void logSistema({
        categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "inicio", traceId, leadId: lead.id,
        resultado: `Toque ${toque.orden} [${toque.canal}] — ${protocolo.nombre}`,
        metadata: { toque_id: toque.id, toque_orden: toque.orden, canal: toque.canal, protocolo_id: protocolo.id },
      });

      // ── Canal: llamada ────────────────────────────────────────────────────
      // El protocolo NO avanza aquí. Queda bloqueado hasta que el vendedor
      // complete la llamada desde su panel y el resultado quede registrado.
      if (toque.canal === "llamada") {
        // Evitar crear llamadas duplicadas si el cron vuelve a encontrar este toque
        const yaPendiente = await tieneLlamadaPendienteParaToque(lp.id, toque.id);
        if (yaPendiente) {
          // Extiende proximo_toque_at para reducir ejecuciones innecesarias del cron
          await db().from("lead_protocolo").update({
            proximo_toque_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          }).eq("id", lp.id);
          void logSistema({
            categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "debug", traceId, leadId: lead.id,
            resultado: `Llamada pendiente ya existe para toque ${toque.orden} — proximo_toque_at extendido 24h`,
          });
          resultado.omitidos++;
          continue;
        }

        if (!lead.vendedor_id) {
          void logSistema({
            categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "warn", traceId, leadId: lead.id,
            resultado: "Lead sin vendedor asignado — llamada pendiente no creada",
          });
          resultado.omitidos++;
          continue;
        }

        // Crea el registro de toque
        const { data: reg } = await db()
          .from("lead_toque_registro")
          .insert({
            lead_id:       lead.id,
            protocolo_id:  protocolo.id,
            toque_id:      toque.id,
            programado_at: lp.proximo_toque_at ?? ahora,
            resultado:     "pendiente",
          })
          .select("id")
          .single();
        const registroId: string | null = reg?.id ?? null;

        // Deriva objetivo para la llamada: busca la palabra "cierre" en el texto libre del toque
        const objetivoLlamada = (toque.objetivo ?? "").toLowerCase().includes("cierre")
          ? "cierre" as const
          : "avance" as const;

        await crearLlamadaPendienteProtocolo({
          leadId:          lead.id,
          vendedorId:      lead.vendedor_id,
          toqueId:         toque.id,
          leadProtocoloId: lp.id,
          toqueRegistroId: registroId,
          protocoloId:     protocolo.id,
          toqueOrden:      toque.orden,
          objetivo:        objetivoLlamada,
        });

        // Extiende proximo_toque_at para que el cron no vuelva a procesar este toque
        await db().from("lead_protocolo").update({
          proximo_toque_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        }).eq("id", lp.id);

        void logSistema({
          categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "ok", traceId, leadId: lead.id,
          resultado: `Llamada pendiente creada para vendedor ${lead.vendedor_id} — toque #${toque.orden}`,
          metadata: { toque_id: toque.id, registro_id: registroId },
        });
        resultado.tareas++;
        continue; // El protocolo avanzará cuando el vendedor registre el resultado
      }

      // ── Canal: whatsapp ───────────────────────────────────────────────────
      const { data: reg } = await db()
        .from("lead_toque_registro")
        .insert({
          lead_id:       lead.id,
          protocolo_id:  protocolo.id,
          toque_id:      toque.id,
          programado_at: lp.proximo_toque_at ?? ahora,
          resultado:     "pendiente",
        })
        .select("id")
        .single();
      const registroId: string | null = reg?.id ?? null;

      if (toque.canal === "whatsapp") {
        if (!lead.telefono) {
          void logSistema({
            categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "warn", traceId, leadId: lead.id,
            resultado: "Lead sin teléfono — omitido",
          });
          resultado.omitidos++;
          continue;
        }

        const mensaje = sustituirVariables(toque.guion_principal ?? "", {
          nombre: lead.nombre,
          link:   protocolo.link_agendado,
        });

        if (modo === "depuracion" && !enviarDirecto) {
          const { data: cola } = await db()
            .from("mensajes_cola_aprobacion")
            .insert({
              lead_id:  lead.id,
              telefono: lead.telefono,
              respuesta: mensaje,
              bloques:  [mensaje],
            })
            .select("id")
            .single();

          if (registroId) {
            await db().from("lead_toque_registro")
              .update({ resultado: "en_aprobacion", ejecutado_at: ahora, mensaje_cola_id: cola?.id ?? null })
              .eq("id", registroId);
          }
          void logSistema({
            categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "debug", traceId, leadId: lead.id,
            resultado: `WA → cola_aprobacion (modo: ${modo})`,
            metadata: { cola_id: cola?.id ?? null },
          });
          resultado.enAprobacion++;
        } else {
          await enviarRespuestaWhatsApp(lead.telefono, [mensaje], { forzarEnvio: enviarDirecto });
          const msgGuardado = await guardarMensaje({ leadId: lead.id, contenido: mensaje, direccion: "saliente" });
          void logSistema({
            categoria: "cron", tipoAccion: "cron.protocolos-toque",
            fase: msgGuardado ? "debug" : "warn",
            traceId, leadId: lead.id,
            resultado: msgGuardado
              ? `Mensaje persistido en DB — id: ${(msgGuardado as { id: string }).id}`
              : "guardarMensaje retornó null — el mensaje NO aparecerá en el perfil",
          });
          if (registroId) {
            await db().from("lead_toque_registro")
              .update({ resultado: "enviado", ejecutado_at: ahora })
              .eq("id", registroId);
          }
          void logSistema({
            categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "ok", traceId, leadId: lead.id,
            resultado: `WA enviado directo | forzarEnvio:${enviarDirecto}`,
          });
          resultado.ejecutados++;
        }
      } else {
        // Canal no instrumentado (email, meet, etc.)
        if (registroId) {
          await db().from("lead_toque_registro")
            .update({ resultado: "pendiente", ejecutado_at: ahora })
            .eq("id", registroId);
        }
        void logSistema({
          categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "warn", traceId, leadId: lead.id,
          resultado: `Canal "${toque.canal}" no instrumentado — toque omitido`,
        });
        resultado.omitidos++;
      }

      await avanzarToque(lp.id, lp.protocolo_id, lp.toque_actual);
      void logSistema({
        categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "debug", traceId, leadId: lead.id,
        resultado: `Avanzado toque ${toque.orden} → ${toque.orden + 1}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void logSistema({
        categoria: "cron", tipoAccion: "cron.protocolos-toque", fase: "error", traceId, leadId: lead.id,
        resultado: msg,
      });
      resultado.errores++;
    }
  }

  void logSistema({
    categoria: "cron", tipoAccion: "cron.protocolos-ejecutar", fase: "ok", traceId,
    resultado: JSON.stringify(resultado), metadata: resultado,
  });

  return resultado;
}
