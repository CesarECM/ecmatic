import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buscarContactosPorTelefono } from "@/lib/ghl/contacts-api";

function soloDigitos(s: string) {
  return s.replace(/\D/g, "");
}

function normalizarTel(raw?: string | null): string | null {
  if (!raw) return null;
  const limpio = raw.replace(/^\+/, "").replace(/[\s\-().]/g, "");
  return limpio.length >= 7 ? limpio : null;
}

// GET /api/admin/leads/buscar-tel?q=<digitos>
// Busca en GHL por últimos dígitos de teléfono, cruza con leads en ECMatic.
export async function GET(req: NextRequest) {
  const q = soloDigitos(req.nextUrl.searchParams.get("q") ?? "");
  if (q.length < 4) return NextResponse.json({ leads: [] });

  try {
    const contactos = await buscarContactosPorTelefono(q);
    if (!contactos.length) return NextResponse.json({ leads: [] });

    const ghlIds = contactos.map((c) => c.id);
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("leads")
      .select("id, nombre, telefono, email, ghl_contact_id, pipeline_stage, pipeline_ruta, score_salud, ultimo_mensaje_at")
      .in("ghl_contact_id", ghlIds)
      .eq("activo", true);

    const leads = data ?? [];

    // Corregir teléfonos ghl_XXXXX en background para leads recién encontrados
    const contactoMap = new Map(contactos.map((c) => [c.id, c]));
    for (const lead of leads) {
      if (lead.telefono?.startsWith("ghl_") && lead.ghl_contact_id) {
        const contacto = contactoMap.get(lead.ghl_contact_id);
        const telReal = normalizarTel(contacto?.phone);
        if (telReal) {
          void supabase.from("leads").update({ telefono: telReal }).eq("id", lead.id);
          lead.telefono = telReal; // también en la respuesta de esta request
        }
      }
    }

    return NextResponse.json({ leads });
  } catch (err) {
    console.error("[buscar-tel]", err);
    return NextResponse.json({ leads: [] });
  }
}
