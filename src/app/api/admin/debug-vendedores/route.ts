import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/debug-vendedores — diagnóstico temporal, eliminar tras uso
export async function GET() {
  const resultados: Record<string, unknown> = {};

  try {
    const supabase = createServiceClient();
    resultados.cliente = "ok";

    try {
      const { data, error } = await supabase
        .from("vendedores")
        .select("id, profile_id, nombre, email, activo, peso")
        .limit(1);
      resultados.query_vendedores = error ? `ERROR: ${error.message}` : `ok (${data?.length ?? 0} filas)`;
    } catch (e) {
      resultados.query_vendedores = `THROW: ${String(e)}`;
    }

    try {
      const { data: authData, error } = await supabase.auth.admin.listUsers({ perPage: 5 });
      resultados.list_users = error ? `ERROR: ${error.message}` : `ok (${authData?.users?.length ?? 0} users)`;
    } catch (e) {
      resultados.list_users = `THROW: ${String(e)}`;
    }

    try {
      const { calcularMetricasVendedor } = await import("@/services/vendedor-metricas");
      const { data: vendedores } = await supabase.from("vendedores").select("id").limit(1);
      if (vendedores?.[0]) {
        await calcularMetricasVendedor(vendedores[0].id);
        resultados.calcular_metricas = "ok";
      } else {
        resultados.calcular_metricas = "sin vendedores para testear";
      }
    } catch (e) {
      resultados.calcular_metricas = `THROW: ${String(e)}`;
    }

  } catch (e) {
    resultados.cliente = `THROW: ${String(e)}`;
  }

  return NextResponse.json(resultados);
}
