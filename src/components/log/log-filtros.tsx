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
  servicio: ["wa.send","brevo.send","calendar.event","stripe.api","sistema.health-check","sistema.alerta-wa","sistema.config","depuracion.email-interceptado"],
  ui: [
    "ui.error","ui.accion","sistema.cambiar-modo","sistema.cambiar-umbral",
    "depuracion.crear-lead","depuracion.marcar-leido",
    "aprobaciones.aprobar-kb","aprobaciones.actualizar-kb","aprobaciones.eliminar-kb",
    "aprobaciones.aprobar-matriz","aprobaciones.actualizar-matriz","aprobaciones.eliminar-matriz",
    "aprobaciones.aprobar-sugerencia","aprobaciones.rechazar-sugerencia",
    "aprobaciones.aprobar-cluster","aprobaciones.rechazar-cluster",
    "aprobaciones.aprobar-etiqueta","aprobaciones.archivar-etiqueta",
    "aprobaciones.aprobar-mensaje","aprobaciones.rechazar-mensaje","aprobaciones.actualizar-mensaje",
    "aprobaciones.aprobar-comprobante","aprobaciones.rechazar-comprobante",
    "etiquetas.aprobar","etiquetas.archivar","etiquetas.crear","etiquetas.fusionar","etiquetas.crear-categoria",
    "conocimiento.crear","conocimiento.aprobar","conocimiento.editar","conocimiento.eliminar","conocimiento.toggle-activo","conocimiento.restaurar-version","conocimiento.importar-fuente",
    "automatizaciones.disparar-cron",
    "gatillos.toggle","gatillos.actualizar","gatillos.crear","gatillos.sugerir",
    "nurturing.toggle-secuencia","nurturing.disparar-ciclo",
    "pipelines.crear","pipelines.actualizar","pipelines.eliminar","pipelines.crear-etapa","pipelines.actualizar-etapa","pipelines.eliminar-etapa",
    "servicios.crear","servicios.actualizar-general","servicios.actualizar-precios","servicios.eliminar",
    "servicios.regenerar-embeddings","servicios.regenerar-embedding",
    "servicios.crear-pago","servicios.eliminar-pago","servicios.toggle-pago",
    "servicios.crear-relacion","servicios.eliminar-relacion",
    "servicios.toggle-imagen","servicios.eliminar-imagen",
    "leads.mover","leads.asignar-vendedor","leads.actualizar-b2b","leads.emitir-factura","leads.marcar-privacidad","leads.agregar-nota","leads.toggle-nurturing",
    "financiero.marcar-comision-pagada","financiero.registrar-pago-manual",
    "matriz.aprobar-celda","matriz.actualizar-celda","matriz.rechazar-celda","matriz.crear-celda","matriz.generar-sugerencias",
    "tickets.responder","tickets.tomar",
    "vendedores.actualizar-peso","vendedores.agregar","vendedores.reenviar-invitacion",
    "auditor-ia.disparar","auditor-ia.aprobar-sugerencia","auditor-ia.rechazar-sugerencia",
  ],
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
  "sistema.health-check":"Health check","sistema.alerta-wa":"Alerta WA","sistema.config":"Config sistema",
  "ui.error":"Error UI","ui.accion":"Acción UI","sistema.cambiar-modo":"Cambiar modo","sistema.cambiar-umbral":"Cambiar umbral",
  "depuracion.crear-lead":"Crear lead debug","depuracion.marcar-leido":"Marcar leído",
  "depuracion.email-interceptado":"Email interceptado",
  "aprobaciones.aprobar-kb":"Aprobar KB","aprobaciones.actualizar-kb":"Actualizar KB","aprobaciones.eliminar-kb":"Eliminar KB",
  "aprobaciones.aprobar-matriz":"Aprobar matriz","aprobaciones.actualizar-matriz":"Actualizar matriz","aprobaciones.eliminar-matriz":"Eliminar matriz",
  "aprobaciones.aprobar-sugerencia":"Aprobar sugerencia","aprobaciones.rechazar-sugerencia":"Rechazar sugerencia",
  "aprobaciones.aprobar-cluster":"Aprobar cluster","aprobaciones.rechazar-cluster":"Rechazar cluster",
  "aprobaciones.aprobar-etiqueta":"Aprobar etiqueta","aprobaciones.archivar-etiqueta":"Archivar etiqueta",
  "aprobaciones.aprobar-mensaje":"Aprobar mensaje","aprobaciones.rechazar-mensaje":"Rechazar mensaje","aprobaciones.actualizar-mensaje":"Editar mensaje",
  "aprobaciones.aprobar-comprobante":"Aprobar comprobante","aprobaciones.rechazar-comprobante":"Rechazar comprobante",
  "etiquetas.aprobar":"Aprobar etiqueta","etiquetas.archivar":"Archivar etiqueta","etiquetas.crear":"Crear etiqueta","etiquetas.fusionar":"Fusionar etiquetas","etiquetas.crear-categoria":"Crear categoría",
  "conocimiento.crear":"Crear recurso KB","conocimiento.aprobar":"Aprobar recurso KB","conocimiento.editar":"Editar recurso KB","conocimiento.eliminar":"Eliminar recurso KB","conocimiento.toggle-activo":"Activar/desactivar KB","conocimiento.restaurar-version":"Restaurar versión KB","conocimiento.importar-fuente":"Importar fuente KB",
  "automatizaciones.disparar-cron":"Disparar CRON",
  "gatillos.toggle":"Toggle gatillo","gatillos.actualizar":"Actualizar gatillo","gatillos.crear":"Crear gatillo","gatillos.sugerir":"Sugerir gatillos",
  "nurturing.toggle-secuencia":"Toggle secuencia","nurturing.disparar-ciclo":"Disparar ciclo",
  "pipelines.crear":"Crear pipeline","pipelines.actualizar":"Actualizar pipeline","pipelines.eliminar":"Eliminar pipeline","pipelines.crear-etapa":"Crear etapa","pipelines.actualizar-etapa":"Actualizar etapa","pipelines.eliminar-etapa":"Eliminar etapa",
  "servicios.crear":"Crear servicio","servicios.actualizar-general":"Actualizar servicio","servicios.actualizar-precios":"Actualizar precios","servicios.eliminar":"Eliminar servicio",
  "servicios.regenerar-embeddings":"Regenerar embeddings","servicios.regenerar-embedding":"Regenerar embedding",
  "servicios.crear-pago":"Crear link pago","servicios.eliminar-pago":"Eliminar link pago","servicios.toggle-pago":"Toggle link pago",
  "servicios.crear-relacion":"Crear relación","servicios.eliminar-relacion":"Eliminar relación",
  "servicios.toggle-imagen":"Toggle imagen","servicios.eliminar-imagen":"Eliminar imagen",
  "leads.mover":"Mover lead","leads.asignar-vendedor":"Asignar vendedor","leads.actualizar-b2b":"Actualizar B2B","leads.emitir-factura":"Emitir factura","leads.marcar-privacidad":"Marcar privacidad","leads.agregar-nota":"Agregar nota","leads.toggle-nurturing":"Toggle nurturing",
  "financiero.marcar-comision-pagada":"Marcar comisión pagada","financiero.registrar-pago-manual":"Registrar pago manual",
  "matriz.aprobar-celda":"Aprobar celda","matriz.actualizar-celda":"Actualizar celda","matriz.rechazar-celda":"Rechazar celda","matriz.crear-celda":"Crear celda","matriz.generar-sugerencias":"Generar sugerencias matriz",
  "tickets.responder":"Responder ticket","tickets.tomar":"Tomar ticket",
  "vendedores.actualizar-peso":"Actualizar peso","vendedores.agregar":"Agregar vendedor","vendedores.reenviar-invitacion":"Reenviar invitación",
  "auditor-ia.disparar":"Disparar auditoría","auditor-ia.aprobar-sugerencia":"Aprobar sugerencia (modal)","auditor-ia.rechazar-sugerencia":"Rechazar sugerencia (modal)",
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
