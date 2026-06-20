import { revalidatePath } from "next/cache";
import { obtenerIdentidad, actualizarIdentidad } from "@/services/identidad-marca";
import { FormularioMarca } from "./components/FormularioMarca";

export const metadata = { title: "Identidad de Marca · ECMatic" };
export const revalidate = 0;

export default async function MarcaPage() {
  const identidad = await obtenerIdentidad();

  async function guardar(campos: Record<string, string>) {
    "use server";
    await actualizarIdentidad(campos);
    revalidatePath("/admin/marca");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Identidad de marca</h1>
        <p className="text-sm text-muted-foreground">
          Datos usados por la IA para aplicar branding en templates y respuestas.
        </p>
      </div>
      <FormularioMarca identidad={identidad} onGuardar={guardar} />
    </div>
  );
}
