import { listarLogSistema, agruparEventos } from "@/services/log-sistema";
import { LogPanel } from "@/components/log/log-panel";

export const metadata = { title: "Log de sistema · ECMatic" };
export const revalidate = 0;

interface Props {
  searchParams: Promise<{
    categoria?: string;
    tipo?: string;
    fase?: string;
    desde?: string;
    hasta?: string;
  }>;
}

export default async function LogPage({ searchParams }: Props) {
  const { categoria, tipo, fase, desde, hasta } = await searchParams;

  const registros = await listarLogSistema({ categoria, tipoAccion: tipo, fase, desde, hasta });

  const tokensTotal = registros.reduce((sum, r) => {
    const m = r.metadata as Record<string, unknown> | null;
    return sum + ((m?.tokens_input as number ?? 0) + (m?.tokens_output as number ?? 0));
  }, 0);

  const { eventos, legacy } = agruparEventos(registros);

  return (
    <LogPanel
      eventos={eventos}
      legacy={legacy}
      totalRegistros={registros.length}
      tokensTotal={tokensTotal}
      filtros={{ categoria, tipo, fase, desde, hasta }}
    />
  );
}
