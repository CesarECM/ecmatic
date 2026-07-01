// MPS-20 S73.3 — Registro de señales KBI.
// Función única: registrarSenales(tipo, recursoIds, opts).
// Una llamada → N filas en kbi_senales (una por recurso).
// Sin lógica adicional — el cron de scores lee aquí.

import { createServiceClient } from "@/lib/supabase/service";
import { logSistema } from "@/services/log-sistema";

export type TipoSenal =
  | "uso"            // recurso recuperado y enviado al prompt de IA
  | "cierre"         // lead avanzó o compró mientras el recurso estaba activo
  | "perdida"        // lead se perdió mientras el recurso estaba activo
  | "rechazo_admin"  // admin rechazó sugerencia KBI originada en este recurso
  | "edicion_admin"; // admin editó el recurso manualmente

interface OpcionesSenal {
  leadId?: string;
  sesionId?: string;
}

// Registra la misma señal para todos los recursoIds en paralelo.
// No lanza excepción: las señales son best-effort (no bloquean el flujo principal).
export async function registrarSenales(
  tipo: TipoSenal,
  recursoIds: string[],
  opts: OpcionesSenal = {},
): Promise<void> {
  if (!recursoIds.length) return;

  const supabase = createServiceClient();
  const filas = recursoIds.map((recurso_id) => ({
    recurso_id,
    tipo_senal: tipo,
    lead_id:    opts.leadId   ?? null,
    sesion_id:  opts.sesionId ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("kbi_senales").insert(filas);

  if (error) {
    void logSistema({
      categoria: "servicio",
      tipoAccion: "kbi.senales.registrar",
      fase: "error",
      resultado: error.message,
      metadata: { tipo, count: recursoIds.length },
    });
  }
}

// Conveniencia: registrar señal para un solo recurso.
export async function registrarSenal(
  tipo: TipoSenal,
  recursoId: string,
  opts: OpcionesSenal = {},
): Promise<void> {
  return registrarSenales(tipo, [recursoId], opts);
}
