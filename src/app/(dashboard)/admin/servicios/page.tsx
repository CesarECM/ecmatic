import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { NuevoServicioForm } from "./NuevoServicioForm";

export const metadata = { title: "Servicios · ECMatic" };
export const revalidate = 0;

const fmt = (c: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(c / 100);

export default async function ServiciosPage() {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: servicios }, { data: imagenes }, { data: brochures }] = await Promise.all([
    (supabase as any)
      .from("recursos_conocimiento")
      .select("id, titulo, contenido, score_uso, precio_centavos, precio_descuento_centavos, activo, aprobado")
      .eq("tipo", "servicio")
      .order("score_uso", { ascending: false }),
    supabase.from("imagenes_servicio").select("servicio_id").eq("activa", true),
    supabase.from("brochures").select("recurso_id").eq("activo", true),
  ]);

  const imgCount = new Map<string, number>();
  (imagenes ?? []).forEach((img: { servicio_id: string }) => {
    imgCount.set(img.servicio_id, (imgCount.get(img.servicio_id) ?? 0) + 1);
  });

  const brCount = new Map<string, number>();
  (brochures ?? []).forEach((b: { recurso_id: string | null }) => {
    if (b.recurso_id) brCount.set(b.recurso_id, (brCount.get(b.recurso_id) ?? 0) + 1);
  });

  const lista = (servicios ?? []) as {
    id: string; titulo: string; contenido: string; score_uso: number;
    precio_centavos: number | null; precio_descuento_centavos: number | null;
    activo: boolean; aprobado: boolean;
  }[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servicios</h1>
          <p className="text-sm text-muted-foreground">{lista.length} servicio{lista.length !== 1 ? "s" : ""} en catálogo</p>
        </div>
        <NuevoServicioForm />
      </div>

      {lista.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay servicios aún. Crea el primero con el botón de arriba.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {lista.map((s) => {
          const imgs = imgCount.get(s.id) ?? 0;
          const brs = brCount.get(s.id) ?? 0;
          return (
            <Link
              key={s.id}
              href={`/admin/servicios/${s.id}`}
              className="block rounded-lg border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-sm leading-snug line-clamp-2">{s.titulo}</h3>
                <div className="flex gap-1 shrink-0">
                  {!s.aprobado && <Badge variant="secondary" className="text-xs">Pendiente</Badge>}
                  {!s.activo && <Badge variant="outline" className="text-xs">Inactivo</Badge>}
                </div>
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2">{s.contenido}</p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-muted-foreground mb-0.5">Precio lista</p>
                  <p className="font-semibold">{s.precio_centavos ? fmt(s.precio_centavos) : "—"}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-muted-foreground mb-0.5">Descuento</p>
                  <p className={`font-semibold ${s.precio_descuento_centavos ? "text-green-600" : ""}`}>
                    {s.precio_descuento_centavos ? fmt(s.precio_descuento_centavos) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground border-t pt-2">
                <span className="flex items-center gap-1">🔄 {s.score_uso} usos</span>
                <span>·</span>
                <span className="flex items-center gap-1">🖼️ {imgs} imgs</span>
                <span>·</span>
                <span className="flex items-center gap-1">📄 {brs} brochures</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
