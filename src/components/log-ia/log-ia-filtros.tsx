"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const TIPOS = [
  "CLASIFICAR","RESPUESTA","CONTEXTO","SETTER","OBJECION","DESCONFIANZA",
  "CAGC_INFERIR","SUGERIR_KB","ANALISIS","VISION","LEADMAGNET","CUALIFICACION",
  "SENALES","PAQUETE_SERVICIO","BRIEF_DISENO","CLUSTERING",
  "AUDITOR_SERVICIO","AUDITOR_PIPELINE","PAQUETE_SERVICIO_NUEVO",
];
const TIPO_LABEL: Record<string, string> = {
  CLASIFICAR:"Clasificar",    RESPUESTA:"Respuesta WA",   CONTEXTO:"Contexto",
  SETTER:"Setter",            OBJECION:"Objeción",        DESCONFIANZA:"Desconfianza",
  CAGC_INFERIR:"Fase CAGC",  SUGERIR_KB:"Sugerir KB",    ANALISIS:"Análisis",
  VISION:"Visión",            LEADMAGNET:"Leadmagnet",    CUALIFICACION:"Cualificación",
  SENALES:"Señales",          PAQUETE_SERVICIO:"Paquete", BRIEF_DISENO:"Brief",
  CLUSTERING:"Clustering",
  AUDITOR_SERVICIO:"🔍 Auditor Servicio", AUDITOR_PIPELINE:"🔀 Auditor Pipeline",
  PAQUETE_SERVICIO_NUEVO:"📦 Paquete Nuevo",
};
const FASES = ["llamado","peticion","respuesta","timeout","error","debug","warn"] as const;
const FASE_LABEL: Record<string, string> = {
  llamado:"Llamado", peticion:"Petición", respuesta:"Respuesta",
  timeout:"Timeout", error:"Error", debug:"Debug", warn:"Warn",
};

interface Props {
  tipo?: string; fase?: string; desde?: string; hasta?: string;
}

export function LogIAFiltros({ tipo: tInit = "", fase: fInit = "", desde: dInit = "", hasta: hInit = "" }: Props) {
  const router = useRouter();

  const [tipo,   setTipo]   = useState(tInit);
  const [fase,   setFase]   = useState(fInit);
  const [dFecha, setDFecha] = useState(dInit.split("T")[0] ?? "");
  const [dHora,  setDHora]  = useState(dInit.split("T")[1]?.slice(0,5) ?? "");
  const [hFecha, setHFecha] = useState(hInit.split("T")[0] ?? "");
  const [hHora,  setHHora]  = useState(hInit.split("T")[1]?.slice(0,5) ?? "");

  const aplicar = useCallback(() => {
    const p = new URLSearchParams();
    if (tipo)   p.set("tipo", tipo);
    if (fase)   p.set("fase", fase);
    if (dFecha) p.set("desde", dHora ? `${dFecha}T${dHora}:00` : `${dFecha}T00:00:00`);
    if (hFecha) p.set("hasta", hHora ? `${hFecha}T${hHora}:59` : `${hFecha}T23:59:59`);
    router.push(`/admin/log-ia?${p.toString()}`);
  }, [tipo, fase, dFecha, dHora, hFecha, hHora, router]);

  const limpiar = useCallback(() => {
    setTipo(""); setFase(""); setDFecha(""); setDHora(""); setHFecha(""); setHHora("");
    router.push("/admin/log-ia");
  }, [router]);

  const ultimosCincoMin = useCallback(() => {
    const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const p = new URLSearchParams();
    if (tipo) p.set("tipo", tipo);
    if (fase) p.set("fase", fase);
    p.set("desde", desde);
    router.push(`/admin/log-ia?${p.toString()}`);
  }, [tipo, fase, router]);

  const chip = (activo: boolean) =>
    `rounded border px-2 py-1 text-xs cursor-pointer select-none transition-colors ${
      activo ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50"
    }`;
  const inputCls = "rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white";

  return (
    <div className="space-y-3 rounded border bg-gray-50 p-3">
      {/* Tipo de acción */}
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">Tipo de acción</p>
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!tipo)} onClick={() => setTipo("")}>Todos</button>
          {TIPOS.map(t => (
            <button key={t} className={chip(tipo === t)} onClick={() => setTipo(tipo === t ? "" : t)}>
              {TIPO_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      {/* Fase */}
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">Fase</p>
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!fase)} onClick={() => setFase("")}>Todas</button>
          {FASES.map(f => (
            <button key={f} className={chip(fase === f)} onClick={() => setFase(fase === f ? "" : f)}>
              {FASE_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Rango fecha/hora */}
      <div className="flex flex-wrap gap-4">
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Desde</p>
          <div className="flex gap-1.5">
            <input type="date" value={dFecha} onChange={e => setDFecha(e.target.value)} className={inputCls} />
            <input type="time" value={dHora}  onChange={e => setDHora(e.target.value)}  className={inputCls} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Hasta</p>
          <div className="flex gap-1.5">
            <input type="date" value={hFecha} onChange={e => setHFecha(e.target.value)} className={inputCls} />
            <input type="time" value={hHora}  onChange={e => setHHora(e.target.value)}  className={inputCls} />
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={aplicar}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors">
          Aplicar filtros
        </button>
        <button onClick={ultimosCincoMin}
          className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
          ⚡ Últimos 5 min
        </button>
        <button onClick={limpiar}
          className="rounded border px-3 py-1.5 text-xs hover:bg-gray-100 transition-colors">
          Limpiar
        </button>
      </div>
    </div>
  );
}
