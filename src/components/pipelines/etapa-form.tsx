"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TareasEditor, CondicionesEditor, PlantillasEditor } from "./etapa-form-editores";
import type { EtapaAdmin, ActualizarEtapaInput, TareaObligatoria, PlantillaMensaje, CondicionWorkflow } from "@/services/etapas-admin";

const TODAS_FASES = Array.from({ length: 17 }, (_, i) => i);
const FASES_LABEL = [
  "Inconsciencia","Activación","Definición del problema","Exploración inicial",
  "Consciencia de soluciones","Construcción de criterios","Evaluación de opciones",
  "Validación social","Ansiedad pre-decisión","Decisión de compra","Acto de compra",
  "Disonancia post-compra","Evaluación de experiencia","Satisfacción/Insatisfacción",
  "Retención","Lealtad","Advocacy",
];
const CANALES_DISPONIBLES = ["whatsapp", "email", "llamada", "meet"];

interface Props {
  etapa: EtapaAdmin;
  todasEtapas: EtapaAdmin[];
  onGuardar: (data: ActualizarEtapaInput) => Promise<void>;
  onCancelar: () => void;
}

type Tab = "general" | "tiempos" | "flujo" | "contacto" | "protocolo";

export function EtapaForm({ etapa, todasEtapas, onGuardar, onCancelar }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const [pending, startTransition] = useTransition();

  const [nombre, setNombre]             = useState(etapa.nombre);
  const [esTronco, setEsTronco]         = useState(etapa.es_tronco);
  const [fasesSelec, setFasesSelec]     = useState<number[]>(etapa.fases_cagc);
  const [siguientes, setSiguientes]     = useState<string[]>(etapa.etapas_siguientes);
  const [slaDias, setSlaDias]           = useState<string | number>(etapa.sla_dias ?? "");
  const [rottingDias, setRottingDias]   = useState<string | number>(etapa.rotting_dias ?? "");
  const [entrada, setEntrada]           = useState(etapa.criterios_entrada ?? "");
  const [salida, setSalida]             = useState(etapa.criterios_salida ?? "");
  const [tareas, setTareas]             = useState<TareaObligatoria[]>(etapa.tareas_obligatorias);
  const [plantillas, setPlantillas]     = useState<PlantillaMensaje[]>(etapa.plantillas_mensaje);
  const [condiciones, setCondiciones]   = useState<CondicionWorkflow[]>(etapa.condiciones_workflow);
  const [canalesSelec, setCanalesSelec] = useState<string[]>(etapa.canales);
  const [protTipo, setProtTipo]         = useState(etapa.protocolo?.tipo ?? "ia-propuesto");
  const [protAvance, setProtAvance]     = useState(etapa.protocolo?.regla_avance ?? "");
  const [protRetroceso, setProtRetroceso] = useState(etapa.protocolo?.regla_retroceso ?? "");
  const [protEspera, setProtEspera]     = useState(etapa.protocolo?.regla_espera ?? "");

  const toggleFase = (n: number) =>
    setFasesSelec((p) => p.includes(n) ? p.filter((f) => f !== n) : [...p, n].sort((a, b) => a - b));

  const toggleCanal = (c: string) =>
    setCanalesSelec((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const toggleSiguiente = (nombre: string) =>
    setSiguientes((p) => p.includes(nombre) ? p.filter((x) => x !== nombre) : [...p, nombre]);

  function handleGuardar() {
    startTransition(async () => {
      const tid = toast.loading("Guardando etapa…");
      try {
        await onGuardar({
          nombre,
          es_tronco: esTronco,
          fases_cagc: fasesSelec,
          etapas_siguientes: siguientes,
          sla_dias: slaDias !== "" ? Number(slaDias) : null,
          rotting_dias: rottingDias !== "" ? Number(rottingDias) : null,
          criterios_entrada: entrada || null,
          criterios_salida: salida || null,
          tareas_obligatorias: tareas,
          plantillas_mensaje: plantillas,
          condiciones_workflow: condiciones,
          canales: canalesSelec,
          protocolo: {
            tipo: protTipo as "ia-propuesto" | "manual",
            regla_avance: protAvance || null,
            regla_retroceso: protRetroceso || null,
            regla_espera: protEspera || null,
          },
        });
        toast.success("Etapa actualizada", { id: tid });
        onCancelar();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar", { id: tid });
      }
    });
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "tiempos", label: "Tiempos" },
    { id: "flujo",   label: "Flujo" },
    { id: "contacto",label: "Contacto" },
    { id: "protocolo", label: "Protocolo" },
  ];

  return (
    <div className="border rounded-lg bg-muted/30 p-4 space-y-4">
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Nombre *</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tronco" checked={esTronco} onChange={(e) => setEsTronco(e.target.checked)} />
            <label htmlFor="tronco" className="text-xs">Es etapa de tronco (compartida por todos los leads)</label>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Fases CAGC asociadas</label>
            <div className="flex flex-wrap gap-1">
              {TODAS_FASES.map((n) => (
                <button key={n} type="button" onClick={() => toggleFase(n)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${fasesSelec.includes(n) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {n}
                </button>
              ))}
            </div>
            {fasesSelec.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {fasesSelec.map((n) => `${n}-${FASES_LABEL[n]}`).join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Etapas siguientes posibles</label>
            <div className="flex flex-wrap gap-1">
              {todasEtapas.filter((e) => e.nombre !== etapa.nombre).map((e) => (
                <button key={e.id} type="button" onClick={() => toggleSiguiente(e.nombre)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${siguientes.includes(e.nombre) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {e.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "tiempos" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">SLA (días máx sin avance)</label>
              <Input type="number" min={1} value={slaDias} onChange={(e) => setSlaDias(e.target.value)} placeholder="Ej: 7" className="text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Rotting (días sin actividad)</label>
              <Input type="number" min={1} value={rottingDias} onChange={(e) => setRottingDias(e.target.value)} placeholder="Ej: 3" className="text-sm" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">SLA genera alerta en aprobaciones. Rotting marca el lead como podrido en el kanban.</p>
        </div>
      )}

      {tab === "flujo" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Criterio de entrada</label>
            <Textarea value={entrada} onChange={(e) => setEntrada(e.target.value)} rows={2} placeholder="¿Qué condición debe cumplirse para que un lead entre a esta etapa?" className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Criterio de salida / avance</label>
            <Textarea value={salida} onChange={(e) => setSalida(e.target.value)} rows={2} placeholder="¿Qué debe lograr el lead para avanzar a la siguiente etapa?" className="text-sm" />
          </div>
          <TareasEditor tareas={tareas} onChange={setTareas} />
          <CondicionesEditor condiciones={condiciones} onChange={setCondiciones} />
        </div>
      )}

      {tab === "contacto" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Canales habilitados</label>
            <div className="flex gap-2 flex-wrap">
              {CANALES_DISPONIBLES.map((c) => (
                <button key={c} type="button" onClick={() => toggleCanal(c)}
                  className={`px-3 py-1.5 rounded-md text-xs border font-medium transition-colors ${canalesSelec.includes(c) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                  {c === "whatsapp" ? "💬 WhatsApp" : c === "email" ? "📧 Email" : c === "llamada" ? "📞 Llamada" : "🎥 Meet"}
                </button>
              ))}
            </div>
          </div>
          <PlantillasEditor plantillas={plantillas} onChange={setPlantillas} />
        </div>
      )}

      {tab === "protocolo" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tipo de protocolo</label>
            <select value={protTipo} onChange={(e) => setProtTipo(e.target.value as "ia-propuesto" | "manual")} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
              <option value="ia-propuesto">IA propuesto (sugerido por auditor)</option>
              <option value="manual">Manual (definido por César)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Regla de avance</label>
            <Textarea value={protAvance} onChange={(e) => setProtAvance(e.target.value)} rows={2} placeholder="¿Bajo qué condición la IA mueve el lead a la siguiente etapa?" className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Regla de retroceso</label>
            <Textarea value={protRetroceso} onChange={(e) => setProtRetroceso(e.target.value)} rows={2} placeholder="¿Cuándo puede la IA regresar el lead a una etapa anterior?" className="text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Regla de espera</label>
            <Textarea value={protEspera} onChange={(e) => setProtEspera(e.target.value)} rows={2} placeholder="¿Qué hacer cuando el lead no responde?" className="text-sm" />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t">
        <Button size="sm" onClick={handleGuardar} disabled={pending} className="flex-1">
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
