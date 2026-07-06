// MPS-26 S94 — Haiku genera el copy del follow-up a partir del ángulo seleccionado.
// Las instrucciones de ángulo llegan como parámetro externo (ya no hardcodeadas aquí).
// MPS-15: inyecta historial de conversación; tool use permite extenderlo si es insuficiente.
import { callClaudeIA } from "./client";
import { logSistema } from "@/services/log-sistema";
import { obtenerHistorial } from "@/services/mensajes";
import type { AnguloSeleccionado } from "./seleccionar-angulo";
import type { TipoSeguimiento } from "@/services/seguimiento-lead";

export interface ContextoFollowup {
  nombre: string | null;
  tipo: TipoSeguimiento;
  nivel: number;
  angulo: AnguloSeleccionado;
  horarioPrometido?: string | null;
  gatilloSnapshot?: string | null;
  linkPago?: string | null;
  linkApartado?: string | null;
  historial?: string | null;
}

function limpiarSalida(texto: string): string {
  return texto
    .replace(/^\s*\[.+?\]\s*\n?/gm, "")
    .replace(/^\s*\(.+?\)\s*\n/gm, "")
    .replace(/^(aquí (está|te (dejo|presento))|mensaje(:|$)|seguimiento:|recordatorio:).*/gim, "")
    .replace(/^\s*nota:.*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function generarFollowupGHL(
  ctx: ContextoFollowup,
  meta?: { leadId?: string; traceId?: string },
): Promise<string> {
  const partes: string[] = [];
  if (ctx.nombre)           partes.push(`Nombre del lead: ${ctx.nombre}`);
  if (ctx.horarioPrometido) partes.push(`Hora que el lead prometió pagar: ${ctx.horarioPrometido}`);
  if (ctx.gatilloSnapshot)  partes.push(`Gatillo de urgencia activo: ${ctx.gatilloSnapshot}`);
  if (ctx.tipo === "payment") {
    if (ctx.linkPago)     partes.push(`Link de pago principal: ${ctx.linkPago}`);
    if (ctx.linkApartado) partes.push(`Link de apartado: ${ctx.linkApartado}`);
  }

  const contextoTexto = partes.length > 0 ? partes.join("\n") : "(sin contexto adicional)";

  const linksDisponibles =
    ctx.tipo === "payment" && (ctx.linkPago || ctx.linkApartado)
      ? [
          "\nLINKS DISPONIBLES — inclúyelos cuando refuercen el mensaje:",
          ctx.linkPago     ? `• Pago completo: ${ctx.linkPago}` : "",
          ctx.linkApartado ? `• Apartar lugar: ${ctx.linkApartado}` : "",
        ].filter(Boolean).join("\n")
      : "";

  const historialLinea = ctx.historial
    ? `\nHISTORIAL RECIENTE DE LA CONVERSACIÓN:\n${ctx.historial}\n\nUsa este historial para personalizar tu mensaje: retoma el hilo, evita repetir lo que ya se dijo y adapta el tono al punto exacto donde quedó la conversación.`
    : "\nHISTORIAL RECIENTE: (sin conversación previa registrada)";

  const system = `Eres la IA de ventas de Centro ECM (ceecm.mx), centro de certificación CONOCER en México.
Escribes mensajes de seguimiento para WhatsApp. Estilo: cálido, profesional, conversacional.
Reglas: sin saludos formales de correo, sin emojis de negocios, máximo 3 oraciones salvo que se indique lo contrario.
Siempre en español mexicano natural.
${historialLinea}

TAREA — ÁNGULO: ${ctx.angulo.nombre}
${ctx.angulo.descripcion}${linksDisponibles}

FORMATO DE SALIDA — OBLIGATORIO:
Responde ÚNICAMENTE con el texto del mensaje listo para enviar al lead. Sin notas internas, sin explicaciones, sin encabezados como "Aquí está el mensaje:", sin etiquetas entre corchetes, sin comentarios sobre lo que hiciste. El texto que escribas se enviará directamente al lead.`;

  const userContent = `CONTEXTO:\n${contextoTexto}`;

  const HISTORIAL_CAP = 30;

  const tool = {
    name: "solicitar_historial_adicional",
    description:
      "Solicita más mensajes del historial si el contexto actual es insuficiente para personalizar el follow-up. Úsalo solo cuando necesites entender un punto específico que el lead mencionó y que no aparece en los mensajes disponibles.",
    input_schema: {
      type: "object" as const,
      properties: {
        cantidad: {
          type: "integer",
          description: "Mensajes adicionales a cargar (entre 5 y 20)",
          minimum: 5,
          maximum: 20,
        },
      },
      required: ["cantidad"],
    },
  };

  try {
    const resp1 = await callClaudeIA(
      "GENERAR_FOLLOWUP_GHL",
      {
        max_tokens: 250,
        system,
        messages: [{ role: "user", content: userContent }],
        tools: [tool],
        tool_choice: { type: "auto" },
      },
      meta,
    );

    if (resp1.stop_reason === "end_turn") {
      const block = resp1.content.find(
        (b) => b.type === "text",
      ) as { type: "text"; text: string } | undefined;
      return limpiarSalida(block?.text ?? "");
    }

    if (resp1.stop_reason === "tool_use" && meta?.leadId) {
      const toolBlock = resp1.content.find(
        (b) => b.type === "tool_use",
      ) as { type: "tool_use"; id: string; input: { cantidad?: number } } | undefined;

      if (toolBlock) {
        const extra          = Math.min(toolBlock.input.cantidad ?? 10, 20);
        const limiteActual   = ctx.historial?.split("\n").length ?? 0;
        const limiteExtendido = Math.min(limiteActual + extra, HISTORIAL_CAP);

        void logSistema({
          categoria: "ia", tipoAccion: "followup.historial_extension", fase: "ok",
          leadId: meta.leadId, traceId: meta.traceId,
          resultado: `+${extra} msgs → cap ${limiteExtendido}`,
          metadata: { tipo: ctx.tipo, nivel: ctx.nivel, angulo: ctx.angulo.codigo },
        });

        const historialExtendido = await obtenerHistorial(meta.leadId, limiteExtendido).catch(() => "");

        const resp2 = await callClaudeIA(
          "GENERAR_FOLLOWUP_GHL_EXTENDED",
          {
            max_tokens: 250,
            system,
            messages: [
              { role: "user", content: userContent },
              { role: "assistant", content: resp1.content },
              {
                role: "user",
                content: [{
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: historialExtendido || "(sin mensajes adicionales disponibles)",
                }],
              },
            ],
          },
          meta,
        );

        const block2 = resp2.content.find(
          (b) => b.type === "text",
        ) as { type: "text"; text: string } | undefined;
        return limpiarSalida(block2?.text ?? "");
      }
    }

    const fallback = resp1.content.find(
      (b) => b.type === "text",
    ) as { type: "text"; text: string } | undefined;
    return limpiarSalida(fallback?.text ?? "");
  } catch {
    return "";
  }
}

// ── MPS-31: Respuesta conversacional (sin ángulo fijo, foco en el hilo real) ──

export interface ContextoRespuestaConv {
  nombre: string | null;
  tipo: TipoSeguimiento;
  nivel: number;
  historial: string | null;
  gatilloSnapshot?: string | null;
  linkPago?: string | null;
  linkApartado?: string | null;
}

export async function generarRespuestaConversacional(
  ctx: ContextoRespuestaConv,
  meta?: { leadId?: string; traceId?: string },
): Promise<string> {
  const historialLinea = ctx.historial
    ? `HISTORIAL RECIENTE:\n${ctx.historial}`
    : "HISTORIAL: (sin conversación previa registrada)";

  const linksDisponibles =
    ctx.tipo === "payment" && (ctx.linkPago || ctx.linkApartado)
      ? [
          "\nLINKS DISPONIBLES (inclúyelos si refuerzan el mensaje):",
          ctx.linkPago     ? `• Pago completo: ${ctx.linkPago}`     : "",
          ctx.linkApartado ? `• Apartar lugar: ${ctx.linkApartado}` : "",
        ].filter(Boolean).join("\n")
      : "";

  const system = `Eres la IA de ventas de Centro ECM (ceecm.mx), centro de certificación CONOCER en México.
Escribes mensajes de seguimiento para WhatsApp. Estilo: cálido, profesional, conversacional.
Reglas: sin saludos formales de correo, sin emojis de negocios, máximo 4 oraciones. Español mexicano natural.

${historialLinea}${linksDisponibles}
${ctx.gatilloSnapshot ? `\nGatillo de urgencia activo: ${ctx.gatilloSnapshot}` : ""}

Tu tarea: escribe el siguiente mensaje de seguimiento (tipo ${ctx.tipo}, intento ${ctx.nivel}).
El mensaje debe:
- Retomar el hilo exacto de la conversación (referencia algo específico que dijo el lead)
- Ser natural y personalizado, no genérico ni formulaico
- Empujar suavemente hacia el siguiente paso

FORMATO DE SALIDA — OBLIGATORIO:
Responde ÚNICAMENTE con el texto del mensaje listo para enviar. Sin notas, sin encabezados.`;

  const userContent = ctx.nombre ? `Nombre del lead: ${ctx.nombre}` : "(lead sin nombre registrado)";

  try {
    const resp = await callClaudeIA(
      "GENERAR_RESPUESTA_CONV",
      {
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: userContent }],
      },
      meta,
    );
    const block = resp.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    return limpiarSalida(block?.text ?? "");
  } catch {
    return "";
  }
}
