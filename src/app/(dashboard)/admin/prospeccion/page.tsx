import { listarTemplates } from "@/services/wa-templates";
import { ProspeccionTabs } from "./components/ProspeccionTabs";

export const metadata = { title: "Prospección · ECMatic" };

export default async function ProspeccionPage() {
  const templates = await listarTemplates();
  const templatesWA = templates.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    estado_meta: t.estado_meta,
  }));

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Prospección</h1>
        <p className="text-sm text-muted-foreground">
          Importa contactos y configura secuencias omnicanal automáticas.
        </p>
      </div>
      <ProspeccionTabs templates={templatesWA} />
    </div>
  );
}
