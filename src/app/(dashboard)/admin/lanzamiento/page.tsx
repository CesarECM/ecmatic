import { createServiceClient } from "@/lib/supabase/service";
import { ChecklistLanzamiento } from "@/components/admin/checklist-lanzamiento";
import type { Seccion } from "@/components/admin/checklist-lanzamiento";

export const metadata = { title: "Checklist de Lanzamiento · ECMatic" };
export const revalidate = 0;

function env(key: string) {
  return !!process.env[key];
}

async function obtenerConteos() {
  const db = createServiceClient();
  const [{ count: recursos }, { count: vendedores }] = await Promise.all([
    db.from("recursos_conocimiento").select("id", { count: "exact", head: true }).eq("aprobado", true),
    db.from("vendedores").select("id", { count: "exact", head: true }).eq("activo", true),
  ]);
  return { recursos: recursos ?? 0, vendedores: vendedores ?? 0 };
}

export default async function LanzamientoPage() {
  const { recursos, vendedores } = await obtenerConteos();

  const secciones: Seccion[] = [
    {
      titulo: "Infraestructura",
      items: [
        { label: "Supabase URL + service role key", ok: env("NEXT_PUBLIC_SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY") },
        { label: "Anthropic API key (Claude)", ok: env("ANTHROPIC_API_KEY") },
        { label: "OpenAI API key (embeddings)", ok: env("OPENAI_API_KEY") },
        { label: "CRON_SECRET para endpoints de Vercel", ok: env("CRON_SECRET") },
        { label: "SEED_SECRET_TOKEN para seeds admin", ok: env("SEED_SECRET_TOKEN") },
      ],
    },
    {
      titulo: "WhatsApp",
      items: [
        { label: "WHATSAPP_PHONE_NUMBER_ID", ok: env("WHATSAPP_PHONE_NUMBER_ID") },
        { label: "WHATSAPP_ACCESS_TOKEN (System User, no expira)", ok: env("WHATSAPP_ACCESS_TOKEN") },
        { label: "WHATSAPP_VERIFY_TOKEN", ok: env("WHATSAPP_VERIFY_TOKEN") },
        { label: "ADMIN_WHATSAPP (número para alertas internas)", ok: env("ADMIN_WHATSAPP") },
      ],
    },
    {
      titulo: "Email",
      items: [
        { label: "RESEND_API_KEY (transaccional)", ok: env("RESEND_API_KEY") },
        { label: "ADMIN_EMAIL (notificaciones internas)", ok: env("ADMIN_EMAIL") },
        { label: "BREVO_API_KEY (nurturing)", ok: env("BREVO_API_KEY") },
        { label: "BREVO_LIST_ID_TRIPWIRE", ok: env("BREVO_LIST_ID_TRIPWIRE") },
        { label: "BREVO_LIST_ID_PREMIUM", ok: env("BREVO_LIST_ID_PREMIUM") },
      ],
    },
    {
      titulo: "Pagos",
      items: [
        { label: "STRIPE_SECRET_KEY", ok: env("STRIPE_SECRET_KEY") },
        { label: "STRIPE_WEBHOOK_SECRET", ok: env("STRIPE_WEBHOOK_SECRET") },
        { label: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", ok: env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") },
      ],
    },
    {
      titulo: "Integraciones opcionales",
      items: [
        { label: "Google OAuth (Calendar + Meet)", ok: env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"), detalle: "Necesario para agendar citas con Meet link" },
        { label: "SmartBuilderEC API", ok: env("SMARTBUILDER_API_URL") && env("SMARTBUILDER_API_KEY"), detalle: "Activar post-venta y progreso de certificación" },
        { label: "Facturama (CFDI 4.0)", ok: env("FACTURAMA_USER") && env("FACTURAMA_PASSWORD"), detalle: "Emisión de facturas desde perfil de lead" },
      ],
    },
    {
      titulo: "Legal y contenido",
      items: [
        { label: "PRIVACY_URL (aviso de privacidad LFPDPPP)", ok: env("PRIVACY_URL"), detalle: "URL del aviso enviado en primer contacto WA" },
        { label: "Base de conocimiento cargada", ok: recursos >= 10, detalle: `${recursos} recursos aprobados (mínimo recomendado: 10)` },
        { label: "Vendedores configurados", ok: vendedores >= 1, detalle: `${vendedores} vendedor${vendedores !== 1 ? "es" : ""} activo${vendedores !== 1 ? "s" : ""}` },
      ],
    },
  ];

  const totalAuto = secciones.flatMap((s) => s.items).length;
  const okAuto = secciones.flatMap((s) => s.items).filter((i) => i.ok).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Checklist de Lanzamiento</h1>
        <p className="text-sm text-muted-foreground">
          Verifica que todo esté configurado antes de salir a producción con ceecm.mx.
        </p>
      </div>
      <ChecklistLanzamiento
        secciones={secciones}
        totalAuto={totalAuto}
        okAuto={okAuto}
        recursosKB={recursos}
        vendedoresActivos={vendedores}
      />
    </div>
  );
}
