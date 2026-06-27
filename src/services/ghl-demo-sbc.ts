import { asignarMejorVendedor, obtenerSlotsDisponibles, crearCitaConMeet } from "@/services/citas";
import { detectarSlotSeleccionado } from "@/lib/ai/slot-matcher";
import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";
import type { SlotDisponible } from "@/services/citas";
import type { ModoRevelacion } from "@/lib/ai/detector-revelacion";

interface DemoSlotsMetadata {
  demo_vendedor_id: string;
  demo_slots: Array<{ inicio: string; fin: string; vendedorId: string; vendedorNombre: string }>;
}

// Lógica de cuándo ofrecer la demo:
// - Explícita: el lead quiere agendar
// - Precierre: producto ya revelado y conversación larga (> 500 chars de historial)
function debeDispararDemo(intencion: string, historial: string, modoRevelacion: ModoRevelacion): boolean {
  if (intencion === "quiere_agendar") return true;
  if (modoRevelacion === "revelado" && historial.length > 500) return true;
  return false;
}

// Asigna vendedor, obtiene slots, los persiste en metadata del lead y los devuelve para el motor.
export async function dispararDemoSbc(
  leadId: string,
  intencion: string,
  historial: string,
  modoRevelacion: ModoRevelacion,
): Promise<SlotDisponible[] | null> {
  if (!debeDispararDemo(intencion, historial, modoRevelacion)) return null;

  const vendedorId = await asignarMejorVendedor().catch(() => null);
  if (!vendedorId) return null;

  const slots = await obtenerSlotsDisponibles(vendedorId).catch(() => [] as SlotDisponible[]);
  if (!slots.length) return null;

  const supabase = createServiceClient();
  const { data: lead } = await supabase.from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata as Record<string, unknown>) ?? {};

  await supabase.from("leads").update({
    metadata: {
      ...meta,
      demo_pendiente: {
        demo_vendedor_id: vendedorId,
        demo_slots: slots.map((s) => ({
          inicio: s.inicio.toISOString(),
          fin: s.fin.toISOString(),
          vendedorId: s.vendedorId,
          vendedorNombre: s.vendedorNombre,
        })),
      } satisfies DemoSlotsMetadata,
    },
  }).eq("id", leadId);

  void logSistema({
    categoria: "ia", tipoAccion: "ghl_demo.disparar", fase: "ok",
    leadId, resultado: `${slots.length} slots`,
    metadata: { vendedorId, intencion, historial_len: historial.length },
  });

  return slots;
}

// Cuando el lead confirma un slot: crea la cita con Meet y limpia demo_pendiente.
export async function confirmarSlotDemo(leadId: string, cuerpo: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase.from("leads").select("metadata").eq("id", leadId).single();
  const meta = (lead?.metadata as Record<string, unknown>) ?? {};
  const demoPendiente = meta.demo_pendiente as DemoSlotsMetadata | undefined;

  if (!demoPendiente?.demo_slots?.length) return null;

  const slots: SlotDisponible[] = demoPendiente.demo_slots.map((s) => ({
    inicio: new Date(s.inicio),
    fin: new Date(s.fin),
    vendedorId: s.vendedorId,
    vendedorNombre: s.vendedorNombre,
  }));

  const slotElegido = await detectarSlotSeleccionado(cuerpo, slots).catch(() => null);
  if (!slotElegido) return null;

  const { meetLink } = await crearCitaConMeet({
    leadId,
    vendedorId: demoPendiente.demo_vendedor_id,
    inicio: slotElegido.inicio,
    fin: slotElegido.fin,
    notasPrevias: "Demo SmartBuilderEC — agendada desde campaña GHL",
  }).catch(() => ({ citaId: "", meetLink: null }));

  const metaSinDemo = { ...meta };
  delete metaSinDemo.demo_pendiente;
  await supabase.from("leads").update({ metadata: metaSinDemo }).eq("id", leadId);

  void logSistema({
    categoria: "ia", tipoAccion: "ghl_demo.confirmar", fase: meetLink ? "ok" : "warn",
    leadId, resultado: meetLink ?? "sin meetLink",
    metadata: { vendedorId: demoPendiente.demo_vendedor_id, inicio: slotElegido.inicio.toISOString() },
  });

  return meetLink;
}
