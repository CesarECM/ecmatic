// MPS-6 S41.1 — Trust Score Bayesiano para niveles de confianza de campaña.
// Velocidad (lote, intervalo) = función continua del trust_score.
// Calidad (umbral_auto) = fija en 0.92, independiente del nivel.

import type { NivelCampana } from "@/services/ghl-aprobacion";

// ── Constantes ────────────────────────────────────────────────────────────────

export const UMBRAL_AUTO_FIJO   = 0.92;  // calidad mínima para auto-aprobar (nunca cambia)
export const UMBRAL_BORDERLINE  = 0.05;  // margen adicional exigido en nivel 4
export const SAMPLE_RATE        = 50;    // 1 de cada N candidatos va a revisión humana
export const TRUST_NIVEL4       = 0.86;  // trust_score mínimo para auto-activar nivel 4
export const DECAY_GRACE_DAYS   = 3;     // días sin decisión antes de iniciar decay

// Anclas de interpolación: [trust_score] → [lote, intervalo]
const ANCLAS_TS       = [0, 0.30, 0.56, 0.75, 0.86] as const;
const ANCLAS_LOTE     = [10, 20, 30, 50, 100]        as const;
const ANCLAS_INTERVALO = [60, 30, 20, 15, 10]        as const;

// ── Wilson lower bound ────────────────────────────────────────────────────────

// Límite inferior conservador del intervalo de confianza de Wilson.
// Equivale aproximadamente al percentil 10 de Beta(alpha, beta).
// z = 1.28 → intervalo unilateral al 90 % (percentil 10 inferior).
function wilsonLower(alpha: number, beta: number): number {
  const n = alpha + beta;
  if (n <= 0) return 0;
  const p   = alpha / n;
  const z   = 1.28;
  const z2  = z * z;
  const num = p + z2 / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  const den = 1 + z2 / n;
  return Math.max(0, Math.min(1, num / den));
}

// ── Trust Score ───────────────────────────────────────────────────────────────

// Calcula el trust_score a partir de la ventana de decisiones.
// window[i] = 1 (aprobado) | 0 (editado) | -1 (phantom edit por decay)
// Los rechazados no entran en la ventana.
export function calcularTrustScore(window: number[]): number {
  if (window.length === 0) return 0;
  const alpha = window.filter((v) => v === 1).length + 0.5;  // Jeffreys prior
  const beta  = window.filter((v) => v <= 0).length + 0.5;   // editados + phantoms
  return wilsonLower(alpha, beta);
}

// ── Ventana deslizante ────────────────────────────────────────────────────────

// Agrega una decisión humana a la ventana circular.
// Los rechazados no modifican la ventana (son decisiones de enrutamiento, no de calidad).
export function updateDecisionsWindow(
  window: number[],
  decision: "aprobado" | "editado" | "rechazado",
  windowSize: number,
): number[] {
  if (decision === "rechazado") return window;
  const val     = decision === "aprobado" ? 1 : 0;
  const updated = [...window, val];
  return updated.length > windowSize ? updated.slice(-windowSize) : updated;
}

// Inyecta un phantom edit (-1) por decay temporal (sin decisión humana > grace period).
export function injectPhantomEdit(window: number[], windowSize: number): number[] {
  const updated = [...window, -1];
  return updated.length > windowSize ? updated.slice(-windowSize) : updated;
}

// ── Interpolación lineal a tramos ─────────────────────────────────────────────

function interpolate(ts: number, anclas: readonly number[], valores: readonly number[]): number {
  if (ts <= anclas[0]) return valores[0];
  if (ts >= anclas[anclas.length - 1]) return valores[valores.length - 1];
  for (let i = 0; i < anclas.length - 1; i++) {
    if (ts >= anclas[i] && ts <= anclas[i + 1]) {
      const t = (ts - anclas[i]) / (anclas[i + 1] - anclas[i]);
      return valores[i] + t * (valores[i + 1] - valores[i]);
    }
  }
  return valores[valores.length - 1];
}

// ── Parámetros operativos ─────────────────────────────────────────────────────

// Deriva lote e intervalo del trust_score (interpolación continua).
// nivel es solo etiqueta diagnóstica — no controla nada.
export function parametrosDesdeScore(
  trustScore: number,
  automatizado: boolean,
): NivelCampana {
  if (automatizado) {
    return {
      nivel: 4,
      tamanoLote: 100,
      intervaloMin: 10,
      umbral: UMBRAL_AUTO_FIJO,
      descripcion: "Plena confianza — velocidad máxima, calidad mínima 92 %",
    };
  }

  const tamanoLote  = Math.round(interpolate(trustScore, ANCLAS_TS, ANCLAS_LOTE));
  const intervaloMin = Math.round(interpolate(trustScore, ANCLAS_TS, ANCLAS_INTERVALO));

  const nivel: 0 | 1 | 2 | 3 | 4 =
    trustScore >= 0.86 ? 4 :
    trustScore >= 0.75 ? 3 :
    trustScore >= 0.56 ? 2 :
    trustScore >= 0.30 ? 1 : 0;

  const descripciones = [
    "Inicio — todos los mensajes requieren aprobación manual",
    "Rodaje — casi todo va a revisión",
    "Confianza media — los mejores salen solos",
    "Alta confianza — mensajes dudosos van a revisión",
    "Plena confianza — velocidad máxima, calidad mínima 92 %",
  ] as const;

  return {
    nivel,
    tamanoLote,
    intervaloMin,
    umbral: UMBRAL_AUTO_FIJO,
    descripcion: descripciones[nivel],
  };
}

// ── Decisión de auto-aprobación ───────────────────────────────────────────────

// Determina si un mensaje candidato debe auto-aprobarse, ir a borderline o a revisión.
// sampleCounter: número secuencial del mensaje en la sesión de auto-aprobación (para 1/N sampling).
export function debeAutoAprobar(
  scoreIA: number,
  nivel: 0 | 1 | 2 | 3 | 4,
  sampleCounter: number,
): "auto" | "borderline" | "review" {
  // Por debajo del umbral fijo: siempre a revisión
  if (scoreIA < UMBRAL_AUTO_FIJO) return "review";

  // Salvaguarda A: muestreo forzado 1/N (todos los niveles)
  if (sampleCounter % SAMPLE_RATE === 0) return "review";

  // Salvaguarda B: zona borderline en nivel 4
  if (nivel === 4 && scoreIA < UMBRAL_AUTO_FIJO + UMBRAL_BORDERLINE) return "borderline";

  return "auto";
}
