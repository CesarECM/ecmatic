// S24.2 — CRUD de cuentas bancarias globales para transferencia.
// Son globales (aplican a todos los servicios); el monto viene del precio del servicio.

import { createServiceClient } from "@/lib/supabase/service";

export interface CuentaBancaria {
  id: string;
  banco: string;
  titular: string;
  clabe: string | null;
  cuenta: string | null;
  activa: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface CrearCuentaBancariaInput {
  banco: string;
  titular: string;
  clabe?: string | null;
  cuenta?: string | null;
  activa?: boolean;
  orden?: number;
}

export async function listarCuentasActivas(): Promise<CuentaBancaria[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .select("*")
    .eq("activa", true)
    .order("orden");
  if (error) throw new Error(`[cuentas-bancarias] Error listando: ${error.message}`);
  return (data ?? []) as CuentaBancaria[];
}

export async function listarCuentas(): Promise<CuentaBancaria[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .select("*")
    .order("orden");
  if (error) throw new Error(`[cuentas-bancarias] Error listando: ${error.message}`);
  return (data ?? []) as CuentaBancaria[];
}

export async function crearCuentaBancaria(input: CrearCuentaBancariaInput): Promise<CuentaBancaria> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .insert({
      banco:   input.banco,
      titular: input.titular,
      clabe:   input.clabe ?? null,
      cuenta:  input.cuenta ?? null,
      activa:  input.activa ?? true,
      orden:   input.orden ?? 0,
    })
    .select()
    .single();
  if (error) throw new Error(`[cuentas-bancarias] Error creando: ${error.message}`);
  return data as CuentaBancaria;
}

export async function actualizarCuentaBancaria(
  id: string,
  campos: Partial<Omit<CuentaBancaria, "id" | "created_at" | "updated_at">>
): Promise<CuentaBancaria> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cuentas_bancarias")
    .update(campos)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[cuentas-bancarias] Error actualizando: ${error.message}`);
  return data as CuentaBancaria;
}

export async function eliminarCuentaBancaria(id: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("cuentas_bancarias").delete().eq("id", id);
  if (error) throw new Error(`[cuentas-bancarias] Error eliminando: ${error.message}`);
}

export function formatearCuentaParaPrompt(c: CuentaBancaria): string {
  const lineas = [`${c.banco} | Titular: ${c.titular}`];
  if (c.clabe) lineas.push(`CLABE: ${c.clabe}`);
  if (c.cuenta) lineas.push(`Cuenta: ${c.cuenta}`);
  return lineas.join(" | ");
}
