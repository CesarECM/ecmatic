// S27.5 — Diagnóstico de conexión WhatsApp: consulta Meta API para validar el número activo
const BASE = "https://graph.facebook.com/v20.0";

export interface WADiagnostico {
  phoneId: string;
  displayPhone: string;
  verifiedName: string;
  qualityRating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
  status: string;
  verificado: boolean;
}

export async function obtenerDiagnosticoWA(): Promise<WADiagnostico> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneId || !token) {
    throw new Error("Variables WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN no configuradas");
  }

  const fields = "display_phone_number,verified_name,quality_rating,status,code_verification_status";
  const res = await fetch(`${BASE}/${phoneId}?fields=${fields}&access_token=${token}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message: string } };
    throw new Error(err.error?.message ?? `Meta API error ${res.status}`);
  }

  const data = await res.json() as {
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    status?: string;
    code_verification_status?: string;
  };

  return {
    phoneId: data.id,
    displayPhone: data.display_phone_number ?? "—",
    verifiedName: data.verified_name ?? "—",
    qualityRating: (["GREEN", "YELLOW", "RED"].includes(data.quality_rating ?? "") ? data.quality_rating : "UNKNOWN") as WADiagnostico["qualityRating"],
    status: data.status ?? "UNKNOWN",
    verificado: data.code_verification_status === "VERIFIED",
  };
}
