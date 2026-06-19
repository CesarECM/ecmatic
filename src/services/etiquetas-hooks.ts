import { createServiceClient } from "@/lib/supabase/service";
import { asignarEtiqueta } from "@/services/etiquetas";

// S14.4 — Asigna la etiqueta de producto al confirmar una compra.
// Busca o crea la etiqueta "Tripwire" / "Premium" en la categoría Producto.
export async function asignarEtiquetaProducto(
  leadId: string,
  ruta: string
): Promise<void> {
  const supabase = createServiceClient();
  const nombreEtiqueta = ruta === "premium" ? "Premium" : "Tripwire";

  // Buscar categoría Producto
  const { data: cat } = await supabase
    .from("etiqueta_categorias")
    .select("id")
    .eq("nombre", "Producto")
    .maybeSingle();
  if (!cat) return;

  // Buscar o crear etiqueta
  const { data: etq } = await supabase
    .from("etiquetas")
    .select("id")
    .eq("categoria_id", cat.id)
    .eq("nombre", nombreEtiqueta)
    .maybeSingle();

  let etiquetaId: string;
  if (etq) {
    etiquetaId = etq.id;
  } else {
    const { data: nueva, error } = await supabase
      .from("etiquetas")
      .insert({ categoria_id: cat.id, nombre: nombreEtiqueta, origen: "automatico", estado: "activa" })
      .select("id")
      .single();
    if (error || !nueva) return;
    etiquetaId = nueva.id;
  }

  await asignarEtiqueta(leadId, etiquetaId, "automatico");
}
