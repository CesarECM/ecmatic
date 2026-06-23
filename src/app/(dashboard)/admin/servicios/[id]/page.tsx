import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { obtenerServicio } from "@/services/servicios";
import { listarPagosServicio } from "@/services/servicio-pagos";
import { listarRelaciones, listarTodosLosDestinosPosibles } from "@/services/servicio-relaciones";
import { listarImagenesServicio } from "@/services/imagen-servicio";
import { createServiceClient } from "@/lib/supabase/service";
import { DatosGeneralesCard } from "./components/DatosGeneralesCard";
import { FichaComercialCard } from "./components/FichaComercialCard";
import { PreciosCard } from "./components/PreciosCard";
import { PagosCard } from "./components/PagosCard";
import { RelacionesCard } from "./components/RelacionesCard";
import { ImagenesCard } from "./components/ImagenesCard";
import { BrochuresCard } from "./components/BrochuresCard";
import { AuditoriaCard } from "./components/AuditoriaCard";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const s = await obtenerServicio(id);
    return { title: `${s.titulo} · ECMatic` };
  } catch {
    return { title: "Servicio · ECMatic" };
  }
}

export default async function ServicioDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  let servicio;
  try {
    servicio = await obtenerServicio(id);
  } catch {
    notFound();
  }

  const [pagos, relaciones, otrosServicios, imagenes, brochuresRes, sugerenciasRes] =
    await Promise.all([
      listarPagosServicio(id),
      listarRelaciones(id),
      listarTodosLosDestinosPosibles(id),
      listarImagenesServicio(id),
      supabase.from("brochures").select("id,titulo,url,fases_cagc_objetivo,activo,servicio_id").eq("servicio_id", id),
      supabase
        .from("sugerencias_ia")
        .select("id, titulo, descripcion, metadata, created_at")
        .eq("servicio_id", id)
        .filter("metadata->>categoria", "eq", "auditor_servicio")
        .is("aprobado", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const brochures = (brochuresRes.data ?? []) as { id: string; titulo: string; url: string; activo: boolean }[];
  const sugerencias = (sugerenciasRes.data ?? []) as { id: string; titulo: string; descripcion: string; metadata: Record<string, unknown>; created_at: string }[];
  const ahorro = servicio.precio_centavos && servicio.precio_descuento_centavos
    ? Math.round((1 - servicio.precio_descuento_centavos / servicio.precio_centavos) * 100)
    : null;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/admin/servicios" className="text-muted-foreground hover:text-foreground text-sm mt-1">← Servicios</Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {servicio.icono && <span className="text-2xl">{servicio.icono}</span>}
            <h1 className="text-2xl font-bold">{servicio.titulo}</h1>
            {!servicio.activo    && <Badge variant="outline">Inactivo</Badge>}
            {servicio.estandar_conocer && servicio.conocer_habilitado && (
              <Badge variant="secondary">{servicio.estandar_conocer}</Badge>
            )}
            {sugerencias.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {sugerencias.length} sugerencia{sugerencias.length !== 1 ? "s" : ""} IA
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {servicio.score_uso} usos · {servicio.modalidad?.replace("_", " ") ?? "Sin modalidad"}
            {ahorro ? ` · Descuento ${ahorro}%` : ""}
          </p>
        </div>
      </div>

      {/* Auditoría IA — aparece primero si hay sugerencias */}
      {sugerencias.length > 0 && (
        <AuditoriaCard sugerencias={sugerencias} servicioId={id} />
      )}

      <DatosGeneralesCard servicio={servicio} />
      <FichaComercialCard servicio={servicio} />
      <PreciosCard
        servicioId={id}
        precioCentavos={servicio.precio_centavos}
        precioDescuentoCentavos={servicio.precio_descuento_centavos}
      />
      <PagosCard servicioId={id} pagos={pagos} />
      <RelacionesCard servicioId={id} relaciones={relaciones} otrosServicios={otrosServicios} />
      <ImagenesCard servicioId={id} imagenes={imagenes} />
      <BrochuresCard servicioId={id} brochures={brochures} />

      {sugerencias.length === 0 && (
        <AuditoriaCard sugerencias={[]} servicioId={id} />
      )}
    </div>
  );
}
