"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "ecmatic_aprobaciones_autorecarga";
const INTERVALO_S = 15;

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // browser sin Web Audio API
  }
}

export function AutoRecargarToggle({ totalPendientes }: { totalPendientes: number }) {
  const router = useRouter();
  const [activo, setActivo] = useState(false);
  const [segundos, setSegundos] = useState(INTERVALO_S);
  const timerRefresh = useRef(false);
  const prevPendientes = useRef<number | null>(null);

  // Leer preferencia guardada al montar
  useEffect(() => {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado === "1") setActivo(true);
  }, []);

  // Detectar cambio en totalPendientes tras un refresh del timer
  useEffect(() => {
    if (!timerRefresh.current) {
      prevPendientes.current = totalPendientes;
      return;
    }
    timerRefresh.current = false;
    if (totalPendientes > 0) {
      playNotificationSound();
    }
    prevPendientes.current = totalPendientes;
  }, [totalPendientes]);

  // Intervalo + countdown cuando está activo
  useEffect(() => {
    if (!activo) {
      setSegundos(INTERVALO_S);
      return;
    }

    setSegundos(INTERVALO_S);
    const countdown = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) return INTERVALO_S;
        return s - 1;
      });
    }, 1000);

    const refresh = setInterval(() => {
      timerRefresh.current = true;
      setSegundos(INTERVALO_S);
      router.refresh();
    }, INTERVALO_S * 1000);

    return () => {
      clearInterval(countdown);
      clearInterval(refresh);
    };
  }, [activo, router]);

  const toggle = useCallback(() => {
    setActivo((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <button
      onClick={toggle}
      title={activo ? `Auto-recarga activa — próxima en ${segundos}s` : "Activar auto-recarga cada 15 s"}
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
        activo
          ? "bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
          : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
      }`}
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${
          activo ? "bg-green-500 animate-pulse" : "bg-gray-400"
        }`}
      />
      {activo ? `Auto-recarga · ${segundos}s` : "Auto-recarga"}
    </button>
  );
}
