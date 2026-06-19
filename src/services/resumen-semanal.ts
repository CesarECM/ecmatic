import { createServiceClient } from "@/lib/supabase/service";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { verificarSalud } from "./health";

// S10.4 — Genera y envía el resumen semanal al admin por WhatsApp
export async function enviarResumenSemanal(): Promise<void> {
  const adminWa = process.env.ADMIN_WHATSAPP;
  if (!adminWa) {
    console.warn("[resumen-semanal] ADMIN_WHATSAPP no configurado");
    return;
  }

  const supabase = createServiceClient();
  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - 7);
  const desde = inicioSemana.toISOString();

  const [
    { count: leadsNuevos },
    { count: conversiones },
    { data: mensajesIntencion },
    { data: pendientesKb },
    { data: pendientesMatriz },
    salud,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", desde),
    supabase.from("pagos").select("id", { count: "exact", head: true })
      .eq("estado", "completado").gte("created_at", desde),
    supabase.from("mensajes").select("intencion_clasificada")
      .eq("direccion", "entrante").gte("created_at", desde).not("intencion_clasificada", "is", null),
    supabase.from("recursos_conocimiento").select("id", { count: "exact", head: true })
      .eq("aprobado", false),
    supabase.from("matriz_nd").select("id", { count: "exact", head: true })
      .eq("aprobado", false),
    verificarSalud(),
  ]);

  // Objeción más frecuente
  const conteoIntenciones: Record<string, number> = {};
  for (const m of mensajesIntencion ?? []) {
    if (m.intencion_clasificada) {
      conteoIntenciones[m.intencion_clasificada] = (conteoIntenciones[m.intencion_clasificada] ?? 0) + 1;
    }
  }
  const objecionTop = Object.entries(conteoIntenciones).sort((a, b) => b[1] - a[1])[0];

  // Estado de integraciones (solo rojo/degraded)
  const problemas = salud.filter((s) => s.estado !== "ok");
  const estadoIntegraciones = problemas.length === 0
    ? "✅ Todas operativas"
    : `⚠️ ${problemas.map((p) => p.nombre).join(", ")}`;

  const totalPendientes = (pendientesKb?.length ?? 0) + (pendientesMatriz?.length ?? 0);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ecmatic.vercel.app";

  const msg = [
    `📊 *Resumen semanal ECMatic* — ${new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`,
    ``,
    `👥 Leads nuevos esta semana: *${leadsNuevos ?? 0}*`,
    `💰 Conversiones (pagos): *${conversiones ?? 0}*`,
    `🗣️ Intención más frecuente: *${objecionTop ? `${objecionTop[0]} (${objecionTop[1]}x)` : "Sin datos"}*`,
    ``,
    `🔌 Integraciones: ${estadoIntegraciones}`,
    `✍️ Aprobaciones pendientes: *${totalPendientes}*`,
    ``,
    `🔗 ${appUrl}/admin/sistema`,
  ].join("\n");

  await sendTextMessage(adminWa, msg);
}
