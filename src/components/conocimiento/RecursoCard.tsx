"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  aprobarRecursoAction,
  setActivoAction,
  editarRecursoAction,
  restaurarVersionAction,
  eliminarRecursoAction,
} from "@/app/(dashboard)/admin/conocimiento/actions";
import { AuditorIABtn } from "@/components/ui/auditor-ia-btn";

type Version = { titulo: string; contenido: string; fecha: string };

export type RecursoRow = {
  id: string;
  tipo: string;
  titulo: string;
  contenido: string;
  score_confianza: number;
  score_uso: number;
  aprobado: boolean;
  activo: boolean;
  origen: string;
  created_at: string;
  versiones_previas: unknown[];
  // S22.4 — Ficha de servicio enriquecida
  caracteristicas?: string | null;
  beneficios?: string | null;
  ventajas?: string | null;
  para_quien_es?: string | null;
  para_quien_no_es?: string | null;
};

const TIPOS = [
  { value: "faq", label: "FAQ" },
  { value: "objecion", label: "Objeción" },
  { value: "servicio", label: "Servicio" },
  { value: "template_wa", label: "Template WA" },
  { value: "template_email", label: "Template Email" },
  { value: "practica_venta", label: "Práctica de venta" },
] as const;

const TIPO_COLORS: Record<string, string> = {
  faq: "bg-blue-100 text-blue-800",
  objecion: "bg-orange-100 text-orange-800",
  servicio: "bg-green-100 text-green-800",
  template_wa: "bg-purple-100 text-purple-800",
  template_email: "bg-pink-100 text-pink-800",
  practica_venta: "bg-yellow-100 text-yellow-800",
};

function HistorialVersiones({ id, versiones }: { id: string; versiones: Version[] }) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();

  if (versiones.length === 0) return null;

  return (
    <div className="border-t pt-2">
      <button
        onClick={() => setAbierto(!abierto)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        {abierto ? "▲" : "▼"} {versiones.length} versión{versiones.length > 1 ? "es" : ""} anterior{versiones.length > 1 ? "es" : ""}
      </button>
      {abierto && (
        <div className="mt-2 space-y-2">
          {[...versiones].reverse().map((v, i) => (
            <div key={i} className="rounded border bg-muted/40 p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{v.titulo}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{new Date(v.fecha).toLocaleDateString("es-MX")}</span>
                  <button
                    disabled={pending}
                    onClick={() => {
                      const tid = toast.loading("Restaurando versión...");
                      startTransition(async () => {
                        try {
                          await restaurarVersionAction(id, v.titulo, v.contenido);
                          toast.success("Versión restaurada", { id: tid });
                        } catch {
                          toast.error("Error al restaurar", { id: tid });
                        }
                      });
                    }}
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                </div>
              </div>
              <p className="text-muted-foreground line-clamp-2">{v.contenido}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecursoCard({ r }: { r: RecursoRow }) {
  const [expandido, setExpandido] = useState(false);
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  const versiones = (r.versiones_previas ?? []) as Version[];

  function confirmarEliminar() {
    if (!confirm(`¿Eliminar "${r.titulo}" permanentemente?`)) return;
    const tid = toast.loading("Eliminando...");
    startTransition(async () => {
      try {
        await eliminarRecursoAction(r.id);
        toast.success("Recurso eliminado", { id: tid });
      } catch {
        toast.error("Error al eliminar", { id: tid });
      }
    });
  }

  return (
    <Card className={!r.activo ? "opacity-50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_COLORS[r.tipo] ?? "bg-gray-100 text-gray-800"}`}>
              {TIPOS.find((t) => t.value === r.tipo)?.label ?? r.tipo}
            </span>
            {!r.aprobado && <Badge variant="secondary">Pendiente</Badge>}
            {!r.activo && <Badge variant="outline">Inactivo</Badge>}
            {versiones.length > 0 && (
              <span className="text-xs text-muted-foreground">{versiones.length}v</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              score {(r.score_confianza * 100).toFixed(0)}% · {r.score_uso} usos
            </span>
            <AuditorIABtn tipo="kb" id={r.id} nombre={r.titulo} />
          </div>
        </div>
        <CardTitle
          className="text-sm font-medium cursor-pointer hover:text-primary"
          onClick={() => { setExpandido(!expandido); setEditando(false); }}
        >
          {r.titulo}
        </CardTitle>
      </CardHeader>

      {expandido && (
        <CardContent className="pt-0 space-y-3">
          {editando ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const tid = toast.loading("Guardando...");
                startTransition(async () => {
                  try {
                    await editarRecursoAction(fd);
                    toast.success("Versión guardada", { id: tid });
                    setEditando(false);
                  } catch {
                    toast.error("Error al guardar", { id: tid });
                  }
                });
              }}
              className="space-y-2"
            >
              <input type="hidden" name="id" value={r.id} />
              <div className="space-y-1">
                <Label htmlFor={`titulo-${r.id}`} className="text-xs">Título</Label>
                <Input id={`titulo-${r.id}`} name="titulo" defaultValue={r.titulo} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`contenido-${r.id}`} className="text-xs">Contenido</Label>
                <Textarea id={`contenido-${r.id}`} name="contenido" defaultValue={r.contenido} required rows={5} />
              </div>
              {r.tipo === "servicio" && (
                <div className="space-y-2 border-t pt-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ficha de servicio</p>
                  {(["caracteristicas","beneficios","ventajas","para_quien_es","para_quien_no_es"] as const).map((campo) => (
                    <div key={campo} className="space-y-1">
                      <Label className="text-xs">{campo.replace(/_/g, " ")}</Label>
                      <Textarea name={campo} defaultValue={r[campo] ?? ""} rows={2} placeholder={`${campo.replace(/_/g, " ")}…`} />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm">Guardar versión</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.contenido}</p>
              {r.tipo === "servicio" && (r.caracteristicas || r.beneficios || r.ventajas || r.para_quien_es || r.para_quien_no_es) && (
                <div className="border-t pt-2 space-y-1.5 text-xs">
                  {([["caracteristicas","Características"],["beneficios","Beneficios"],["ventajas","Ventajas"],["para_quien_es","Para quién es"],["para_quien_no_es","Para quién NO es"]] as const).map(([k, label]) =>
                    r[k] ? <div key={k}><span className="font-medium text-muted-foreground">{label}: </span>{r[k]}</div> : null
                  )}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {!r.aprobado && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const tid = toast.loading("Aprobando...");
                      const fd = new FormData();
                      fd.set("id", r.id);
                      startTransition(async () => {
                        try {
                          await aprobarRecursoAction(fd);
                          toast.success("Recurso aprobado", { id: tid });
                        } catch {
                          toast.error("Error al aprobar", { id: tid });
                        }
                      });
                    }}
                  >
                    Aprobar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    const label = r.activo ? "Desactivando..." : "Activando...";
                    const successMsg = r.activo ? "Recurso desactivado" : "Recurso activado";
                    const tid = toast.loading(label);
                    const fd = new FormData();
                    fd.set("id", r.id);
                    fd.set("activo", String(!r.activo));
                    startTransition(async () => {
                      try {
                        await setActivoAction(fd);
                        toast.success(successMsg, { id: tid });
                      } catch {
                        toast.error("Error al cambiar estado", { id: tid });
                      }
                    });
                  }}
                >
                  {r.activo ? "Desactivar" : "Activar"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={confirmarEliminar}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50">
                  Eliminar
                </Button>
              </div>
            </>
          )}
          <HistorialVersiones id={r.id} versiones={versiones} />
        </CardContent>
      )}
    </Card>
  );
}
