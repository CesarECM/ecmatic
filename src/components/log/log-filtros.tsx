"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const CATEGORIAS = ["ia", "cron", "webhook", "servicio", "ui", "auth"] as const;
const CAT_LABEL: Record<string, string> = {
  ia: "IA", cron: "Cron", webhook: "Webhook", servicio: "Servicio", ui: "UI", auth: "Auth",
};

const TIPOS_POR_CAT: Record<string, string[]> = {
  ia: [
    "CONVERSACION","CONVERSACION_SANDBOX","CLASIFICAR","RESPUESTA","CONTEXTO",
    "SETTER","OBJECION","DESCONFIANZA","CAGC_INFERIR","SUGERIR_KB","ANALISIS",
    "VISION","LEADMAGNET","CUALIFICACION","SENALES","PAQUETE_SERVICIO","BRIEF_DISENO",
    "CLUSTERING","AUDITOR_SERVICIO","AUDITOR_PIPELINE","PAQUETE_SERVICIO_NUEVO",
  ],
  cron: [
    "cron.procesar-cola","cron.nurturing","cron.gatillos","cron.recordatorios",
    "cron.archivar-inactivos","cron.vendedor-monitor","cron.pipeline-detector",
    "cron.calidad-kb","cron.log-limpieza",
  ],
  webhook: ["webhook.whatsapp","webhook.stripe","webhook.ghl"],
  servicio: ["wa.send","brevo.send","calendar.event","stripe.api"],
  ui: ["ui.error","ui.accion"],
  auth: ["auth.login","auth.logout"],
};

const TIPO_LABEL: Record<string, string> = {
  CONVERSACION:"Conversación WA",    CONVERSACION_SANDBOX:"Sandbox",
  CLASIFICAR:"Clasificar",           RESPUESTA:"Respuesta WA",   CONTEXTO:"Contexto",
  SETTER:"Setter",                   OBJECION:"Objeción",        DESCONFIANZA:"Desconfianza",
  CAGC_INFERIR:"Fase CAGC",         SUGERIR_KB:"Sugerir KB",    ANALISIS:"Análisis",
  VISION:"Visión",                   LEADMAGNET:"Leadmagnet",    CUALIFICACION:"Cualificación",
  SENALES:"Señales",                 PAQUETE_SERVICIO:"Paquete", BRIEF_DISENO:"Brief",
  CLUSTERING:"Clustering",
  AUDITOR_SERVICIO:"Auditor Servicio", AUDITOR_PIPELINE:"Auditor Pipeline",
  PAQUETE_SERVICIO_NUEVO:"Paquete Nuevo",
  "cron.procesar-cola":"Procesar cola",   "cron.nurturing":"Nurturing",
  "cron.gatillos":"Gatillos",             "cron.recordatorios":"Recordatorios",
  "cron.archivar-inactivos":"Archivar inactivos", "cron.vendedor-monitor":"Monitor vendedores",
  "cron.pipeline-detector":"Detector pipelines",  "cron.calidad-kb":"Calidad KB",
  "cron.log-limpieza":"Limpieza log",
  "webhook.whatsapp":"WhatsApp","webhook.stripe":"Stripe","webhook.ghl":"GHL",
  "wa.send":"WA envío","brevo.send":"Brevo","calendar.event":"Calendar","stripe.api":"Stripe API",
  "ui.error":"Error UI","ui.accion":"Acción UI",
  "auth.login":"Login","auth.logout":"Logout",
};

const FASES = ["inicio","ok","llamado","peticion","respuesta","timeout","error","warn","debug"] as const;
const FASE_LABEL: Record<string, string> = {
  inicio:"Inicio", ok:"OK", llamado:"Llamado", peticion:"Petición",
  respuesta:"Respuesta", timeout:"Timeout", error:"Error", warn:"Warn", debug:"Debug",
};

interface Props {
  categoria?: string; tipo?: string; fase?: string; desde?: string; hasta?: string;
}

export function LogFiltros({ categoria: cInit = "", tipo: tInit = "", fase: fInit = "", desde: dInit = "", hasta: hInit = "" }: Props) {
  const router = useRouter();

  const [categoria, setCategoria] = useState(cInit);
  const [tipo,      setTipo]      = useState(tInit);
  const [fase,      setFase]      = useState(fInit);
  const [dFecha,    setDFecha]    = useState(dInit.split("T")[0] ?? "");
  const [dHora,     setDHora]     = useState(dInit.split("T")[1]?.slice(0, 5) ?? "");
  const [hFecha,    setHFecha]    = useState(hInit.split("T")[0] ?? "");
  const [hHora,     setHHora]     = useState(hInit.split("T")[1]?.slice(0, 5) ?? "");

  const tiposDisponibles = categoria ? (TIPOS_POR_CAT[categoria] ?? []) : [];

  const buildParams = useCallback((overrides?: Record<string, string>) => {
    const vals = { categoria, tipo, fase, dFecha, dHora, hFecha, hHora, ...overrides };
    const p = new URLSearchParams();
    if (vals.categoria) p.set("categoria", vals.categoria);
    if (vals.tipo)      p.set("tipo",      vals.tipo);
    if (vals.fase)      p.set("fase",      vals.fase);
    if (vals.dFecha)    p.set("desde",     vals.dHora ? `${vals.dFecha}T${vals.dHora}:00` : `${vals.dFecha}T00:00:00`);
    if (vals.hFecha)    p.set("hasta",     vals.hHora ? `${vals.hFecha}T${vals.hHora}:59` : `${vals.hFecha}T23:59:59`);
    return p;
  }, [categoria, tipo, fase, dFecha, dHora, hFecha, hHora]);

  const aplicar = useCallback(() => {
    router.push(`/admin/log?${buildParams().toString()}`);
  }, [router, buildParams]);

  const limpiar = useCallback(() => {
    setCategoria(""); setTipo(""); setFase(""); setDFecha(""); setDHora(""); setHFecha(""); setHHora("");
    router.push("/admin/log");
  }, [router]);

  const ultimosCincoMin = useCallback(() => {
    const desde = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const p = buildParams({ dFecha: desde.split("T")[0], dHora: desde.split("T")[1].slice(0, 5) });
    p.set("desde", desde);
    router.push(`/admin/log?${p.toString()}`);
  }, [router, buildParams]);

  const selCategoria = (c: string) => {
    const next = categoria === c ? "" : c;
    setCategoria(next);
    setTipo("");
  };

  const chip = (activo: boolean) =>
    `rounded border px-2 py-1 text-xs cursor-pointer select-none transition-colors ${
      activo ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50"
    }`;
  const inputCls = "rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white";

  return (
    <div className="space-y-3 rounded border bg-gray-50 p-3">
      {/* Categoría */}
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">Categoría</p>
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!categoria)} onClick={() => selCategoria("")}>Todos</button>
          {CATEGORIAS.map(c => (
            <button key={c} className={chip(categoria === c)} onClick={() => selCategoria(c)}>
              {CAT_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Tipo de acción — solo cuando hay categoría seleccionada */}
      {tiposDisponibles.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase text-muted-foreground">Tipo de acción</p>
          <div className="flex flex-wrap gap-1.5">
            <button className={chip(!tipo)} onClick={() => setTipo("")}>Todos</button>
            {tiposDisponibles.map(t => (
              <button key={t} className={chip(tipo === t)} onClick={() => setTipo(tipo === t ? "" : t)}>
                {TIPO_LABEL[t] ?? t}
              </button>
            ))}
          </div>
        </div>
      )}

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
