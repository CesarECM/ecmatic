"use client";

import { useState } from "react";
import { ImportarCSV } from "@/components/prospeccion/importar-csv";
import { SecuenciasPanel } from "./SecuenciasPanel";

interface TemplateWA { id: string; nombre: string; estado_meta: string }

const TABS = [
  { id: "importar", label: "Importar CSV" },
  { id: "secuencias", label: "Secuencias" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ProspeccionTabs({ templates }: { templates: TemplateWA[] }) {
  const [tab, setTab] = useState<TabId>("importar");

  return (
    <div>
      <div className="flex border-b mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "importar" && <ImportarCSV />}
      {tab === "secuencias" && <SecuenciasPanel templates={templates} />}
    </div>
  );
}
