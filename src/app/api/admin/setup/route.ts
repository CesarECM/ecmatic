import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SEED_TOKEN = process.env.SEED_SECRET_TOKEN ?? "ecmatic_seed_2026";
const ADMIN_EMAIL = "cesar@ceecm.mx";
const ADMIN_PASSWORD = "ECMatic2026!";

// Crea el primer usuario admin si no existe — ejecutar una sola vez
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${SEED_TOKEN}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: existentes } = await supabase.auth.admin.listUsers();
  const yaExiste = existentes?.users.some((u) => u.email === ADMIN_EMAIL);

  if (yaExiste) {
    return NextResponse.json({ message: "El admin ya existe, inicia sesión normalmente", email: ADMIN_EMAIL });
  }

  const { data, error: authError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (authError || !data.user) {
    return NextResponse.json({ error: authError?.message ?? "Error creando usuario" }, { status: 500 });
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: data.user.id, email: ADMIN_EMAIL, nombre: "Cesar", rol: "admin" });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Admin creado exitosamente",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
}
