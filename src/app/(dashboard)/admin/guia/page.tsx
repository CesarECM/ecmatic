import { MODULOS } from "@/lib/guia/features";
import { GuiaClient } from "./GuiaClient";

export const metadata = { title: "Guía de uso · ECMatic" };

export default function GuiaPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Guía de uso</h1>
        <p className="text-sm text-muted-foreground">
          Manual de uso en vivo. Busca cualquier función y accede directamente desde aquí.
        </p>
      </div>
      <GuiaClient modulos={MODULOS} />
    </div>
  );
}
