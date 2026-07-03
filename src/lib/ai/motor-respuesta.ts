import { callClaudeIA } from "./client";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarUso, sugerirRecursoDesdeQuery } from "@/services/conocimiento";
import { registrarSenales } from "@/services/kbi/senales";
import { obtenerGatillosActivos } from "@/services/gatillos";
import { registrarUsoIA } from "@/services/alertas-ia";
import { inferirRespuestaMatriz } from "@/services/matriz-ia";
import { obtenerIdentidad } from "@/services/identidad-marca";
import { seleccionarPagoServicio } from "@/lib/ai/selector-pago";
import { listarPagosServicio } from "@/services/servicio-pagos";
import { listarCuentasActivas } from "@/services/cuentas-bancarias";
import { buscarRecursosKBI, calcularScore } from "./kb-search";
import { calcularScoreRespuesta } from "@/services/kbi/scores";
import { obtenerContextoPipeline } from "./contexto-pipeline";
import { obtenerRelacionesParaPrompt } from "@/services/servicio-relaciones";
import { obtenerHintCalidadLead } from "@/services/calidad-conversacional";
import { obtenerHistorialMultiTurn } from "./historial-adaptativo";
import { calcularContextoAdaptativo, type ContextoTokens } from "./token-budget";
import { obtenerVariantePrompt } from "@/services/prompt-experimentos";
import { obtenerReglasAplicables } from "@/services/reglas-conversacionales";
import { construirSystemPrompt } from "./prompt-builder";
import type { ContextoLead } from "./prompt-builder";
import { normalizarRespuesta } from "./normalizar-respuesta";
import type { DimensionesMatriz } from "@/lib/supabase/types";

export type { ContextoLead };
export { necesitaHandoff } from "./handoff";

export interface RespuestaIA {
  texto:          string;
  scoreConfianza: number;
  imagenUrl:      string | null;
  recursosIds:    string[];
}

export async function generarRespuesta(
  mensajes: string[],
  contexto: ContextoLead,
): Promise<RespuestaIA> {
  const queryParaBusqueda = mensajes.join(" ");

  const dims8D: DimensionesMatriz = {
    canal_origen: "whatsapp",
    etapa_atasco: contexto.pipelineStage,
    ...(contexto.temperamento && { temperamento: contexto.temperamento as DimensionesMatriz["temperamento"] }),
    ...(contexto.faseCAGC !== undefined && { fase_cagc: contexto.faseCAGC }),
  };

  const ctxTokens: ContextoTokens = {
    tieneSlotsDisponibles:  (contexto.slotsDisponibles?.length ?? 0) > 0,
    tieneProtocoloObjecion: !!contexto.protocoloObjecion,
    tieneMeetLink:          !!contexto.meetLink,
    modoRevelacion:         contexto.modoRevelacion ?? "oculto",
  };

  const [resultadosBusqueda, gatillos, sugerenciaMatriz, identidad, contextoPipeline, hintCalidad, variantePrompt, reglasAplicables, adaptativo] = await Promise.all([
    buscarRecursosKBI(queryParaBusqueda),
    obtenerGatillosActivos(contexto.pipelineRuta),
    inferirRespuestaMatriz(dims8D, mensajes, contexto.nombre).catch(() => null),
    obtenerIdentidad().catch(() => null),
    obtenerContextoPipeline(contexto.pipelineRuta as string | undefined, contexto.pipelineStage)
      .catch(() => ({ servicio: null, etapa: null })),
    contexto.leadId ? obtenerHintCalidadLead(contexto.leadId).catch(() => null) : Promise.resolve(null),
    contexto.leadId
      ? obtenerVariantePrompt(contexto.leadId, { pipeline_stage: contexto.pipelineStage, temperamento: contexto.temperamento }).catch(() => null)
      : Promise.resolve(null),
    obtenerReglasAplicables({ tagsGhl: contexto.tagsGhl ?? [], temperamento: contexto.temperamento, pipelineStage: contexto.pipelineStage }).catch(() => []),
    contexto.leadId
      ? calcularContextoAdaptativo(contexto.leadId, ctxTokens)
      : Promise.resolve({ limiteHistorial: 8, maxTokens: 500 }),
  ]);

  const { limiteHistorial, maxTokens } = adaptativo;

  const historialMultiTurn = contexto.leadId
    ? await obtenerHistorialMultiTurn(contexto.leadId, limiteHistorial)
    : [];

  const { servicios: serviciosSemánticos, kb } = resultadosBusqueda;

  const serviciosPipeline = contextoPipeline.servicio ? [contextoPipeline.servicio] : [];
  const idsPipeline       = new Set(serviciosPipeline.map((s) => s.id));
  const serviciosExtra    = serviciosSemánticos.filter((s) => !idsPipeline.has(s.id)).slice(0, 2);
  const serviciosAncla    = [...serviciosPipeline, ...serviciosExtra];
  const todosRecursos     = [...serviciosSemánticos, ...kb];

  void registrarUso(todosRecursos.map((r) => r.id));
  if (todosRecursos.length === 0) {
    void sugerirRecursoDesdeQuery(queryParaBusqueda);
    void import("@/services/kbi/detector").then(({ crearSugerenciaHueco }) =>
      crearSugerenciaHueco(queryParaBusqueda).catch(() => null)
    );
  }
  if (kb.length > 0) {
    void registrarSenales("uso", kb.map((r) => r.id), { leadId: contexto.leadId, sesionId: crypto.randomUUID() });
  }

  // Imagen activa del servicio principal para el canal
  const canalParaImagen = (contexto.canal_origen === "email" ? "email"
    : contexto.canal_origen === "landing" ? "landing" : "whatsapp") as "whatsapp" | "email" | "landing";
  const imagenActivaUrl: string | null = await (async () => {
    if (!contexto.imagen_activa_url && serviciosAncla.length > 0) {
      try {
        const { seleccionarImagenActiva } = await import("@/services/imagen-servicio");
        return await seleccionarImagenActiva(serviciosAncla[0].id, canalParaImagen);
      } catch { return null; }
    }
    return contexto.imagen_activa_url ?? null;
  })();

  // Pagos, cuentas y relaciones
  const [pagosServicios, cuentasActivas, relacionesLinea] = await Promise.all([
    serviciosAncla.length > 0
      ? Promise.all(serviciosAncla.map(async (s) => {
          const supabase = createServiceClient();
          const [pago, svcRow, todosLinks] = await Promise.all([
            seleccionarPagoServicio(s.id, contexto.faseCAGC).catch(() => null),
            supabase.from("servicios" as "recursos_conocimiento")
              .select("precio_centavos, precio_descuento_centavos, precio_apartado_centavos, modo_venta, url_landing_propia")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .eq("id", s.id).single().then((r: any) => r.data ?? null, () => null),
            listarPagosServicio(s.id).catch(() => []),
          ]);
          return { titulo: s.titulo, id: s.id, pago, svc: svcRow, todosLinks };
        }))
      : Promise.resolve([]),
    listarCuentasActivas().catch(() => []),
    serviciosAncla.length > 0 ? obtenerRelacionesParaPrompt(serviciosAncla[0].id).catch(() => "") : Promise.resolve(""),
  ]);

  // Prácticas de venta (fetch + filtrado contextual)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todasPracticas } = await (createServiceClient() as any)
    .from("recursos_conocimiento")
    .select("contenido, contextos_aplica")
    .eq("tipo", "practica_venta").eq("aprobado", true).eq("activo", true)
    .order("score_confianza", { ascending: false })
    .limit(20);
  const { estable, dinamico } = construirSystemPrompt({
    identidad, serviciosAncla, pagosServicios, cuentasActivas, relacionesLinea,
    kb, todasPracticas: todasPracticas ?? [], gatillos, sugerenciaMatriz,
    contextoPipeline, hintCalidad, variantePrompt, reglasAplicables,
    imagenActivaUrl, contexto,
  });

  // Activar prompt caching solo si el bloque estable supera el mínimo de Sonnet (1024 tokens ≈ 4096 chars).
  const CACHE_MIN_CHARS = 4096;
  const system = estable.length >= CACHE_MIN_CHARS
    ? [
        { type: "text" as const, text: estable, cache_control: { type: "ephemeral" as const } },
        { type: "text" as const, text: dinamico },
      ]
    : `${estable}\n${dinamico}`;

  const response = await callClaudeIA("RESPUESTA_GHL_SBC", {
    max_tokens: maxTokens,
    system,
    messages:   [...historialMultiTurn, { role: "user", content: mensajes.join("\n") }],
  });

  void registrarUsoIA("anthropic", response.usage.input_tokens, response.usage.output_tokens).catch(() => {});

  const texto = normalizarRespuesta((response.content[0] as { text: string }).text.trim());

  const kbIds = kb.map((r) => r.id);
  const scoreConfianza = kbIds.length > 0
    ? await calcularScoreRespuesta(kbIds, texto).catch(() => calcularScore(todosRecursos, sugerenciaMatriz, texto))
    : calcularScore(todosRecursos, sugerenciaMatriz, texto);

  return { texto, scoreConfianza, imagenUrl: imagenActivaUrl, recursosIds: todosRecursos.map((r) => r.id) };
}
