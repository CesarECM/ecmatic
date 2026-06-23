// S24.3 — Genera el mensaje WhatsApp que ofrece un brochure al lead.
// Tono: informativo, sin presión, enmarcado como material de consulta.

import { callClaudeIA } from "./client";

interface ContextoOfertaBrochure {
  nombreLead: string | null;
  tituloBrochure: string;
  descripcionBrochure: string;
  tituloServicio: string | null;
  faseCAGC: number;
}

const SYSTEM = `Eres un asesor de certificaciones CONOCER que quiere compartir información completa sobre un servicio.
Genera un mensaje de WhatsApp muy breve (1–2 oraciones) ofreciendo el brochure mencionado.

REGLAS:
- Tono informativo y amigable, sin presión de venta
- Enmarca el brochure como material útil para que el lead tome una decisión informada
- Termina con una pregunta de confirmación sencilla ("¿Te lo envío?", "¿Lo revisas?")
- Sin emojis excesivos (máx 1)
- Sin frases de marketing agresivas`;

export async function generarMensajeOfertaBrochure(
  ctx: ContextoOfertaBrochure
): Promise<string> {
  const userContent = `Lead: ${ctx.nombreLead ?? "el candidato"}
Brochure a ofrecer: ${ctx.tituloBrochure}
Descripción: ${ctx.descripcionBrochure}
${ctx.tituloServicio ? `Servicio relacionado: ${ctx.tituloServicio}` : ""}
Fase CAGC del comprador: ${ctx.faseCAGC}

Genera el mensaje de oferta ahora.`;

  const response = await callClaudeIA("LEADMAGNET", {
    max_tokens: 120,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  return ((response.content[0] as { text: string }).text ?? "").trim();
}
