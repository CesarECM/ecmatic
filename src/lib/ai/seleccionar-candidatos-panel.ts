// MPS-36 S124.3 — Sin hard limit de PANEL_SIZE. Soft cap: agrega máx 20 candidatos por pasada.
// Haiku elige los mejores del pool de leads activos que aún no están en el panel.

import { callClaudeIA } from "@/lib/ai/client";
import { obtenerCandidatos, agregarAlPanel } from "@/services/oportunidades";
import { logSistema } from "@/services/log-sistema";

const SOFT_CAP = 20; // máx leads nuevos por pasada

export async function seleccionarCandidatosPanel(): Promise<{ agregados: number }> {
  const candidatos = await obtenerCandidatos(60);
  if (!candidatos.length) return { agregados: 0 };

  const lista = candidatos.map((c, i) =>
    `${i + 1}. ID:${c.id} | ${c.nombre ?? "Sin nombre"} | Etapa: ${c.pipeline_stage ?? "?"} | Score: ${c.score_salud} | Último contacto: ${c.updated_at.slice(0, 10)} | Memoria: ${c.memoria_ia?.slice(0, 120) ?? "ninguna"}`
  ).join("\n");

  const res = await callClaudeIA(
    "SELECCIONAR_CANDIDATOS",
    {
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Eres experto en ventas B2C de certificaciones CONOCER en México.
Selecciona los mejores candidatos para un panel de seguimiento de oportunidades de cierre.
Elige hasta ${SOFT_CAP} leads (o menos si no hay suficientes que valgan la pena).

Leads candidatos (ordenados por score_salud):
${lista}

Devuelve ÚNICAMENTE un JSON con los IDs de los mejores candidatos:
{ "ids": ["uuid1", "uuid2", ...] }

Criterios: prioriza leads con score alto, actividad reciente y etapas avanzadas del pipeline.
Excluye leads con score_salud < 20 o sin actividad en los últimos 60 días.
Sin markdown, sin texto extra.`,
      }],
    }
  );

  const texto   = (res.content[0] as { text: string }).text.trim();
  const cleaned = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const { ids } = JSON.parse(cleaned) as { ids: string[] };

  let agregados = 0;
  for (const id of ids.slice(0, SOFT_CAP)) {
    try {
      await agregarAlPanel(id);
      agregados++;
    } catch { /* puede ya existir */ }
  }

  void logSistema({
    categoria: "ia", tipoAccion: "oportunidades.seleccionar_candidatos",
    fase: "ok", resultado: `${agregados} leads agregados al panel`,
  });

  return { agregados };
}
