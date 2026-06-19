import { ChatWidget } from "@/components/sandbox/chat-widget";

export const metadata = { title: "Widget de Pruebas · ECMatic" };

export default function SandboxPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Widget de Pruebas</h1>
        <p className="text-sm text-muted-foreground">
          Simula conversaciones con la IA sin enviar mensajes reales por WhatsApp.
          Cada sesión crea un lead de prueba aislado.
        </p>
      </div>
      <ChatWidget />
    </div>
  );
}
