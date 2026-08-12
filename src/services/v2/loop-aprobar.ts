import { createServiceClient } from "@/lib/supabase/service";

// Paso 9a — El contenido se aprueba tal cual
export async function aprobarContactPoint(cpId: string): Promise<void> {
  const db = createServiceClient() as any;
  const { data: cp } = await db
    .from("v2_contact_points").select("contenido_propuesto, estado").eq("id", cpId).single();

  if (!cp || cp.estado !== "generado") throw new Error(`aprobar: estado inválido (${cp?.estado})`);

  await db.from("v2_contact_points").update({
    estado:          "aprobado",
    contenido_final: cp.contenido_propuesto,
    updated_at:      new Date().toISOString(),
  }).eq("id", cpId);
}

// Paso 9b — El usuario edita el contenido antes de aprobar
// Retroalimentación obligatoria: ayuda a la KB a aprender qué mejorar
export async function editarContactPoint(
  cpId:              string,
  contenidoFinal:    string,
  retroalimentacion: string,
): Promise<void> {
  const db = createServiceClient() as any;
  const { data: cp } = await db
    .from("v2_contact_points").select("estado, lead_id").eq("id", cpId).single();

  if (!cp || cp.estado !== "generado") throw new Error(`editar: estado inválido (${cp?.estado})`);

  await db.from("v2_contact_points").update({
    estado:          "editado",
    contenido_final: contenidoFinal,
    updated_at:      new Date().toISOString(),
  }).eq("id", cpId);

  // Registrar retroalimentación — usada en S148.3 para propuestas KB
  await db.from("v2_follow_up_notes").insert({
    contact_point_id:          cpId,
    resultado:                 "hecho",
    retroalimentacion_edicion: retroalimentacion,
  });
}

// Paso 9c — El usuario rechaza el contenido
// Retroalimentación obligatoria (doc §3 paso 10)
export async function rechazarContactPoint(
  cpId:              string,
  retroalimentacion: string,
): Promise<void> {
  const db = createServiceClient() as any;
  const { data: cp } = await db
    .from("v2_contact_points").select("estado, lead_id").eq("id", cpId).single();

  if (!cp || cp.estado !== "generado") throw new Error(`rechazar: estado inválido (${cp?.estado})`);

  await db.from("v2_contact_points").update({
    estado:     "rechazado",
    updated_at: new Date().toISOString(),
  }).eq("id", cpId);

  await db.from("v2_follow_up_notes").insert({
    contact_point_id:          cpId,
    resultado:                 "no_hecho",
    retroalimentacion_edicion: retroalimentacion,
  });
}
