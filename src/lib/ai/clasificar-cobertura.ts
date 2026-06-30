// MPS-13 S51 — Haiku: clasifica qué tipo de seguimiento debe tener un lead sin cobertura activa.
// Usado por el re-clasificador de cobertura para recuperar leads post-limpieza o huérfanos.
import { callClaudeIA } from "./client";

export type ClasificacionCobertura =
  | "nurturing"       // sin respuesta o intercambio muy inicial
  | "conversational"  // conversación real pero sin avance hacia pago
  | "demo_agendado"   // tiene sesión de presentación agendada próximamente
  | "payment"         // confirmó intención explícita de pago
  | "cerrado";        // pagó, rechazó, o sin actividad >30 días

const TIPOS_VALIDOS: ClasificacionCobertura[] = [
  "nurturing", "conversational", "demo_agendado", "payment", "cerrado",
];

const SYSTEM = `Eres un clasificador para un CRM de ventas de certificaciones CONOCER (Centro ECM, México).
Analiza los últimos mensajes de esta conversación y determina qué tipo de seguimiento activo debe tener este lead.

Tipos posibles:
- "nurturing": nunca respondió, o solo intercambios muy iniciales (saludo, solicitud de info básica).
- "conversational": ha tenido conversación real sobre el servicio pero sin señal clara de avance hacia pago.
- "demo_agendado": tiene una sesión de presentación/demo agendada próximamente (mencionó fecha/hora concreta o confirmó slot).
- "payment": confirmó intención explícita de pagar (pidió link de pago, dijo que va a pagar, solicitó inscripción).
- "cerrado": ya pagó, rechazó explícitamente ("no me interesa", "stop"), o sin actividad real en >30 días.

Responde ÚNICAMENTE con una de esas palabras, sin texto adicional.`;

export async function clasificarCobertura(
  mensajes: string,
  meta?: { leadId?: string; traceId?: string }
): Promise<ClasificacionCobertura> {
  try {
    const resp = await callClaudeIA(
      "CLASIFICAR_COBERTURA",
      {
        max_tokens: 20,
        system: SYSTEM,
        messages: [{ role: "user", content: mensajes.slice(0, 3000) }],
      },
      meta,
    );
    const raw = ((resp.content[0] as { text: string }).text ?? "").trim().toLowerCase();
    return TIPOS_VALIDOS.includes(raw as ClasificacionCobertura)
      ? (raw as ClasificacionCobertura)
      : "nurturing";
  } catch {
    return "nurturing";
  }
}
