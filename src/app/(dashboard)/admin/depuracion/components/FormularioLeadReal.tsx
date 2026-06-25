"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crearLeadRealAction } from "../actions";

export function FormularioLeadReal() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await crearLeadRealAction(new FormData(e.currentTarget));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setEnviando(false);
    }
  }

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Ingresar lead real</CardTitle>
        <p className="text-xs text-muted-foreground">
          El lead entrará al sistema normalmente. Las respuestas no le llegarán — quedan en su ficha y en la bandeja de este modo.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                name="telefono"
                type="tel"
                required
                placeholder="+521443XXXXXXX"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <input
                name="nombre"
                type="text"
                placeholder="Nombre completo"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                name="email"
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Canal de entrada <span className="text-red-500">*</span>
              </label>
              <select
                name="canal"
                required
                defaultValue="whatsapp"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="no_show">No-Show (activa protocolo)</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 rounded-md bg-red-50 border border-red-200 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {enviando ? "Creando lead…" : "Crear lead e ir a su ficha"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
