import { listarCategorias, listarPendientes } from "@/services/etiquetas";
import { CategoriasPanel } from "@/components/etiquetas/categorias-panel";
import { Badge } from "@/components/ui/badge";
import { crearCategoriaAction } from "./actions";

export const metadata = { title: "Etiquetas · ECMatic" };
export const revalidate = 0;

export default async function EtiquetasPage() {
  const [categorias, pendientes] = await Promise.all([
    listarCategorias(),
    listarPendientes(),
  ]);

  const totalActivas = categorias.reduce(
    (n, c) => n + c.etiquetas.filter((e) => e.estado === "activa").length, 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">
            {totalActivas} activas · {pendientes.length} pendientes de revisión
          </p>
        </div>
        <form action={crearCategoriaAction} className="flex gap-2">
          <input
            name="nombre"
            placeholder="Nueva categoría..."
            className="h-8 rounded-md border px-2 text-sm w-44"
            required
          />
          <input name="color" type="color" className="h-8 w-10 rounded border cursor-pointer" defaultValue="#6B7280" />
          <button type="submit" className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm">
            Crear
          </button>
        </form>
      </div>

      {pendientes.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-2">
          <p className="text-sm font-medium text-yellow-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            {pendientes.length} etiqueta{pendientes.length > 1 ? "s" : ""} sugerida{pendientes.length > 1 ? "s" : ""} por IA — pendiente de aprobación
          </p>
          <div className="flex flex-wrap gap-2">
            {pendientes.map((e) => (
              <Badge key={e.id} variant="outline" className="text-xs border-yellow-400 text-yellow-800">
                {e.categoria_nombre} / {e.nombre}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-yellow-700">
            Aprueba o archiva cada una desde el árbol de categorías abajo.
          </p>
        </div>
      )}

      <CategoriasPanel categorias={categorias} />
    </div>
  );
}
