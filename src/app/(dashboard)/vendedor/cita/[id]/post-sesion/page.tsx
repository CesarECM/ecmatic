import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarPostSesionAction } from "./actions";

interface Props { params: Promise<{ id: string }> }

export default async function PostSesionPage({ params }: Props) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: cita } = await supabase
    .from("citas")
    .select("id, fecha_inicio, resultado, leads(nombre, telefono)")
    .eq("id", id)
    .single();

  if (!cita) notFound();
  if (cita.resultado) {
    return (
      <div className="max-w-lg space-y-3 p-6">
        <h1 className="text-xl font-semibold">Ficha ya registrada</h1>
        <p className="text-sm text-muted-foreground">Esta cita ya tiene resultado: <strong>{cita.resultado}</strong></p>
      </div>
    );
  }

  const lead = cita.leads as unknown as { nombre: string | null; telefono: string | null } | null;
  const action = registrarPostSesionAction.bind(null, id);

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Ficha post-sesión</h1>
        <p className="text-sm text-muted-foreground">
          {lead?.nombre ?? lead?.telefono} ·{" "}
          {new Date(cita.fecha_inicio).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Resultado de la sesión</label>
          <div className="flex gap-3">
            {(["show", "noshow", "seguimiento"] as const).map((r) => (
              <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="resultado" value={r} required />
                <span className="text-sm capitalize">{r === "noshow" ? "No show" : r}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notas de la sesión</label>
          <textarea
            name="notas"
            rows={4}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="¿Cómo fue la sesión? ¿Cuál fue la objeción principal?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Compromisos adquiridos</label>
          <textarea
            name="compromisos"
            rows={2}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="¿Qué prometiste? ¿Qué prometió el lead?"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-blue-600 py-2 text-sm text-white font-medium hover:bg-blue-700"
        >
          Guardar ficha
        </button>
      </form>
    </div>
  );
}
