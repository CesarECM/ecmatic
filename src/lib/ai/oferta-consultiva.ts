// S19.7 — Genera una oferta consultiva basada en señales situacionales.
// Tono profesional-resolutivo: reconoce la situación, presenta la solución,
// propone un paso concreto. Optimizado para WhatsApp (≤ 3 oraciones).

import { callClaudeIA } from "./client";
import type { SenalGuardada } from "@/services/senales-situacionales";

interface ContextoOferta {
  nombreLead: string | null;
  senales: SenalGuardada[];
  faseCAGC: number | null;
  serviciosDisponibles: string;
  brandLinea: string;
}

const SYSTEM = `Eres un asesor consultivo de certificaciones CONOCER en México.
Tu objetivo es generar un mensaje de WhatsApp breve, en tono profesional y resolutivo,
que aborde la situación específica del lead y proponga un paso de acción concreto.

REGLAS ESTRICTAS:
- Máximo 3 oraciones cortas (WhatsApp-friendly)
- Reconoce la situación sin sonar invasivo ni que "le espías"
- Presenta la certificación como la solución directa, sin rodeos
- Cierra con un paso de acción inmediato (llamada, cita, confirmación)
- Sin emojis excesivos (máx 1 al inicio si es natural)
- Sin frases genéricas de ventas ("oferta única", "no te pierdas", "ahora o nunca")
- Si hay fecha límite: menciona que hay tiempo para resolverlo
- Si es por tercero: valida la importancia profesional sin presionar
- Si es urgencia laboral: empatía primero, solución después`;

export async function generarTextoOfertaConsultiva(ctx: ContextoOferta): Promise<string> {
  const senalesTexto = ctx.senales
    .map((s) => `• [${s.tipo.toUpperCase()}] ${s.descripcion}`)
    .join("\n");

  const faseCagcLinea = ctx.faseCAGC !== null
    ? `Fase CAGC del comprador: ${ctx.faseCAGC} (${faseNombre(ctx.faseCAGC)})`
    : "";

  const userContent = `Lead: ${ctx.nombreLead ?? "el candidato"}
${faseCagcLinea}

Señales situacionales detectadas:
${senalesTexto}

Servicios disponibles:
${ctx.serviciosDisponibles}

${ctx.brandLinea}

Genera el mensaje WhatsApp consultivo ahora.`;

  const response = await callClaudeIA("RESPUESTA", {
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  return ((response.content[0] as { text: string }).text ?? "").trim();
}

function faseNombre(n: number): string {
  const nombres: Record<number, string> = {
    0: "Inconsciencia", 1: "Activación", 2: "Definición del problema",
    3: "Exploración inicial", 4: "Consciencia de soluciones", 5: "Criterios",
    6: "Evaluación", 7: "Validación social", 8: "Ansiedad pre-decisión",
    9: "Decisión de compra", 10: "Acto de compra", 11: "Disonancia post-compra",
    12: "Evaluación de experiencia", 13: "Satisfacción", 14: "Retención",
    15: "Lealtad", 16: "Advocacy",
  };
  return nombres[n] ?? `fase ${n}`;
}
