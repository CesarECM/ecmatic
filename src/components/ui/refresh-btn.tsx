"use client";
import { useRouter } from "next/navigation";

export function RefreshBtn({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.refresh()}
      title="Actualizar datos sin recargar página"
      className={`text-base leading-none text-muted-foreground hover:text-foreground rounded transition-colors px-1.5 py-0.5 hover:bg-muted ${className ?? ""}`}
    >
      ↻
    </button>
  );
}
