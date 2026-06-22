import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { listarImagenesServicio } from "@/services/imagen-servicio";
import { PreciosCard } from "./components/PreciosCard";
import { BundleRulesCard } from "./components/BundleRulesCard";
import { ImagenesCard } from "./components/ImagenesCard";
import { Badge } from "@/components/ui/badge";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("recursos_conocimiento").select("titulo").eq("id", id).single();
  return { title: `${data?.titulo ?? "Servicio"} · ECMatic` };
}

export default async function ServicioDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [servicioRes, bundlesRes, todosServiciosRes, pagosRes, brochuresRes, imagenes] =
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("recursos_conocimiento")
        .select("id,titulo,contenido,tipo,precio_centavos,precio_descuento_centavos,score_uso,activo,aprobado,caracteristicas,beneficios,ventajas,para_quien_es,para_quien_no_es")
        .eq("id", id)
        .single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("bundle_reglas")
        .select("id, tipo, servicio_destino_id, recursos_conocimiento!bundle_reglas_servicio_destino_id_fkey(titulo)")
        .eq("servicio_origen_id", id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("recursos_conocimiento")
        .select("id, titulo")
        .eq("tipo", "servicio")
        .neq("id", id)
        .order("titulo"),
      supabase.from("servicio_pagos").select("id,tipo,url,descripcion,activo").eq("recurso_id", id),
      supabase.from("brochures").select("id,titulo,url,fases_cagc_objetivo,activo").eq("recurso_id", id),
      listarImagenesServicio(id),
    ]);

  const servicio = servicioRes.data;
  if (!servicio || servicio.tipo !== "servicio") notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reglas = (bundlesRes.data ?? []).map((r: any) => ({
    id: r.id,
    tipo: r.tipo,
    servicio_destino_id: r.servicio_destino_id,
    destino_titulo: r.recursos_conocimiento?.titulo ?? "—",
  }));

  const otrosServicios = (todosServiciosRes.data ?? []) as { id: string; titulo: string }[];
  const pagos = (pagosRes.data ?? []) as { id: string; tipo: string; url: string; descripcion: string | null; activo: boolean }[];
  const brochures = (brochuresRes.data ?? []) as { id: string; titulo: string; url: string; activo: boolean }[];

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/admin/servicios" className="text-muted-foreground hover:text-foreground text-sm mt-1">← Servicios</Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{servicio.titulo}</h1>
            {!servicio.aprobado && <Badge variant="secondary">Pendiente</Badge>}
            {!servicio.activo && <Badge variant="outline">Inactivo</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{servicio.score_uso} usos por el motor de IA</p>
        </div>
      </div>

      {/* Descripción y ficha */}
      <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
        <p className="text-muted-foreground whitespace-pre-wrap">{servicio.contenido}</p>
        {[
          ["Características", servicio.caracteristicas],
          ["Beneficios", servicio.beneficios],
          ["Ventajas", servicio.ventajas],
          ["Para quién es", servicio.para_quien_es],
          ["Para quién NO es", servicio.para_quien_no_es],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label as string}>
            <span className="font-medium text-muted-foreground">{label}: </span>
            <span>{value as string}</span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground pt-1">
          Para editar descripción y ficha, ve a{" "}
          <Link href="/admin/conocimiento" className="text-primary hover:underline">Base de Conocimiento</Link>.
        </p>
      </div>

      {/* Precios */}
      <PreciosCard
        servicioId={id}
        precioCentavos={servicio.precio_centavos}
        precioDescuentoCentavos={servicio.precio_descuento_centavos}
      />

      {/* Bundle rules */}
      <BundleRulesCard servicioId={id} reglas={reglas} otrosServicios={otrosServicios} />

      {/* Imágenes */}
      <ImagenesCard servicioId={id} imagenes={imagenes} />

      {/* Pagos */}
      {pagos.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Links de pago</h3>
          {pagos.map((p) => (
            <div key={p.id} className={`flex items-center justify-between text-sm rounded border px-3 py-2 ${!p.activo ? "opacity-50" : ""}`}>
              <div>
                <Badge variant="outline" className="text-xs mr-2">{p.tipo}</Badge>
                <span className="text-muted-foreground text-xs">{p.descripcion}</span>
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Abrir</a>
            </div>
          ))}
        </div>
      )}

      {/* Brochures */}
      {brochures.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Brochures</h3>
          {brochures.map((b) => (
            <div key={b.id} className={`flex items-center justify-between text-sm ${!b.activo ? "opacity-50" : ""}`}>
              <span>{b.titulo}</span>
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Ver PDF</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
