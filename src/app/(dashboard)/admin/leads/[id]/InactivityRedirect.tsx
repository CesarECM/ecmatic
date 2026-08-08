"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const IDLE_S = 60;
const COUNTDOWN_S = 60;

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(220, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch {
    // browser sin Web Audio API
  }
}

export function InactivityRedirect() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalActive = useRef(false);

  const startIdleTimer = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      modalActive.current = true;
      setShowModal(true);
      setCountdown(COUNTDOWN_S);
    }, IDLE_S * 1000);
  }, []);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    const onActivity = () => {
      if (!modalActive.current) startIdleTimer();
    };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    startIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [startIdleTimer]);

  useEffect(() => {
    if (!showModal) return;
    const interval = setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) {
          clearInterval(interval);
          playAlertSound();
          router.push("/admin/aprobaciones");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showModal, router]);

  const handleStay = useCallback(() => {
    modalActive.current = false;
    setShowModal(false);
    startIdleTimer();
  }, [startIdleTimer]);

  return (
    <Dialog open={showModal} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>¿Sigues aquí?</DialogTitle>
          <DialogDescription>
            No se detectó actividad en esta página. Serás redirigido a{" "}
            <strong>Aprobaciones</strong> en <strong>{countdown}s</strong>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleStay}>Seguir aquí</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
