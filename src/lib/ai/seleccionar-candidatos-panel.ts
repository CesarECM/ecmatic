// MPS-34 S120.2 — Haiku selecciona los mejores leads activos para llenar el panel.
// Se invoca cuando el panel tiene < 10 slots ocupados.

import { callClaudeIA } from "@/lib/ai/client";
import { obtenerCandidatos, agregarAlPanel, PANEL_SIZE, contarOportunidadesActivas } from "@/services/oportunidades";
import { logSistema } from "@/services/log-sistema";

export async function seleccionarCandidatosPanel(): Promise<{ agregados: number }> {
  const actuales = await contarOportunidadesActivas();
  const slots = PANEL_SIZE - actuales;
  if (slots <= 0) return { agregados: 0 };

  const candidatos = await obtenerCandidatos(40);
  if (!candidatos.length) return { agregados: 0 };

  const lista = candidatos.map((c, i) =>
    `${i + 1}. ID:${c.id} | ${c.nombre ?? "Sin nombre"} | Etapa: ${c.pipeline_stage ?? "?"} | Score: ${c.score_salud} | Último contacto: ${c.updated_at.slice(0, 10)} | Memoria: ${c.memoria_ia?.slice(0, 120) ?? "ninguna"}`
  ).join("\n");

  const res = await callClaudeIA(
    "SELECCIONAR_CANDIDATOS",
    {
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Eres experto en ventas B2C de certificaciones CONOCER en México.
Necesito llenar ${slots} slot(s) en un panel de las 10 oportunidades más cercanas al cierre.

Leads candidatos (ordenados por score_salud):
${lista}

Devuelve ÚNICAMENTE un JSON con los IDs de los ${slots} mejores candidatos:
{ "ids": ["uuid1", "uuid2", ...] }

Criterios: prioriza leads con score alto, con actividad reciente y en etapas avanzadas del pipeline.
Sin markdown, sin texto extra.`,
      }],
    }
  );

  const texto = (res.content[0] as { text: string }).text.trim();
  const cleaned = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const { ids } = JSON.parse(cleaned) as { ids: string[] };

  let agregados = 0;
  for (const id of ids.slice(0, slots)) {
    try {
      await agregarAlPanel(id);
      agregados++;
    } catch {
      // slot puede llenarse en carrera concurrente
    }
  }

  void logSistema({
    categoria: "ia", tipoAccion: "oportunidades.seleccionar_candidatos",
    fase: "ok", resultado: `${agregados} leads agregados al panel`,
  });

  return { agregados };
}
