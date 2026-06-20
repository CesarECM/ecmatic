"use client";

import { useState } from "react";
import type { IdentidadMarca } from "@/services/identidad-marca";

interface Props {
  identidad: IdentidadMarca;
  onGuardar: (campos: Record<string, string>) => Promise<void>;
}

const CAMPOS: {
  key: keyof IdentidadMarca;
  label: string;
  tipo?: "color" | "textarea" | "text";
  descripcion?: string;
}[] = [
  { key: "nombre_empresa",   label: "Nombre de la empresa",  tipo: "text" },
  { key: "slogan",           label: "Slogan",                tipo: "text" },
  { key: "logo_url",         label: "URL del logo",          tipo: "text",     descripcion: "URL pública (https://...)" },
  { key: "logo_dark_url",    label: "URL del logo oscuro",   tipo: "text",     descripcion: "Versión para fondos oscuros" },
  { key: "color_primario",   label: "Color primario",        tipo: "color" },
  { key: "color_secundario", label: "Color secundario",      tipo: "color" },
  { key: "color_acento",     label: "Color acento",          tipo: "color" },
  { key: "color_texto",      label: "Color de texto",        tipo: "color" },
  { key: "color_fondo",      label: "Color de fondo",        tipo: "color" },
  { key: "fuente_principal", label: "Fuente principal",      tipo: "text",     descripcion: "Nombre de Google Font o fuente del sistema" },
  { key: "fuente_secundaria",label: "Fuente secundaria",     tipo: "text" },
  { key: "firma_whatsapp",   label: "Firma de WhatsApp",     tipo: "textarea", descripcion: "Texto que cierra cada mensaje. Ej: — Centro ECM · ceecm.mx" },
  { key: "firma_email",      label: "Firma de email",        tipo: "textarea", descripcion: "Texto o HTML de firma en correos" },
];

export function FormularioMarca({ identidad, onGuardar }: Props) {
  const inicial = Object.fromEntries(
    CAMPOS.map(({ key }) => [key, (identidad[key] as string | null) ?? ""])
  );
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  function actualizar(key: string, val: string) {
    setValores((prev) => ({ ...prev, [key]: val }));
    setGuardado(false);
  }

  async function handleGuardar() {
    setGuardando(true);
    try {
      await onGuardar(valores);
      setGuardado(true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5">
      {CAMPOS.map(({ key, label, tipo = "text", descripcion }) => (
        <div key={key} className="space-y-1">
          <label className="text-sm font-medium">{label}</label>
          {descripcion && (
            <p className="text-xs text-muted-foreground">{descripcion}</p>
          )}
          {tipo === "color" ? (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={valores[key] || "#000000"}
                onChange={(e) => actualizar(key, e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border p-0.5"
              />
              <input
                type="text"
                value={valores[key]}
                onChange={(e) => actualizar(key, e.target.value)}
                className="rounded border px-2 py-1 text-sm font-mono w-28"
                placeholder="#000000"
              />
              <div
                className="w-8 h-8 rounded border"
                style={{ backgroundColor: valores[key] || "transparent" }}
              />
            </div>
          ) : tipo === "textarea" ? (
            <textarea
              rows={3}
              value={valores[key]}
              onChange={(e) => actualizar(key, e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm font-mono resize-none"
            />
          ) : (
            <input
              type="text"
              value={valores[key]}
              onChange={(e) => actualizar(key, e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          )}
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar identidad"}
        </button>
        {guardado && (
          <span className="text-sm text-green-600">Guardado correctamente.</span>
        )}
      </div>
    </div>
  );
}
