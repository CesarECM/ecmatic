"use client";

import { useState, useRef } from "react";
import type { FilaCSV, ResultadoImport, LeadImportado } from "@/services/importador-prospeccion";

const MENSAJE_DEFAULT = `Hola {nombre}, te contactamos desde Centro ECM. Hace un tiempo mostraste interés en las certificaciones CONOCER. ¿Sigues buscando opciones para certificar tus competencias laborales?`;

function parsearCSV(texto: string): FilaCSV[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const enc = lineas[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const iTel = enc.findIndex((h) => h.includes("tel") || h.includes("phone") || h.includes("celular"));
  const iNom = enc.findIndex((h) => h.includes("nom") || h.includes("name"));
  const iEmail = enc.findIndex((h) => h.includes("email") || h.includes("mail") || h.includes("correo"));
  if (iTel === -1) return [];
  return lineas.slice(1).map((linea) => {
    const cols = linea.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return { telefono: cols[iTel] ?? "", nombre: iNom >= 0 ? cols[iNom] : undefined, email: iEmail >= 0 ? cols[iEmail] : undefined };
  }).filter((f) => f.telefono);
}

interface PlantillaProps {
  importados: LeadImportado[];
  onEncolado: (n: number) => void;
}

function PlantillaReconexion({ importados, onEncolado }: PlantillaProps) {
  const [mensaje, setMensaje] = useState(MENSAJE_DEFAULT);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  async function encolar() {
    setEnviando(true);
    try {
      const entradas = importados.map((l) => ({ leadId: l.leadId, telefono: l.telefono }));
      const res = await fetch("/api/admin/prospeccion/reconexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entradas, mensaje }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExito(true);
      onEncolado(data.encolados);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al encolar");
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return <p className="text-sm text-green-600 font-medium py-2">{importados.length} mensajes enviados a la cola de aprobación ✓</p>;
  }

  return (
    <div className="space-y-3 border-t pt-4 mt-4">
      <div>
        <p className="text-sm font-semibold">Plantilla de reconexión (S22.8)</p>
        <p className="text-xs text-muted-foreground">Primer contacto sin oferta. Usa {"{nombre}"} para personalizar.</p>
      </div>
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={4}
        className="w-full text-sm border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
      />
      <button
        onClick={encolar}
        disabled={enviando || !mensaje.trim()}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {enviando ? "Encolando…" : `Enviar a cola de aprobación (${importados.length} leads)`}
      </button>
    </div>
  );
}

export function ImportarCSV() {
  const [filas, setFilas] = useState<FilaCSV[]>([]);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parsearCSV(ev.target?.result as string);
      if (parsed.length === 0) {
        setError("No se detectó columna de teléfono. Asegúrate que el encabezado incluya 'telefono', 'phone' o 'celular'.");
        setFilas([]);
      } else {
        setError(null);
        setFilas(parsed);
        setResultado(null);
      }
    };
    reader.readAsText(file);
  }

  async function importar() {
    setImportando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/prospeccion/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResultado(data);
      setFilas([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg bg-card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold mb-1">Cargar CSV</p>
          <p className="text-xs text-muted-foreground">Columnas detectadas automáticamente: telefono, nombre, email. Máximo 500 filas por importación.</p>
        </div>

        <input ref={inputRef} type="file" accept=".csv,.txt" onChange={onFile} className="text-sm" />

        {error && <p className="text-sm text-red-600">{error}</p>}

        {filas.length > 0 && !resultado && (
          <div className="space-y-3">
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Teléfono</th>
                    <th className="px-3 py-2 text-left font-medium">Nombre</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 5).map((f, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{f.telefono}</td>
                      <td className="px-3 py-1.5">{f.nombre ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{f.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filas.length > 5 && <p className="text-xs text-muted-foreground px-3 py-2">…y {filas.length - 5} más ({filas.length} total)</p>}
            </div>

            <button
              onClick={importar}
              disabled={importando}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {importando ? "Importando…" : `Importar ${filas.length} contactos`}
            </button>
          </div>
        )}

        {resultado && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Importados" value={resultado.importados.length} color="text-green-600" />
              <Stat label="En blacklist" value={resultado.omitidosBlacklist} color="text-red-600" />
              <Stat label="Duplicados" value={resultado.omitidosDuplicados} color="text-amber-600" />
              <Stat label="Inválidos" value={resultado.omitidosInvalidos} color="text-muted-foreground" />
            </div>
            {resultado.importados.length > 0 && (
              <PlantillaReconexion importados={resultado.importados} onEncolado={() => {}} />
            )}
            <button onClick={() => { setResultado(null); if (inputRef.current) inputRef.current.value = ""; }} className="text-xs text-muted-foreground underline">
              Nueva importación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border rounded-md p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
