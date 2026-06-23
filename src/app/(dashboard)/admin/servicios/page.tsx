import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listarServicios } from "@/services/servicios";
import { NuevoServicioForm } from "./NuevoServicioForm";
import { RegenerarTodosBtn } from "./RegenerarTodosBtn";
import { createServiceClient } from "@/lib/supabase/service";
import { AuditorIABtn } from "@/components/ui/auditor-ia-btn";

export const metadata = { title: "Servicios · ECMatic" };
export const revalidate = 0;

const fmt = (c: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(c / 100);

export default async function ServiciosPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const [servicios, { data: imagenes }, { data: brochures }, { data: sugerencias }] = await Promise.all([
    listarServicios(),
    supabase.from("imagenes_servicio").select("servicio_id").eq("activa", true),
    supabase.from("brochures").select("servicio_id").eq("activo", true).not("servicio_id", "is", null),
    supabase.from("sugerencias_ia").select("servicio_id").is("aprobado", null).not("servicio_id", "is", null),
  ]);

  const imgCount      = new Map<string, number>();
  const brCount       = new Map<string, number>();
  const pendientesMap = new Map<string, number>();

  (imagenes   ?? []).forEach((r: { servicio_id: string }) => imgCount.set(r.servicio_id, (imgCount.get(r.servicio_id) ?? 0) + 1));
  (brochures  ?? []).forEach((r: { servicio_id: string }) => brCount.set(r.servicio_id, (brCount.get(r.servicio_id) ?? 0) + 1));
  (sugerencias ?? []).forEach((r: { servicio_id: string }) => pendientesMap.set(r.servicio_id, (pendientesMap.get(r.servicio_id) ?? 0) + 1));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Servicios</h1>
          <p className="text-sm text-muted-foreground">
            {servicios.length} servicio{servicios.length !== 1 ? "s" : ""} en catálogo ·{" "}
            <Link href="/admin/servicios/auditoria" className="text-primary hover:underline">
              Ver auditoría IA →
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RegenerarTodosBtn total={servicios.length} />
          <NuevoServicioForm />
        </div>
      </div>

      {servicios.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay servicios aún. Crea el primero con el botón de arriba.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {servicios.map((s) => {
          const imgs   = imgCount.get(s.id) ?? 0;
          const brs    = brCount.get(s.id)  ?? 0;
          const ahorro = s.precio_centavos && s.precio_descuento_centavos
            ? Math.round((1 - s.precio_descuento_centavos / s.precio_centavos) * 100)
            : null;

          return (
            <div key={s.id} className="relative">
              <Link
                href={`/admin/servicios/${s.id}`}
                className="block rounded-lg border bg-card p-4 pr-10 hover:border-primary/40 hover:shadow-sm transition-all space-y-3"
                style={s.color_marca ? { borderLeftColor: s.color_marca, borderLeftWidth: 3 } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {s.icono && <span className="shrink-0 text-lg leading-none">{s.icono}</span>}
                    <h3 className="font-medium text-sm leading-snug line-clamp-2">{s.titulo}</h3>
                  </div>
                  <div className="flex gap-1 shrink-0 mr-1">
                    {!s.activo    && <Badge variant="outline" className="text-xs">Inactivo</Badge>}
                    {s.estandar_conocer && s.conocer_habilitado && (
                      <Badge variant="secondary" className="text-xs">{s.estandar_conocer}</Badge>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2">{s.contenido}</p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-muted-foreground mb-0.5">Precio lista</p>
                    <p className="font-semibold">{s.precio_centavos ? fmt(s.precio_centavos) : "—"}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-muted-foreground mb-0.5">Con descuento</p>
                    <p className={`font-semibold ${s.precio_descuento_centavos ? "text-green-600" : ""}`}>
                      {s.precio_descuento_centavos ? (
                        <>{fmt(s.precio_descuento_centavos)}{ahorro ? <span className="text-[10px] ml-1">−{ahorro}%</span> : null}</>
                      ) : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 text-xs text-muted-foreground border-t pt-2">
                  <span>🔄 {s.score_uso} usos</span>
                  <span>·</span>
                  <span>🖼️ {imgs} imgs</span>
                  <span>·</span>
                  <span>📄 {brs} brochures</span>
                  {s.modalidad && <><span>·</span><span>📍 {s.modalidad.replace("_", " ")}</span></>}
                </div>
              </Link>

              <AuditorIABtn
                tipo="servicio"
                id={s.id}
                nombre={s.titulo}
                pendientesIniciales={pendientesMap.get(s.id) ?? 0}
                className="absolute top-2 right-2 z-10"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
