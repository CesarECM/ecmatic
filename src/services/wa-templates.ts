// S34.4 — CRUD para wa_templates
import { createServiceClient } from "@/lib/supabase/service";

export type EstadoWaTemplate = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";
export type CategoriaWaTemplate = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface WaTemplate {
  id: string;
  nombre: string;
  categoria: CategoriaWaTemplate;
  idioma: string;
  componentes: ComponenteTemplate[];
  estado_meta: EstadoWaTemplate;
  imagen_servicio_id: string | null;
  meta_template_id: string | null;
  enviado_a_meta_at: string | null;
  aprobado_at: string | null;
  created_at: string;
  updated_at: string;
}

// Componentes según especificación Meta
export interface ComponenteTemplate {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

export interface NuevoTemplate {
  nombre: string;
  categoria: CategoriaWaTemplate;
  idioma?: string;
  componentes: ComponenteTemplate[];
  imagen_servicio_id?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function listarTemplates(): Promise<WaTemplate[]> {
  const { data } = await db()
    .from("wa_templates")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as WaTemplate[]) ?? [];
}

export async function obtenerTemplate(id: string): Promise<WaTemplate | null> {
  const { data } = await db()
    .from("wa_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as WaTemplate) ?? null;
}

export async function crearTemplate(datos: NuevoTemplate): Promise<WaTemplate> {
  const { data, error } = await db()
    .from("wa_templates")
    .insert({
      nombre: datos.nombre,
      categoria: datos.categoria,
      idioma: datos.idioma ?? "es_MX",
      componentes: datos.componentes,
      imagen_servicio_id: datos.imagen_servicio_id ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Error al crear template");
  return data as WaTemplate;
}

export async function actualizarTemplate(id: string, datos: Partial<NuevoTemplate>): Promise<void> {
  await db()
    .from("wa_templates")
    .update({ ...datos, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function eliminarTemplate(id: string): Promise<void> {
  await db().from("wa_templates").delete().eq("id", id);
}

export async function actualizarEstadoMeta(
  id: string,
  estado: EstadoWaTemplate,
  metaTemplateId?: string,
  aprobado?: boolean
): Promise<void> {
  const patch: Record<string, unknown> = {
    estado_meta: estado,
    updated_at: new Date().toISOString(),
  };
  if (metaTemplateId) {
    patch.meta_template_id = metaTemplateId;
    patch.enviado_a_meta_at = new Date().toISOString();
  }
  if (aprobado) patch.aprobado_at = new Date().toISOString();

  await db().from("wa_templates").update(patch).eq("id", id);
}

// Todos los templates en estado PENDING (para polling cron)
export async function listarTemplatesPendientes(): Promise<WaTemplate[]> {
  const { data } = await db()
    .from("wa_templates")
    .select("*")
    .eq("estado_meta", "PENDING")
    .not("meta_template_id", "is", null);
  return (data as WaTemplate[]) ?? [];
}
