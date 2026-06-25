"use client";

// Extraído de lead-perfil.tsx para respetar el límite de 300 líneas
import { useTransition, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { emitirFacturaAction } from "@/app/(dashboard)/admin/leads/[id]/actions";

interface FacturacionCardProps {
  leadId: string;
  rfc: string;
  cfdiUuid?: string;
  cpFiscal?: string;
}

export function FacturacionCard({ leadId, rfc, cfdiUuid, cpFiscal }: FacturacionCardProps) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Facturación CFDI</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {cfdiUuid && (
          <p className="text-xs text-green-700 font-medium">Último UUID: {cfdiUuid}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await emitirFacturaAction(fd);
              setMsg(res.error ? `Error: ${res.error}` : `Factura emitida: ${res.data.uuid}`);
            });
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <input type="hidden" name="leadId" value={leadId} />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Monto total (con IVA)</label>
            <input name="monto" type="number" min="1" step="0.01" required
              placeholder="1160.00"
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CP fiscal del receptor</label>
            <input name="cp_fiscal" defaultValue={cpFiscal ?? ""}
              placeholder="00000"
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Descripción del servicio</label>
            <input name="descripcion" defaultValue="Servicio de certificación CONOCER"
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Emitiendo..." : "Emitir factura"}
            </Button>
            <span className="text-xs text-muted-foreground">RFC: {rfc}</span>
          </div>
        </form>
        {msg && (
          <p className={`text-xs font-medium ${msg.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
            {msg}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
