"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actualizarDatosGeneralesAction } from "../../actions";
import type { Servicio } from "@/services/servicios";

export function DatosGeneralesCard({ servicio }: { servicio: Servicio }) {
  const [pending, startTransition] = useTransition();
  const [modoDirecto, setModoDirecto] = useState(servicio.modo_venta === "directo");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", servicio.id);
    fd.set("activo", String((e.currentTarget.querySelector("[name=activo]") as HTMLInputElement)?.checked ?? servicio.activo));
    fd.set("conocer_habilitado", String((e.currentTarget.querySelector("[name=conocer_habilitado]") as HTMLInputElement)?.checked ?? servicio.conocer_habilitado));
    fd.set("modo_venta", modoDirecto ? "directo" : "meet");
    const tid = toast.loading("Guardando…");
    startTransition(async () => {
      try {
        await actualizarDatosGeneralesAction(fd);
        toast.success("Cambios guardados", { id: tid });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error", { id: tid });
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Datos generales</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Identificación */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificación</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs text-muted-foreground">Nombre del servicio *</label>
                <Input name="titulo" defaultValue={servicio.titulo} required />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Icono (emoji)</label>
                <Input name="icono" defaultValue={servicio.icono ?? ""} placeholder="🎓" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Descripción principal *</label>
              <Textarea name="contenido" defaultValue={servicio.contenido} required rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Color de marca (hex)</label>
                <div className="flex gap-2">
                  <input type="color" name="color_marca" defaultValue={servicio.color_marca ?? "#6366f1"} className="h-9 w-12 rounded border cursor-pointer" />
                  <Input name="color_marca_text" defaultValue={servicio.color_marca ?? ""} placeholder="#6366f1" className="flex-1 text-xs" readOnly />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Orden catálogo</label>
                <Input name="orden_catalogo" type="number" min={0} defaultValue={servicio.orden_catalogo ?? ""} placeholder="0" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" name="activo" defaultChecked={servicio.activo} className="rounded" />
                Activo (visible en catálogo)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={modoDirecto}
                  onChange={(e) => setModoDirecto(e.target.checked)}
                  className="rounded"
                />
                La IA puede cerrar esta venta directamente por mensaje (sin videollamada)
              </label>
              {!modoDirecto && (
                <p className="text-xs text-muted-foreground pl-6">
                  Modo Meet: la IA siempre invita a una videollamada de diagnóstico con un asesor.
                </p>
              )}
            </div>
          </div>

          {/* CONOCER */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estándar CONOCER</p>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" name="conocer_habilitado" defaultChecked={servicio.conocer_habilitado} className="rounded" />
                Habilitado
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Código del estándar</label>
                <Input name="estandar_conocer" defaultValue={servicio.estandar_conocer ?? ""} placeholder="EC0217.01" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nivel (1–5)</label>
                <Input name="nivel_estandar" type="number" min={1} max={5} defaultValue={servicio.nivel_estandar ?? ""} placeholder="1" />
              </div>
            </div>
          </div>

          {/* SEO y URL */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Landing & SEO</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Slug (URL)</label>
                <Input name="slug" defaultValue={servicio.slug ?? ""} placeholder="evaluacion-ec0217" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">URL landing propia</label>
                <Input name="url_landing_propia" defaultValue={servicio.url_landing_propia ?? ""} placeholder="https://..." />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Meta título (SEO)</label>
              <Input name="meta_title" defaultValue={servicio.meta_title ?? ""} placeholder="Título para buscadores" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Meta descripción (SEO)</label>
              <Textarea name="meta_descripcion" defaultValue={servicio.meta_descripcion ?? ""} rows={2} placeholder="Descripción para buscadores…" />
            </div>
          </div>

          <Button type="submit" size="sm" disabled={pending}>Guardar cambios</Button>
        </form>
      </CardContent>
    </Card>
  );
}
