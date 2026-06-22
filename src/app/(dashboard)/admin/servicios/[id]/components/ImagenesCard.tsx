"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toggleImagenActivaAction, eliminarImagenAction } from "../../actions";
import type { ImagenServicio, CanalImagen } from "@/services/imagen-servicio";

const CANAL_LABELS: Record<CanalImagen, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  landing: "Landing",
};

const CANAL_DIMS: Record<CanalImagen, string> = {
  whatsapp: "1080×1080 px",
  email: "600×400 px",
  landing: "1200×630 px",
};

interface Props { servicioId: string; imagenes: ImagenServicio[] }

export function ImagenesCard({ servicioId, imagenes }: Props) {
  const [pending, startTransition] = useTransition();
  const [canal, setCanal] = useState<CanalImagen>("whatsapp");
  const [etiqueta, setEtiqueta] = useState("");
  const [uploading, setUploading] = useState(false);

  const por_canal = (c: CanalImagen) => imagenes.filter((i) => i.canal_uso === c);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const tid = toast.loading("Subiendo imagen…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("canal", canal);
      if (etiqueta) fd.append("etiqueta", etiqueta);
      const res = await fetch(`/api/admin/servicios/${servicioId}/imagenes`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      toast.success("Imagen subida", { id: tid });
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir", { id: tid });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Repositorio de imágenes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Upload */}
        <div className="rounded-md border border-dashed p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subir nueva imagen</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Canal</label>
              <select value={canal} onChange={(e) => setCanal(e.target.value as CanalImagen)}
                className="text-sm border rounded-md px-3 py-1.5 bg-background">
                {(Object.keys(CANAL_LABELS) as CanalImagen[]).map((c) => (
                  <option key={c} value={c}>{CANAL_LABELS[c]} — {CANAL_DIMS[c]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Etiqueta (opcional)</label>
              <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}
                placeholder="ej. campaña Q1"
                className="text-sm border rounded-md px-3 py-1.5 bg-background w-40" />
            </div>
            <label className={`cursor-pointer text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground font-medium ${uploading ? "opacity-50 pointer-events-none" : "hover:bg-primary/90"}`}>
              {uploading ? "Subiendo…" : "Elegir archivo"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Grillas por canal */}
        {(Object.keys(CANAL_LABELS) as CanalImagen[]).map((c) => {
          const imgs = por_canal(c);
          if (imgs.length === 0) return null;
          return (
            <div key={c} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {CANAL_LABELS[c]} — {CANAL_DIMS[c]}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {imgs.map((img) => (
                  <div key={img.id} className={`rounded-lg border overflow-hidden ${!img.activa ? "opacity-50" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url_publica} alt={img.etiqueta ?? img.canal_uso} className="w-full aspect-square object-cover" />
                    <div className="p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Badge variant={img.activa ? "default" : "outline"} className="text-[10px]">
                          {img.activa ? "Activa" : "Inactiva"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {(img.score_conversion * 100).toFixed(1)}% conv.
                        </span>
                      </div>
                      {img.etiqueta && <p className="text-[10px] text-muted-foreground truncate">{img.etiqueta}</p>}
                      <div className="flex gap-1">
                        <button
                          disabled={pending}
                          onClick={() => {
                            const tid = toast.loading(img.activa ? "Desactivando…" : "Activando…");
                            startTransition(async () => {
                              try {
                                await toggleImagenActivaAction(img.id, !img.activa, servicioId);
                                toast.success(img.activa ? "Desactivada" : "Activada", { id: tid });
                              } catch { toast.error("Error", { id: tid }); }
                            });
                          }}
                          className="flex-1 text-[10px] rounded border px-1 py-0.5 hover:bg-muted disabled:opacity-50"
                        >
                          {img.activa ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => {
                            if (!confirm("¿Eliminar esta imagen permanentemente?")) return;
                            const tid = toast.loading("Eliminando…");
                            startTransition(async () => {
                              try {
                                await eliminarImagenAction(img.id, img.storage_path, servicioId);
                                toast.success("Eliminada", { id: tid });
                              } catch { toast.error("Error", { id: tid }); }
                            });
                          }}
                          className="text-[10px] rounded border px-1 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {imagenes.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin imágenes aún. Sube la primera con el formulario de arriba.</p>
        )}
      </CardContent>
    </Card>
  );
}
