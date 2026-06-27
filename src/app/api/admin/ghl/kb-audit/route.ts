import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Semaforo = "verde" | "amarillo" | "rojo";

function evaluarCobertura(row: {
  titulo: string;
  contenido: string | null;
  caracteristicas: string | null;
  beneficios: string | null;
  ventajas: string | null;
  para_quien_es: string | null;
  para_quien_no_es: string | null;
  score_uso: number;
  aprobado: boolean;
}): Semaforo {
  const campos = [row.contenido, row.beneficios, row.para_quien_es, row.caracteristicas];
  const completos = campos.filter(Boolean).length;
  if (!row.aprobado) return "rojo";
  if (completos >= 3) return "verde";
  if (completos >= 1) return "amarillo";
  return "rojo";
}

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await (supabase as any)
    .from("recursos_conocimiento")
    .select("id, titulo, contenido, caracteristicas, beneficios, ventajas, para_quien_es, para_quien_no_es, score_uso, score_confianza, aprobado, activo")
    .eq("tipo", "servicio")
    .order("titulo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const servicios = (data ?? []).map((row: Parameters<typeof evaluarCobertura>[0] & { id: string; activo: boolean; score_confianza: number }) => ({
    id:               row.id,
    titulo:           row.titulo,
    activo:           row.activo,
    aprobado:         row.aprobado,
    score_uso:        row.score_uso,
    score_confianza:  row.score_confianza,
    semaforo:         evaluarCobertura(row),
    campos_faltantes: [
      !row.contenido        && "contenido",
      !row.beneficios       && "beneficios",
      !row.para_quien_es    && "para_quien_es",
      !row.caracteristicas  && "caracteristicas",
      !row.ventajas         && "ventajas",
      !row.para_quien_no_es && "para_quien_no_es",
    ].filter(Boolean) as string[],
  }));

  const resumen = {
    total:    servicios.length,
    verde:    servicios.filter((s: { semaforo: Semaforo }) => s.semaforo === "verde").length,
    amarillo: servicios.filter((s: { semaforo: Semaforo }) => s.semaforo === "amarillo").length,
    rojo:     servicios.filter((s: { semaforo: Semaforo }) => s.semaforo === "rojo").length,
  };

  return NextResponse.json({ resumen, servicios });
}
