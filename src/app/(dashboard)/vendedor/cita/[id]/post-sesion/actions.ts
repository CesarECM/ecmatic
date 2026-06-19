"use server";

import { redirect } from "next/navigation";
import { registrarPostSesion } from "@/services/citas";
import type { ResultadoCita } from "@/lib/supabase/types";

export async function registrarPostSesionAction(citaId: string, formData: FormData): Promise<void> {
  const resultado = formData.get("resultado") as ResultadoCita;
  const notas = (formData.get("notas") as string) ?? "";
  const compromisos = (formData.get("compromisos") as string) ?? "";

  if (!resultado) throw new Error("Resultado requerido");

  await registrarPostSesion(citaId, { resultado, notas, compromisos });
  redirect("/vendedor/agenda");
}
