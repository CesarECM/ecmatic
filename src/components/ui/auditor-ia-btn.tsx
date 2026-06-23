"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuditorIAModalContent } from "@/components/ui/auditor-ia-modal-content";
import { obtenerEstadoAuditoriaAction } from "@/app/(dashboard)/admin/auditor-ia/actions";
import type { EstadoAuditoria, TipoAuditoria } from "@/app/(dashboard)/admin/auditor-ia/actions";

interface Props {
  tipo: TipoAuditoria;
  id: string;
  nombre: string;
  pendientesIniciales?: number;
  className?: string;
}

export function AuditorIABtn({ tipo, id, nombre, pendientesIniciales = 0, className = "" }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<EstadoAuditoria | null>(null);
  const [cargando, setCargando] = useState(false);

  const pendientes = estado?.sugerencias_pendientes.length ?? pendientesIniciales;

  async function fetchEstado() {
    setCargando(true);
    try {
      const data = await obtenerEstadoAuditoriaAction(tipo, id);
      setEstado(data);
    } finally {
      setCargando(false);
    }
  }

  async function abrir() {
    setAbierto(true);
    if (!estado) await fetchEstado();
  }

  return (
    <>
      <button
        type="button"
        title="Auditoría IA"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrir(); }}
        className={`relative flex items-center justify-center w-7 h-7 rounded-full
          bg-gradient-to-br from-pink-500 to-orange-400 text-white
          hover:from-pink-600 hover:to-orange-500 hover:scale-110
          transition-all shadow-sm hover:shadow-md shrink-0 ${className}`}
        style={{ opacity: pendientes > 0 ? 1 : 0.65 }}
      >
        <span className="text-[12px] font-bold select-none">✦</span>
        {pendientes > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold leading-none px-0.5">
            {pendientes > 9 ? "9+" : pendientes}
          </span>
        )}
      </button>

      <Dialog open={abierto} onOpenChange={(v: boolean) => { if (!v) setAbierto(false); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-white text-[10px] font-bold shrink-0">
                ✦
              </span>
              <span className="truncate">Auditoría IA — {nombre}</span>
            </DialogTitle>
          </DialogHeader>

          {cargando && !estado && (
            <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
              Consultando estado de auditoría…
            </div>
          )}

          {estado && (
            <AuditorIAModalContent
              estado={estado}
              tipo={tipo}
              entityId={id}
              onRefrescar={fetchEstado}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
