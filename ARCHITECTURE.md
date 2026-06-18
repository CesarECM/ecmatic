# ECMatic — Arquitectura y Convenciones

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind CSS + shadcn/ui |
| Base de datos | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (usuario/contraseña) |
| IA | Claude Sonnet (Anthropic) — agnóstico por módulo |
| WhatsApp | Meta WhatsApp Business API |
| Email transaccional | Resend |
| Email nurturing | Brevo |
| Pagos | Stripe |
| Calendario | Google Calendar API |
| Videollamadas | Google Meet + Workspace API |
| Certificación | SmartBuilderEC API |
| Deploy | Vercel + ceecm.mx |

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/                   # Rutas públicas (no requieren sesión)
│   │   └── login/
│   ├── (dashboard)/              # Rutas protegidas (requieren sesión)
│   │   ├── layout.tsx            # Layout con validación de sesión y rol
│   │   ├── dashboard/            # Dashboard principal
│   │   ├── admin/                # Solo rol=admin
│   │   ├── vendedor/             # Rol=vendedor (admin también accede)
│   │   └── financiero/           # Rol=admin_financiero (admin también accede)
│   └── api/
│       ├── whatsapp/webhook/     # POST /api/whatsapp/webhook (Meta)
│       └── stripe/webhook/       # POST /api/stripe/webhook
├── components/
│   ├── ui/                       # Componentes shadcn/ui (no modificar directamente)
│   ├── auth/                     # Formularios y componentes de autenticación
│   ├── dashboard/                # Componentes del panel de control
│   ├── leads/                    # Componentes de gestión de leads
│   └── conocimiento/             # Componentes de base de conocimiento
├── hooks/                        # Custom hooks de React (lógica del cliente)
├── services/                     # Lógica de negocio (servidor)
│   ├── leads.ts                  # CRUD + operaciones de leads
│   ├── mensajes.ts               # Gestión de mensajes y conversaciones
│   ├── conocimiento.ts           # Base de conocimiento + búsqueda semántica
│   └── pipeline.ts               # Movimientos y reglas de pipeline
└── lib/
    ├── supabase/                 # Clientes Supabase (client, server, middleware, types)
    ├── ai/                       # Router de modelos IA + helpers de prompts
    ├── whatsapp/                 # Helpers para Meta Graph API
    ├── stripe/                   # Helpers para Stripe API
    └── email/                    # Helpers para Resend + Brevo

supabase/
└── migrations/                   # SQL migrations en orden numérico
```

---

## Reglas estrictas de código

1. **Máximo 300 líneas por archivo.** Si supera el límite, extraer componentes o utilidades.
2. **Cero lógica de negocio en componentes UI.** Los componentes reciben props y disparan callbacks. La lógica vive en `hooks/`, `services/` o `app/api/`.
3. **Cada subsprint es un commit atómico verificable.** No avanzar sin que el entregable anterior funcione.
4. **Todas las llamadas a APIs externas** tienen manejo de errores con reintentos y backoff exponencial.
5. **Variables de entorno nunca hardcodeadas.** Siempre `process.env.VAR` — validar al inicio en cada módulo.
6. **RLS de Supabase** se configura en la misma migración donde se crea la tabla.
7. **La IA nunca ejecuta acciones irreversibles** sin aprobación del admin.
8. **Embeddings se regeneran automáticamente** al crear o actualizar recursos de conocimiento.

---

## Patrón de llamada a API externa

```typescript
// src/lib/whatsapp/send-message.ts
import { withRetry } from "@/lib/utils/retry";

export async function sendWhatsAppMessage(to: string, body: string) {
  return withRetry(
    () => fetch(`https://graph.facebook.com/...`, { method: "POST", body: JSON.stringify({ to, body }) }),
    { retries: 3, backoff: "exponential" }
  );
}
```

---

## Patrón de componente estándar

```typescript
// src/components/leads/lead-card.tsx
// Máx 300 líneas — lógica en hooks, no aquí

interface LeadCardProps {
  lead: Lead;
  onMovePipeline: (leadId: string, nuevaEtapa: string) => void;
}

export function LeadCard({ lead, onMovePipeline }: LeadCardProps) {
  // Solo UI — sin fetch, sin lógica de negocio
  return <div>...</div>;
}
```

---

## Patrón de Server Action

```typescript
// src/app/(dashboard)/leads/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function moverEtapaAction(leadId: string, nuevaEtapa: string) {
  const supabase = await createClient();
  // validar rol, ejecutar, revalidar
  revalidatePath("/dashboard/leads");
}
```

---

## Roles y acceso

| Rol | Acceso |
|---|---|
| `admin` | Todo el sistema |
| `vendedor` | Sus leads, su agenda, sus métricas |
| `admin_financiero` | Panel financiero, comisiones, pagos |

---

## Variables de entorno requeridas

Ver `.env.example` en la raíz del proyecto.

---

## Sprints

| Sprint | Módulo | Estado |
|---|---|---|
| S0 | Fundamentos y Arquitectura | ✅ Completo |
| S1 | Motor WhatsApp MVP | Pendiente |
| S2 | Base de Conocimiento | Pendiente |
| S3 | Pipeline y Perfiles | Pendiente |
| S4 | Nurturing | Pendiente |
| S5 | Matriz nD y Avatares | Pendiente |
| S6 | Gatillos Mentales | Pendiente |
| S7 | Agendamiento y Vendedores | Pendiente |
| S8 | Pagos y Stripe | Pendiente |
| S9 | Post-Venta | Pendiente |
| S10 | Panel de Control | Pendiente |
| S11 | Analítica Avanzada | Pendiente |
| S12 | Integraciones y Escala | Pendiente |
