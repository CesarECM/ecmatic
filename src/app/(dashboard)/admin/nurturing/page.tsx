import { listarSecuencias, obtenerLeadsParaNurturing } from "@/services/nurturing";
import { SecuenciasList } from "@/components/nurturing/secuencias-list";
import { LeadsNurturing } from "@/components/nurturing/leads-nurturing";

export const metadata = { title: "Nurturing · ECMatic" };
export const revalidate = 0;

export default async function NurturingPage() {
  const [secuencias, leads] = await Promise.all([
    listarSecuencias(),
    obtenerLeadsParaNurturing(),
  ]);

  const activas = secuencias.filter((s) => s.activo).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nurturing automático</h1>
        <p className="text-sm text-muted-foreground">
          {activas} secuencia{activas !== 1 ? "s" : ""} activa{activas !== 1 ? "s" : ""} ·{" "}
          {leads.length} lead{leads.length !== 1 ? "s" : ""} en cola
        </p>
      </div>

      <LeadsNurturing leads={leads} />

      <SecuenciasList secuencias={secuencias} />
    </div>
  );
}
