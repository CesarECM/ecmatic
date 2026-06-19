import { listarGatillos } from "@/services/gatillos";
import { GatilloCard } from "./components/GatilloCard";
import { SugerenciasIA } from "./components/SugerenciasIA";

export const metadata = { title: "Gatillos Mentales · ECMatic" };

export default async function GatillosPage() {
  const gatillos = await listarGatillos();
  const activos = gatillos.filter((g) => g.activo).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Panel de Gatillos Mentales</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activos} activo{activos !== 1 ? "s" : ""} de {gatillos.length} — Se inyectan orgánicamente en WhatsApp y email
        </p>
      </div>

      <SugerenciasIA />

      <div className="grid gap-4 sm:grid-cols-2">
        {gatillos.map((g) => (
          <GatilloCard key={g.id} gatillo={g} />
        ))}
      </div>
    </div>
  );
}
