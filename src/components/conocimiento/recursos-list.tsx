"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  crearRecursoAction,
  aprobarRecursoAction,
  setActivoAction,
} from "@/app/(dashboard)/admin/conocimiento/actions";

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

export function RecursosList({ recursos }: { recursos: RecursoRow[] }) {
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const filtrados = recursos.filter((r) => {
    if (filtroTipo !== "todos" && r.tipo !== filtroTipo) return false;
    if (soloPendientes && r.aprobado) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Barra de filtros y acción */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="text-sm border rounded-md px-3 py-1.5 bg-background"
          >
            <option value="todos">Todos los tipos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
            />
            Solo pendientes
          </label>
        </div>
        <Button size="sm" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? "Cancelar" : "+ Nuevo recurso"}
        </Button>
      </div>

      {/* Formulario de creación */}
      {mostrarForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nuevo recurso</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={async (fd) => {
                await crearRecursoAction(fd);
                setMostrarForm(false);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="tipo">Tipo</Label>
                  <select name="tipo" id="tipo" required className="w-full text-sm border rounded-md px-3 py-1.5 bg-background">
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="titulo">Título</Label>
                  <Input id="titulo" name="titulo" required placeholder="Título del recurso" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="contenido">Contenido</Label>
                <Textarea id="contenido" name="contenido" required rows={4} placeholder="Contenido completo del recurso..." />
              </div>
              <Button type="submit" size="sm">Crear y aprobar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de recursos */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay recursos con estos filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((r) => (
            <Card key={r.id} className={!r.activo ? "opacity-50" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_COLORS[r.tipo] ?? "bg-gray-100 text-gray-800"}`}>
                      {TIPOS.find((t) => t.value === r.tipo)?.label ?? r.tipo}
                    </span>
                    {!r.aprobado && <Badge variant="secondary">Pendiente</Badge>}
                    {!r.activo && <Badge variant="outline">Inactivo</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    score {(r.score_confianza * 100).toFixed(0)}% · {r.score_uso} usos
                  </span>
                </div>
                <CardTitle
                  className="text-sm font-medium cursor-pointer hover:text-primary"
                  onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                >
                  {r.titulo}
                </CardTitle>
              </CardHeader>

              {expandido === r.id && (
                <CardContent className="pt-0 space-y-3">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.contenido}</p>
                  <div className="flex gap-2">
                    {!r.aprobado && (
                      <form action={aprobarRecursoAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" size="sm">Aprobar</Button>
                      </form>
                    )}
                    <form action={setActivoAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="activo" value={String(!r.activo)} />
                      <Button type="submit" size="sm" variant="outline">
                        {r.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </form>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
