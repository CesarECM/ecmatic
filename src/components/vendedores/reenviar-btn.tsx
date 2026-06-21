"use client";

import { useState } from "react";
import { toast } from "sonner";
import { reenviarInvitacionAction } from "@/app/(dashboard)/admin/vendedores/actions";

export function ReenviarBtn({ email }: { email: string }) {
  const [enviando, setEnviando] = useState(false);

  async function handleReenviar() {
    setEnviando(true);
    const tid = toast.loading("Reenviando invitación…");
    try {
      await reenviarInvitacionAction(email);
      toast.success("Invitación reenviada", { id: tid });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado", { id: tid });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button
      onClick={handleReenviar}
      disabled={enviando}
      className="text-xs text-amber-600 hover:underline disabled:opacity-40"
    >
      Reenviar invitación
    </button>
  );
}
