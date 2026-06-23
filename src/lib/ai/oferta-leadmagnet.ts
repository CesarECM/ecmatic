// S20.2 — Genera el mensaje WhatsApp que ofrece un leadmagnet al lead.
// Tono: amigable, sin presión, enmarcado como recurso gratuito de valor.

import { callClaudeIA } from "./client";
import type { TipoLeadmagnet } from "@/lib/supabase/types";

interface ContextoOfertaLeadmagnet {
  nombreLead: string | null;
  tituloLeadmagnet: string;
  descripcionLeadmagnet: string;
  tipoLeadmagnet: TipoLeadmagnet;
  faseCAGC: number;
}

const SYSTEM = `Eres un asesor de certificaciones CONOCER que quiere compartir un recurso gratuito útil.
Genera un mensaje de WhatsApp muy breve (1–2 oraciones) ofreciendo el recurso mencionado.

REGLAS:
- Tono amigable, sin presión de venta
- Enmarca el recurso como algo de valor genuino para el lead
- Termina con una pregunta de confirmación sencilla ("¿Te lo comparto?", "¿Lo quieres?")
- Sin emojis excesivos (máx 1)
- Sin frases de marketing agresivas`;

export async function generarMensajeOfertaLeadmagnet(
  ctx: ContextoOfertaLeadmagnet
): Promise<string> {
  const userContent = `Lead: ${ctx.nombreLead ?? "el candidato"}
Recurso a ofrecer: ${ctx.tituloLeadmagnet}
Descripción: ${ctx.descripcionLeadmagnet}
Tipo: ${ctx.tipoLeadmagnet}
Fase CAGC del comprador: ${ctx.faseCAGC}

Genera el mensaje de oferta ahora.`;

  const response = await callClaudeIA("LEADMAGNET", {
    max_tokens: 120,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  return ((response.content[0] as { text: string }).text ?? "").trim();
}
