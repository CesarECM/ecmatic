import { listarUsuariosPrueba } from "@/services/usuarios-prueba";
import { createServiceClient } from "@/lib/supabase/service";
import { UsuariosPruebaList } from "./components/UsuariosPruebaList";
import { AgregarUsuarioPruebaForm } from "./components/AgregarUsuarioPruebaForm";

export const metadata = { title: "Usuarios de Prueba · ECMatic" };
export const dynamic = "force-dynamic";

export default async function PruebasPage() {
  const db = createServiceClient();

  const [usuarios, { data: perfiles }] = await Promise.all([
    listarUsuariosPrueba(),
    db.from("profiles").select("id, nombre, email, rol").order("nombre"),
  ]);

  return (
    <main className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Usuarios de Prueba</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Números reales con acceso completo al flujo WA + GHL. El reset los deja como si nunca
          hubieran contactado: borra historial ECMatic y limpia tags, pipeline y conversación en GHL.
        </p>
      </div>

      <UsuariosPruebaList usuarios={usuarios} />

      <AgregarUsuarioPruebaForm perfiles={perfiles ?? []} />

      <div className="border rounded-lg p-4 bg-muted/30 space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Notas sobre el reset</p>
        <p>• ECMatic: borra el registro de lead y todo su historial en cascada.</p>
        <p>• GHL: elimina tags, oportunidades y conversación WhatsApp. El contacto GHL permanece — su acceso al panel GHL nunca se toca.</p>
        <p>• Los admins ECMatic se identifican con una advertencia antes de confirmar.</p>
        <p>• Tras el reset, el lead se recrea automáticamente cuando el usuario envíe un mensaje de WhatsApp.</p>
        <p>• Botón <strong>+ Campaña</strong>: inscribe al usuario en el workflow SBC activo (variante A o B según Thompson Sampling).</p>
      </div>
    </main>
  );
}
