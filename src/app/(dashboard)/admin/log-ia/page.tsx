import { listarLogIA, agruparRegistros } from "@/services/log-ia";
import { LogIAPanel } from "@/components/log-ia/log-ia-panel";

export const metadata = { title: "Log de IA · ECMatic" };
export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    tipo?: string;
    fase?: string;
    desde?: string;
    hasta?: string;
  }>;
}

export default async function LogIAPage({ searchParams }: Props) {
  const { tipo, fase, desde, hasta } = await searchParams;

  const registros = await listarLogIA({ tipoAccion: tipo, fase, desde, hasta });

  const tokensTotal = registros.reduce((sum, r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return sum + ((m?.tokens_input as number ?? 0) + (m?.tokens_output as number ?? 0));
  }, 0);

  const { grupos, legacy } = agruparRegistros(registros);

  return (
    <LogIAPanel
      grupos={grupos}
      legacy={legacy}
      totalRegistros={registros.length}
      tokensTotal={tokensTotal}
      filtros={{ tipo, fase, desde, hasta }}
    />
  );
}
