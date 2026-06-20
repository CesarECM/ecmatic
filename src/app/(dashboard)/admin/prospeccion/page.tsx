import { ImportarCSV } from "@/components/prospeccion/importar-csv";

export const metadata = { title: "Prospección · ECMatic" };

export default function ProspeccionPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Prospección — Listas propias</h1>
        <p className="text-sm text-muted-foreground">
          Importa contactos fríos desde un CSV. Se validan contra la blacklist, se les asigna
          tarea de seguimiento y puedes enviarles un primer mensaje de reconexión sin oferta.
        </p>
      </div>
      <ImportarCSV />
    </div>
  );
}
