import { anthropic } from "@/lib/ai/client";
import { modeloPorTarea } from "@/lib/ai/model-router";
import { crearCelda, listarMatriz, buscarEnMatriz } from "./matriz";
import type { DimensionesMatriz } from "@/lib/supabase/types";

// S5.3 — Cuando no hay celda aprobada, genera respuesta por inferencia IA.
// No bloquea nunca: siempre devuelve algo orientado al cierre.
export async function inferirRespuestaMatriz(
  dimensiones: DimensionesMatriz,
  mensajes: string[],
  nombreLead: string | null
): Promise<string | null> {
  const celda = await buscarEnMatriz(dimensiones);
  if (celda) return celda.respuesta_sugerida;

  const prompt = `Eres un experto en ventas de certificaciones CONOCER para Centro ECM (México).
Un lead con el siguiente perfil está preguntando y necesitas una respuesta personalizada orientada al cierre:

Perfil del lead:
- Temperamento DISC: ${dimensiones.temperamento ?? "no determinado"}
- Objeción principal: ${dimensiones.objecion ?? "no identificada"}
- Servicio de interés: ${dimensiones.servicio ?? "general"}
- Tipo de cliente: ${dimensiones.tipo_cliente ?? "no determinado"}
- Canal: ${dimensiones.canal_origen ?? "whatsapp"}
- Etapa de atasco: ${dimensiones.etapa_atasco ?? "ninguna"}
- Temperatura: ${dimensiones.temperatura ?? "tibia"}

Mensajes recientes del lead:
${mensajes.join("\n")}

Genera UNA respuesta corta (máx 2 oraciones), cálida, orientada al cierre, adaptada al perfil.
No menciones el perfil internamente. Responde en español.`;

  const res = await anthropic.messages.create({
    model: modeloPorTarea("ANALISIS"),
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const texto = (res.content[0] as { text: string }).text.trim();
  void guardarSugerenciaMatriz(dimensiones, texto);
  return texto;
}

async function guardarSugerenciaMatriz(
  dimensiones: DimensionesMatriz,
  respuesta: string
): Promise<void> {
  try {
    await crearCelda(dimensiones, respuesta, "automatico");
  } catch {
    // silencioso — no bloquear el flujo principal
  }
}

// S5.5 — Detecta combinaciones de dimensiones con pocas o nulas celdas aprobadas
// y genera sugerencias de contenido para que el admin las apruebe.
export async function sugerirCeldasVacias(): Promise<number> {
  const todasLasCeldas = await listarMatriz({ aprobado: true });
  const combinaciones = generarCombinacionesPrioritarias();
  let generadas = 0;

  for (const dims of combinaciones) {
    const clave = JSON.stringify(dims);
    const yaExiste = todasLasCeldas.some(
      (c) => JSON.stringify(c.dimensiones) === clave
    );
    if (yaExiste) continue;

    try {
      const respuesta = await generarContenidoSugerido(dims);
      await crearCelda(dims, respuesta, "ia_sugerido");
      generadas++;
      if (generadas >= 10) break;
    } catch {
      continue;
    }
  }

  return generadas;
}

async function generarContenidoSugerido(dims: DimensionesMatriz): Promise<string> {
  const prompt = `Eres experto en ventas de certificaciones CONOCER. Genera una respuesta de ventas
para el siguiente perfil de lead (máx 2 oraciones, orientada al cierre, en español):
- Temperamento: ${dims.temperamento ?? "general"}
- Objeción: ${dims.objecion ?? "ninguna"}
- Servicio: ${dims.servicio ?? "proceso completo"}
- Tipo cliente: ${dims.tipo_cliente ?? "B2C"}`;

  const res = await anthropic.messages.create({
    model: modeloPorTarea("ANALISIS"),
    max_tokens: 150,
    messages: [{ role: "user", content: prompt }],
  });
  return (res.content[0] as { text: string }).text.trim();
}

function generarCombinacionesPrioritarias(): DimensionesMatriz[] {
  const temperamentos: DimensionesMatriz["temperamento"][] = ["D", "I", "S", "C"];
  const objeciones = ["precio", "tiempo", "no_sirva", "titulo", "pensarlo"];
  const combinaciones: DimensionesMatriz[] = [];

  for (const t of temperamentos) {
    for (const o of objeciones) {
      combinaciones.push({ temperamento: t, objecion: o });
    }
  }
  for (const t of temperamentos) {
    combinaciones.push({ temperamento: t, temperatura: "caliente" });
    combinaciones.push({ temperamento: t, temperatura: "fria" });
  }
  return combinaciones;
}
