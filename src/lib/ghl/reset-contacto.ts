import { obtenerContacto, eliminarTagsContacto, buscarOportunidadesContacto, eliminarOportunidad } from "./contacts-api";
import { buscarConversacionWA, eliminarConversacion } from "./conversations-api";

export interface ResultadoResetGHL {
  tags_eliminados: number;
  oportunidades_eliminadas: number;
  conversacion_eliminada: boolean;
  errores: string[];
}

// Sprint 38 — Reset completo de un contacto GHL (Opción D: tags + pipeline + conversaciones)
// No elimina el contacto en sí — solo limpia sus datos — para proteger usuarios GHL.
export async function resetearContactoGHL(contactId: string): Promise<ResultadoResetGHL> {
  const errores: string[] = [];
  let tagsEliminados = 0;
  let oportunidadesEliminadas = 0;
  let conversacionEliminada = false;

  // 1 — Quitar todos los tags
  try {
    const contacto = await obtenerContacto(contactId);
    const tags = contacto.tags ?? [];
    if (tags.length > 0) {
      await eliminarTagsContacto(contactId, tags);
      tagsEliminados = tags.length;
    }
  } catch (err) {
    errores.push(`tags: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2 — Eliminar oportunidades / pipeline
  try {
    const oportunidades = await buscarOportunidadesContacto(contactId);
    await Promise.all(
      oportunidades.map((op) =>
        eliminarOportunidad(op.id).catch((e) =>
          errores.push(`oportunidad ${op.id}: ${e instanceof Error ? e.message : String(e)}`)
        )
      )
    );
    oportunidadesEliminadas = oportunidades.length;
  } catch (err) {
    errores.push(`oportunidades: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3 — Eliminar conversación WhatsApp
  try {
    const conv = await buscarConversacionWA(contactId);
    if (conv) {
      await eliminarConversacion(conv.id);
      conversacionEliminada = true;
    }
  } catch (err) {
    errores.push(`conversacion: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { tags_eliminados: tagsEliminados, oportunidades_eliminadas: oportunidadesEliminadas, conversacion_eliminada: conversacionEliminada, errores };
}
