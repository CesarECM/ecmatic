"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const NAMESPACES = [
  {
    ns: "svc",
    label: "Servicio de interés",
    modo: "Additive",
    escritor: "ECMatic / Admin",
    descripcion: "El lead mostró interés en este servicio",
    ejemplos: ["svc-smec", "svc-ecb1", "svc-taller"],
    valores: ["smec", "ecb1", "taller"],
  },
  {
    ns: "int",
    label: "Intención / temperatura",
    modo: "Reemplazar (solo uno activo)",
    escritor: "ECMatic automático",
    descripcion: "Nivel de calor del lead en este momento",
    ejemplos: ["int-caliente", "int-tibio", "int-frio", "int-perdido"],
    valores: ["caliente", "tibio", "frio", "perdido"],
  },
  {
    ns: "obj",
    label: "Objeción detectada",
    modo: "Additive",
    escritor: "ECMatic automático",
    descripcion: "Objeciones que ha expresado el lead",
    ejemplos: ["obj-precio", "obj-tiempo", "obj-utilidad", "obj-confianza", "obj-empresa"],
    valores: ["precio", "tiempo", "utilidad", "confianza", "empresa"],
  },
  {
    ns: "per",
    label: "Perfil del lead",
    modo: "Set once",
    escritor: "ECMatic (inferencia DISC)",
    descripcion: "Características permanentes del lead",
    ejemplos: ["per-disc-d", "per-disc-i", "per-disc-s", "per-disc-c", "per-b2c", "per-pyme", "per-corp"],
    valores: ["disc-d", "disc-i", "disc-s", "disc-c", "b2c", "pyme", "corp"],
  },
  {
    ns: "evt",
    label: "Evento con fecha",
    modo: "Additive, nunca borrar",
    escritor: "ECMatic automático",
    descripcion: "Hitos del lead. Agregar YYYYMM al final",
    ejemplos: ["evt-contacto-202607", "evt-cotizado-202607", "evt-demo-202607", "evt-pago-202607"],
    valores: ["contacto", "cotizado", "demo", "pago"],
    conFecha: true,
  },
  {
    ns: "flg",
    label: "Flag de comportamiento",
    modo: "Additive",
    escritor: "Admin + flujos GHL",
    descripcion: "Flags especiales de operación",
    ejemplos: ["flg-cliente", "flg-referidor", "flg-vip", "flg-no-contactar", "flg-wa-biz"],
    valores: ["cliente", "referidor", "vip", "no-contactar", "wa-biz"],
  },
  {
    ns: "ofr",
    label: "Oferta habilitada",
    modo: "Additive",
    escritor: "Solo admin — nunca automático",
    descripcion: "El admin decidió ofrecer este producto a este lead (distinto de svc: aquí la iniciativa es del admin)",
    ejemplos: ["ofr-sm2"],
    valores: ["sm2"],
  },
];

function ChipTag({ tag, onClick }: { tag: string; onClick: (t: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(tag)}
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-muted hover:bg-primary/10 hover:text-primary transition-colors border border-transparent hover:border-primary/20"
    >
      {tag}
    </button>
  );
}

export function TagBuilder() {
  const [abierto, setAbierto] = useState(false);
  const [nsSeleccionado, setNsSeleccionado] = useState("");
  const [valor, setValor] = useState("");
  const [copiado, setCopiado] = useState(false);

  const ns = NAMESPACES.find(n => n.ns === nsSeleccionado);
  const tagFinal = nsSeleccionado && valor.trim()
    ? `${nsSeleccionado}-${valor.trim().toLowerCase().replace(/\s+/g, "-")}`
    : "";

  function copiar() {
    if (!tagFinal) return;
    navigator.clipboard.writeText(tagFinal).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  function usarEjemplo(tag: string) {
    const partes = tag.split("-");
    const namespace = partes[0];
    const val = partes.slice(1).join("-");
    setNsSeleccionado(namespace);
    setValor(val);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {abierto ? "Ocultar referencia de etiquetas GHL ↑" : "Ver referencia de etiquetas GHL →"}
      </button>

      {abierto && (
        <Card className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Constructor de etiquetas GHL</CardTitle>
            <p className="text-xs text-muted-foreground">
              Formato: <code className="bg-muted px-1 rounded">{"{namespace}-{valor}"}</code> · 7 namespaces aprobados · separador siempre guion
            </p>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Constructor interactivo */}
            <div className="flex gap-2 items-end flex-wrap p-3 bg-muted/40 rounded-lg">
              <div className="space-y-1">
                <p className="text-xs font-medium">Namespace</p>
                <select
                  value={nsSeleccionado}
                  onChange={e => { setNsSeleccionado(e.target.value); setValor(""); }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Seleccionar...</option>
                  {NAMESPACES.map(n => (
                    <option key={n.ns} value={n.ns}>{n.ns} — {n.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Valor</p>
                <Input
                  value={valor}
                  onChange={e => setValor(e.target.value)}
                  placeholder="sm2, caliente, precio..."
                  className="h-8 text-xs w-40"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Resultado</p>
                <div className="flex items-center gap-1.5">
                  <code className={`px-2 py-1 rounded text-sm font-mono border ${tagFinal ? "bg-primary/5 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"}`}>
                    {tagFinal || "namespace-valor"}
                  </code>
                  {tagFinal && (
                    <Button size="sm" variant="outline" onClick={copiar} className="h-7 text-xs">
                      {copiado ? "✓" : "Copiar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {ns && (
              <div className="text-xs text-muted-foreground space-y-1 px-1">
                <p><span className="font-medium text-foreground">{ns.label}:</span> {ns.descripcion}</p>
                <p>Modo: <span className="font-medium">{ns.modo}</span> · Escritor: {ns.escritor}</p>
                {ns.conFecha && (
                  <p className="text-amber-600">Agregar YYYYMM al final del valor. Ej: <code>evt-demo-202607</code></p>
                )}
                <div className="flex gap-1 flex-wrap mt-1">
                  <span className="text-muted-foreground">Valores frecuentes:</span>
                  {ns.ejemplos.map(e => (
                    <ChipTag key={e} tag={e} onClick={usarEjemplo} />
                  ))}
                </div>
              </div>
            )}

            {/* Tabla de referencia rápida */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left font-medium">Namespace</th>
                    <th className="px-3 py-2 text-left font-medium">Uso</th>
                    <th className="px-3 py-2 text-left font-medium">Modo</th>
                    <th className="px-3 py-2 text-left font-medium">Ejemplos</th>
                  </tr>
                </thead>
                <tbody>
                  {NAMESPACES.map((n, i) => (
                    <tr
                      key={n.ns}
                      className={`border-b last:border-0 cursor-pointer hover:bg-muted/30 ${nsSeleccionado === n.ns ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/20"}`}
                      onClick={() => { setNsSeleccionado(n.ns); setValor(""); }}
                    >
                      <td className="px-3 py-2">
                        <code className="font-mono font-semibold">{n.ns}-</code>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{n.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">{n.modo.split(" ")[0]}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {n.ejemplos.slice(0, 3).map(e => (
                            <ChipTag key={e} tag={e} onClick={usarEjemplo} />
                          ))}
                          {n.ejemplos.length > 3 && (
                            <span className="text-muted-foreground">+{n.ejemplos.length - 3}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>
      )}
    </div>
  );
}
