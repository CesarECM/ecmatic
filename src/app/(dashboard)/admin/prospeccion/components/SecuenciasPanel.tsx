"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Paso {
  id: string;
  orden: number;
  canal: "email" | "whatsapp";
  delay_dias: number;
  condicion_trigger: "siempre" | "sin_respuesta";
  template_wa_id: string | null;
  asunto_email: string | null;
  cuerpo_email: string | null;
}

interface Secuencia {
  id: string;
  nombre: string;
  activa: boolean;
  created_at: string;
  prospeccion_secuencia_pasos: Paso[];
}

interface TemplateWA { id: string; nombre: string; estado_meta: string }

const CANAL_LABELS = { email: "Email", whatsapp: "WhatsApp" };
const TRIGGER_LABELS = { siempre: "Siempre", sin_respuesta: "Sin respuesta" };

function PasoRow({ paso, secuenciaId, onDelete }: { paso: Paso; secuenciaId: string; onDelete: () => void }) {
  async function eliminar() {
    if (!confirm("¿Eliminar este paso?")) return;
    const tid = toast.loading("Eliminando…");
    const res = await fetch(
      `/api/admin/prospeccion/secuencias/${secuenciaId}/pasos?pasoId=${paso.id}`,
      { method: "DELETE" }
    );
    if (res.ok) { toast.success("Paso eliminado", { id: tid }); onDelete(); }
    else toast.error("Error al eliminar", { id: tid });
  }
  return (
    <div className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-muted/30">
      <span className="w-5 text-muted-foreground font-mono text-xs">{paso.orden}</span>
      <Badge variant={paso.canal === "whatsapp" ? "default" : "secondary"} className="text-[10px]">
        {CANAL_LABELS[paso.canal]}
      </Badge>
      <span className="text-muted-foreground text-xs">+{paso.delay_dias}d</span>
      <Badge variant="outline" className="text-[10px]">{TRIGGER_LABELS[paso.condicion_trigger]}</Badge>
      {paso.asunto_email && <span className="text-xs truncate flex-1 text-muted-foreground">{paso.asunto_email}</span>}
      <button onClick={eliminar} className="ml-auto text-xs text-red-500 hover:underline shrink-0">Eliminar</button>
    </div>
  );
}

function NuevoPasoForm({ secuenciaId, templates, onCreado }: { secuenciaId: string; templates: TemplateWA[]; onCreado: () => void }) {
  const [canal, setCanal] = useState<"email" | "whatsapp">("whatsapp");
  const [delay, setDelay] = useState(0);
  const [condicion, setCondicion] = useState<"siempre" | "sin_respuesta">("siempre");
  const [templateId, setTemplateId] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function agregar() {
    setGuardando(true);
    const tid = toast.loading("Agregando paso…");
    const res = await fetch(`/api/admin/prospeccion/secuencias/${secuenciaId}/pasos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canal, delay_dias: delay, condicion_trigger: condicion,
        template_wa_id: canal === "whatsapp" ? templateId || null : null,
        asunto_email: canal === "email" ? asunto || null : null,
        cuerpo_email: canal === "email" ? cuerpo || null : null,
      }),
    });
    if (res.ok) { toast.success("Paso agregado", { id: tid }); onCreado(); setTemplateId(""); setAsunto(""); setCuerpo(""); }
    else toast.error("Error al agregar paso", { id: tid });
    setGuardando(false);
  }

  const aprobados = templates.filter((t) => t.estado_meta === "APPROVED");

  return (
    <div className="border border-dashed rounded-md p-3 space-y-2 mt-2">
      <p className="text-xs font-semibold text-muted-foreground">Agregar paso</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground">Canal</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value as "email" | "whatsapp")}
            className="text-xs border rounded px-2 py-1 bg-background">
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground">Delay (días)</label>
          <input type="number" min={0} value={delay} onChange={(e) => setDelay(Number(e.target.value))}
            className="text-xs border rounded px-2 py-1 bg-background w-16" />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground">Condición</label>
          <select value={condicion} onChange={(e) => setCondicion(e.target.value as "siempre" | "sin_respuesta")}
            className="text-xs border rounded px-2 py-1 bg-background">
            <option value="siempre">Siempre</option>
            <option value="sin_respuesta">Sin respuesta</option>
          </select>
        </div>
      </div>
      {canal === "whatsapp" && (
        <div className="space-y-0.5">
          <label className="text-[10px] text-muted-foreground">Template WA (aprobado)</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-background w-full">
            <option value="">— Seleccionar —</option>
            {aprobados.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          {!aprobados.length && <p className="text-[10px] text-amber-600">Sin templates aprobados. Crea y aprueba en Plantillas WA.</p>}
        </div>
      )}
      {canal === "email" && (
        <div className="space-y-2">
          <input placeholder="Asunto del email" value={asunto} onChange={(e) => setAsunto(e.target.value)}
            className="text-xs border rounded px-2 py-1.5 bg-background w-full" />
          <textarea placeholder="Cuerpo del email. Usa {nombre} para personalizar." value={cuerpo} onChange={(e) => setCuerpo(e.target.value)}
            rows={3} className="text-xs border rounded px-2 py-1.5 bg-background w-full resize-y" />
        </div>
      )}
      <button onClick={agregar} disabled={guardando}
        className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground font-medium disabled:opacity-40 hover:opacity-90">
        {guardando ? "Agregando…" : "+ Agregar paso"}
      </button>
    </div>
  );
}

function SecuenciaCard({ sec, templates, onChanged }: { sec: Secuencia; templates: TemplateWA[]; onChanged: () => void }) {
  const [expandida, setExpandida] = useState(false);

  async function toggleActiva() {
    const tid = toast.loading(sec.activa ? "Desactivando…" : "Activando…");
    const res = await fetch(`/api/admin/prospeccion/secuencias/${sec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !sec.activa }),
    });
    if (res.ok) { toast.success(sec.activa ? "Desactivada" : "Activada", { id: tid }); onChanged(); }
    else toast.error("Error", { id: tid });
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar la secuencia "${sec.nombre}" y todos sus pasos?`)) return;
    const tid = toast.loading("Eliminando…");
    const res = await fetch(`/api/admin/prospeccion/secuencias/${sec.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Secuencia eliminada", { id: tid }); onChanged(); }
    else toast.error("Error al eliminar", { id: tid });
  }

  const pasos = [...sec.prospeccion_secuencia_pasos].sort((a, b) => a.orden - b.orden);

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpandida((v) => !v)} className="text-muted-foreground text-xs">
          {expandida ? "▼" : "▶"}
        </button>
        <span className="font-medium text-sm flex-1">{sec.nombre}</span>
        <Badge variant="outline" className="text-[10px]">{pasos.length} paso{pasos.length !== 1 ? "s" : ""}</Badge>
        <Badge variant={sec.activa ? "default" : "secondary"} className="text-[10px]">
          {sec.activa ? "Activa" : "Inactiva"}
        </Badge>
        <button onClick={toggleActiva} className="text-xs text-primary hover:underline">{sec.activa ? "Pausar" : "Activar"}</button>
        <button onClick={eliminar} className="text-xs text-red-500 hover:underline">Eliminar</button>
      </div>
      {expandida && (
        <div className="px-4 pb-4 space-y-2 border-t pt-3">
          {pasos.map((p) => (
            <PasoRow key={p.id} paso={p} secuenciaId={sec.id} onDelete={onChanged} />
          ))}
          {!pasos.length && <p className="text-xs text-muted-foreground">Sin pasos. Agrega el primero.</p>}
          <NuevoPasoForm secuenciaId={sec.id} templates={templates} onCreado={onChanged} />
        </div>
      )}
    </div>
  );
}

export function SecuenciasPanel({ templates }: { templates: TemplateWA[] }) {
  const [secuencias, setSecuencias] = useState<Secuencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await fetch("/api/admin/prospeccion/secuencias");
    if (res.ok) { const d = await res.json(); setSecuencias(d.secuencias ?? []); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function crearSecuencia() {
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    const tid = toast.loading("Creando secuencia…");
    const res = await fetch("/api/admin/prospeccion/secuencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoNombre.trim() }),
    });
    if (res.ok) { toast.success("Secuencia creada", { id: tid }); setNuevoNombre(""); cargar(); }
    else toast.error("Error al crear", { id: tid });
    setCreando(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nombre de la nueva secuencia…"
          className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
          onKeyDown={(e) => e.key === "Enter" && crearSecuencia()} />
        <button onClick={crearSecuencia} disabled={creando || !nuevoNombre.trim()}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90">
          {creando ? "Creando…" : "Nueva secuencia"}
        </button>
      </div>

      {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!cargando && !secuencias.length && (
        <p className="text-sm text-muted-foreground">Sin secuencias aún. Crea la primera arriba.</p>
      )}
      {secuencias.map((s) => (
        <SecuenciaCard key={s.id} sec={s} templates={templates} onChanged={cargar} />
      ))}
    </div>
  );
}
