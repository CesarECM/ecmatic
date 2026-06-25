"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToqueCard } from "@/components/protocolos/toque-card";
import { ProtocoloTimeline } from "@/components/protocolos/protocolo-timeline";
import { CriteriosTable } from "@/components/protocolos/criterios-table";
import { EtiquetasTable } from "@/components/protocolos/etiquetas-table";
import {
  actualizarProtocoloAction, toggleActivoAction, eliminarProtocoloAction, upsertToqueAction,
  copiarProtocoloAction,
} from "@/app/(dashboard)/admin/protocolos/actions";
import type { ProtocoloCompleto, Toque } from "@/services/protocolos-seguimiento";
import type { EtapaOpcion } from "../page";

const SECTION_BTN = "w-full flex items-center justify-between text-sm font-semibold py-2 hover:text-primary transition-colors";

interface Props {
  protocolo: ProtocoloCompleto;
  etapas: EtapaOpcion[];
}

export function ProtocoloBuilder({ protocolo, etapas }: Props) {
  const [secciones, setSecciones] = useState({ config: true, toques: true, criterios: false, etiquetas: false });
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [agregandoToque, setAgregandoToque] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function toggle(s: keyof typeof secciones) {
    setSecciones((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  async function handleGuardarConfig(fd: FormData) {
    setGuardandoConfig(true);
    fd.append("id", protocolo.id);
    await actualizarProtocoloAction(fd);
    setGuardandoConfig(false);
  }

  async function handleToggleActivo() {
    setToggling(true);
    await toggleActivoAction(protocolo.id, !protocolo.activo);
    setToggling(false);
  }

  async function handleEliminarProtocolo() {
    if (!confirm(`¿Eliminar el protocolo "${protocolo.nombre}"? Esta acción no se puede deshacer.`)) return;
    await eliminarProtocoloAction(protocolo.id);
  }

  async function handleNuevoToque(fd: FormData) {
    fd.append("protocolo_id", protocolo.id);
    const maxOrden = protocolo.toques.length ? Math.max(...protocolo.toques.map((t) => t.orden)) : 0;
    fd.append("orden", String(maxOrden + 1));
    await upsertToqueAction(fd);
    setAgregandoToque(false);
  }

  async function handleCopiar(fd: FormData) {
    setCopiando(true);
    fd.append("id", protocolo.id);
    await copiarProtocoloAction(fd);
  }

  const sortedToques = [...protocolo.toques].sort((a, b) => a.orden - b.orden);

  const etapaActual = etapas.find((e) => e.id === protocolo.etapa_id);

  // Agrupar etapas por ruta para el select
  const etapasPorRuta = etapas.reduce<Record<string, EtapaOpcion[]>>((acc, e) => {
    if (!acc[e.ruta]) acc[e.ruta] = [];
    acc[e.ruta].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Acciones rápidas */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={protocolo.activo ? "outline" : "default"}
          disabled={toggling}
          onClick={handleToggleActivo}
        >
          {toggling ? "…" : protocolo.activo ? "Desactivar protocolo" : "Activar protocolo"}
        </Button>
        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 ml-auto" onClick={handleEliminarProtocolo}>
          Eliminar protocolo
        </Button>
      </div>

      {/* ① Config general */}
      <Card>
        <CardHeader className="py-3 px-4">
          <button className={SECTION_BTN} onClick={() => toggle("config")}>
            <span>① Configuración general</span>
            <span className="text-muted-foreground text-xs">{secciones.config ? "▲" : "▼"}</span>
          </button>
        </CardHeader>
        {secciones.config && (
          <CardContent className="pt-0 pb-4">
            <form action={handleGuardarConfig} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nombre</label>
                  <input name="nombre" defaultValue={protocolo.nombre} required className="w-full text-sm border rounded px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Etapa que activa el enroll automático
                    {etapaActual && (
                      <Badge className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200">
                        {etapaActual.nombre}
                      </Badge>
                    )}
                  </label>
                  <select
                    name="etapa_id"
                    defaultValue={protocolo.etapa_id ?? ""}
                    className="w-full text-sm border rounded px-2 py-1.5"
                  >
                    <option value="">— Sin etapa asignada —</option>
                    {Object.entries(etapasPorRuta).map(([ruta, etps]) => (
                      <optgroup key={ruta} label={ruta}>
                        {etps.map((e) => (
                          <option key={e.id} value={e.id}>{e.nombre}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Link de agendado [LINK]</label>
                  <input name="link_agendado" defaultValue={protocolo.link_agendado ?? ""} type="url" placeholder="https://calendar.google.com/..." className="w-full text-sm border rounded px-2 py-1.5" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Duración total (días)</label>
                  <input name="dias_duracion" type="number" min="1" defaultValue={protocolo.dias_duracion} className="w-full text-sm border rounded px-2 py-1.5" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Descripción</label>
                  <input name="descripcion" defaultValue={protocolo.descripcion ?? ""} className="w-full text-sm border rounded px-2 py-1.5" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Notas internas</label>
                  <textarea name="notas_internas" defaultValue={protocolo.notas_internas ?? ""} rows={2} className="w-full text-sm border rounded px-2 py-1.5" />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={guardandoConfig}>
                {guardandoConfig ? "Guardando…" : "Guardar configuración"}
              </Button>
            </form>

            {/* Copiar a otra etapa */}
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Copiar protocolo a otra etapa</p>
              <form action={handleCopiar} className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="text-xs text-muted-foreground">Etapa destino</label>
                  <select name="etapa_id" required className="w-full text-sm border rounded px-2 py-1.5">
                    <option value="">Seleccionar etapa…</option>
                    {Object.entries(etapasPorRuta).map(([ruta, etps]) => (
                      <optgroup key={ruta} label={ruta}>
                        {etps.map((e) => (
                          <option key={e.id} value={e.id}>{e.nombre}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={copiando}>
                  {copiando ? "Copiando…" : "Copiar como independiente →"}
                </Button>
              </form>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ② Timeline preview */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm text-muted-foreground">② Vista previa del flujo</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <ProtocoloTimeline toques={sortedToques} diasDuracion={protocolo.dias_duracion} />
        </CardContent>
      </Card>

      {/* ③ Constructor de toques */}
      <Card>
        <CardHeader className="py-3 px-4">
          <button className={SECTION_BTN} onClick={() => toggle("toques")}>
            <span>③ Toques <Badge className="ml-2 text-xs">{protocolo.toques.length}</Badge></span>
            <span className="text-muted-foreground text-xs">{secciones.toques ? "▲" : "▼"}</span>
          </button>
        </CardHeader>
        {secciones.toques && (
          <CardContent className="pt-0 pb-4 space-y-2">
            {sortedToques.map((toque: Toque) => (
              <ToqueCard
                key={`${toque.id}-${refreshKey}`}
                toque={toque}
                protocoloId={protocolo.id}
                todosLosToques={sortedToques}
                onReorder={() => setRefreshKey((k) => k + 1)}
              />
            ))}

            {agregandoToque ? (
              <Card className="border-dashed border-primary/40">
                <CardContent className="pt-3 pb-4">
                  <form action={handleNuevoToque} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Nuevo toque</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Nombre *</label>
                        <input name="nombre" required placeholder="ej. Toque 6 — Reactivación" className="w-full text-sm border rounded px-2 py-1.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Canal *</label>
                        <select name="canal" className="w-full text-sm border rounded px-2 py-1.5">
                          <option value="whatsapp">WhatsApp</option>
                          <option value="llamada">Llamada</option>
                          <option value="email">Email</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Día offset (0=día 1)</label>
                        <input name="dia_offset" type="number" min="0" defaultValue={protocolo.dias_duracion} className="w-full text-sm border rounded px-2 py-1.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Objetivo</label>
                        <input name="objetivo" className="w-full text-sm border rounded px-2 py-1.5" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Guión principal</label>
                      <textarea name="guion_principal" rows={3} className="w-full text-sm border rounded px-2 py-1.5 font-mono" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">Agregar toque</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setAgregandoToque(false)}>Cancelar</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAgregandoToque(true)}>+ Agregar toque</Button>
            )}
          </CardContent>
        )}
      </Card>

      {/* ④ Criterios de descarte */}
      <Card>
        <CardHeader className="py-3 px-4">
          <button className={SECTION_BTN} onClick={() => toggle("criterios")}>
            <span>④ Criterios de descarte <Badge className="ml-2 text-xs">{protocolo.criterios.length}</Badge></span>
            <span className="text-muted-foreground text-xs">{secciones.criterios ? "▲" : "▼"}</span>
          </button>
        </CardHeader>
        {secciones.criterios && (
          <CardContent className="pt-0 pb-4">
            <CriteriosTable criterios={protocolo.criterios} protocoloId={protocolo.id} />
          </CardContent>
        )}
      </Card>

      {/* ⑤ Etiquetas de diagnóstico */}
      <Card>
        <CardHeader className="py-3 px-4">
          <button className={SECTION_BTN} onClick={() => toggle("etiquetas")}>
            <span>⑤ Etiquetas de diagnóstico <Badge className="ml-2 text-xs">{protocolo.etiquetas.length}</Badge></span>
            <span className="text-muted-foreground text-xs">{secciones.etiquetas ? "▲" : "▼"}</span>
          </button>
        </CardHeader>
        {secciones.etiquetas && (
          <CardContent className="pt-0 pb-4">
            <EtiquetasTable etiquetas={protocolo.etiquetas} protocoloId={protocolo.id} />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
