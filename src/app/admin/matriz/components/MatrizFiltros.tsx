"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TEMPERAMENTOS = ["D", "I", "S", "C"];
const OBJECIONES = ["precio", "tiempo", "no_sirva", "titulo", "pensarlo", "otro"];
const TEMPERATURAS = ["fria", "tibia", "caliente"];

export function MatrizFiltros() {
  const router = useRouter();
  const params = useSearchParams();

  function actualizar(key: string, value: string) {
    const nuevo = new URLSearchParams(params.toString());
    if (value) {
      nuevo.set(key, value);
    } else {
      nuevo.delete(key);
    }
    router.push(`/admin/matriz?${nuevo.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        className="rounded border px-2 py-1 text-sm"
        value={params.get("aprobado") ?? ""}
        onChange={(e) => actualizar("aprobado", e.target.value)}
      >
        <option value="">Todas</option>
        <option value="true">Aprobadas</option>
        <option value="false">Pendientes</option>
      </select>

      <select
        className="rounded border px-2 py-1 text-sm"
        value={params.get("temperamento") ?? ""}
        onChange={(e) => actualizar("temperamento", e.target.value)}
      >
        <option value="">Temperamento</option>
        {TEMPERAMENTOS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <select
        className="rounded border px-2 py-1 text-sm"
        value={params.get("objecion") ?? ""}
        onChange={(e) => actualizar("objecion", e.target.value)}
      >
        <option value="">Objeción</option>
        {OBJECIONES.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>

      <select
        className="rounded border px-2 py-1 text-sm"
        value={params.get("temperatura") ?? ""}
        onChange={(e) => actualizar("temperatura", e.target.value)}
      >
        <option value="">Temperatura</option>
        {TEMPERATURAS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <button
        className="rounded border px-2 py-1 text-sm text-gray-500 hover:text-gray-800"
        onClick={() => router.push("/admin/matriz")}
      >
        Limpiar
      </button>
    </div>
  );
}
