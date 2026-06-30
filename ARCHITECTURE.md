# ECMatic — Arquitectura y Convenciones

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind CSS + shadcn/ui |
| Base de datos | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (usuario/contraseña) |
| IA | Claude via Anthropic SDK — modelo por tarea via model-router |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) |
| WhatsApp | Meta WhatsApp Business API v20 |
| Email transaccional | Resend |
| Email nurturing | Brevo (listas segmentadas) |
| Pagos | Stripe (Checkout Sessions + webhooks) |
| Calendario | Google Calendar API (OAuth por vendedor) |
| Videollamadas | Google Meet (link automático en citas) |
| Certificación | SmartBuilderEC API |
| Facturación | Facturama (CFDI 4.0) |
| Deploy | Vercel — crons nativos + ceecm.mx |

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/                     # Rutas públicas sin sesión
│   │   └── login/
│   ├── (dashboard)/                # Rutas protegidas (proxy.ts valida sesión y rol)
│   │   ├── layout.tsx
│   │   ├── dashboard/              # Home con KPIs en tiempo real
│   │   ├── admin/
│   │   │   ├── leads/              # Lista + Kanban + perfil completo
│   │   │   ├── tickets/            # Cola de handoffs humanos
│   │   │   ├── conocimiento/       # KB: aprobar, importar, alertas
│   │   │   ├── nurturing/          # Secuencias y leads en cola
│   │   │   ├── citas/              # Agenda filtrable
│   │   │   ├── matriz/             # Explorador de Matriz nD
│   │   │   ├── momentos/           # Biblioteca de momentos de cierre
│   │   │   ├── gatillos/           # Panel de gatillos mentales
│   │   │   ├── financiero/         # KPIs, comisiones, gasto IA
│   │   │   ├── analitica/          # Competidores, A/B, KB report
│   │   │   ├── aprobaciones/       # Cola unificada KB + Matriz + sugerencias
│   │   │   ├── sistema/            # Panel LED de integraciones + gasto IA
│   │   │   └── lanzamiento/        # Checklist de producción (S12.10)
│   │   ├── vendedor/
│   │   │   ├── agenda/             # Citas del vendedor
│   │   │   ├── cita/[id]/          # Post-sesión: notas, compromisos, transcripto
│   │   │   └── comisiones/         # Saldo pendiente y cobrado
│   │   └── financiero/             # Acceso directo para rol admin_financiero
│   └── api/
│       ├── whatsapp/webhook/       # GET verificación + POST mensajes Meta
│       ├── stripe/webhook/         # checkout.session.completed
│       ├── auth/google/            # OAuth Google Calendar (GET + /callback)
│       ├── track/lead/             # POST público — UTM attribution
│       └── admin/                  # Endpoints protegidos con CRON_SECRET o SEED_SECRET_TOKEN
│           ├── nurturing/          # Ciclo de reengagement (cron)
│           ├── gatillos/           # Expiración de gatillos (cron)
│           ├── recordatorios/      # Recordatorios de citas (cron)
│           ├── smartbuilder/       # Sync progreso SmartBuilderEC (cron)
│           ├── health/             # Panel LED de integraciones (cron)
│           ├── resumen-semanal/    # Resumen semanal por WA (cron lunes)
│           ├── procesar-cola/      # Procesa mensajes_cola WA (cron c/5 min)
│           └── seed-conocimiento/  # Carga inicial de KB (one-shot)
│           └── ghl/
│               ├── seguimiento/    # Cron 30min: ejecuta follow-ups vencidos + detecta silencios
│               ├── followup-learning/ # Cron 1h: cierra ventanas bayesianas, actualiza α/β
│               ├── procesar-buffer/   # Cron 1min: drena ghl_message_buffer (debounce 15s)
│               └── reclasificar-cobertura/ # Manual/cron: leads sin seguimiento activo → Haiku asigna tipo
├── services/
│   ├── aplicar-sugerencia-kb.ts    # MPS-14: aplica sugerencias kb_calidad al KB real (actualizar/crear/desactivar)
├── components/
│   ├── ui/                         # shadcn/ui — no modificar directamente
│   ├── auth/                       # LoginForm
│   ├── leads/                      # LeadsList, LeadsKanban, LeadPerfil
│   ├── tickets/                    # TicketsList
│   ├── conocimiento/               # RecursosList, AlertasKB, ImportarFuente
│   └── nurturing/                  # SecuenciasList, LeadsNurturing
├── services/                       # Lógica de negocio — solo servidor
│   ├── followup-config.ts          # Parámetros de backoff por tipo (lee BD, fallback a defaults)
│   ├── leads.ts                    # obtenerOCrearLead, inferirDISC, inferirEtapa
│   ├── mensajes.ts                 # procesarMensajeEntrante, buffer 8s (canal Meta WA)
│   ├── ghl-message-buffer.ts       # resolverCuerpoGHL, encolarEnBuffer, obtenerYMarcarPendientes
│   ├── pipeline.ts                 # listarLeads, moverLead, historial
│   ├── conocimiento.ts             # CRUD KB + embeddings + score confianza
│   ├── nurturing.ts                # Secuencias + obtenerLeadsParaNurturing
│   ├── reengagement.ts             # Ciclo WA/email automático
│   ├── tickets.ts                  # CRUD tickets + sugerencia KB
│   ├── gatillos.ts                 # CRUD gatillos + sugerencias IA
│   ├── matriz.ts                   # CRUD Matriz nD
│   ├── matriz-ia.ts                # inferirRespuestaMatriz, sugerirCeldasVacias
│   ├── avatares.ts                 # clasificarLead, revisarAvatares
│   ├── competidores.ts             # detectarCompetidores
│   ├── momentos-cierre.ts          # detectarMomentoCierre
│   ├── promesas.ts                 # detectarPromesas, verificarVencidas
│   ├── citas.ts                    # slots, recordatorios, Meet link
│   ├── transcriptos.ts             # análisis IA de sesiones grabadas
│   ├── vendedor-metricas.ts        # calcularMetricas, generarCoachingIA
│   ├── pagos.ts                    # registrarPago, flujoPostCompra
│   ├── comisiones.ts               # calcularComision, marcarPagada
│   ├── smartbuilder.ts             # alta, syncProgreso, detectarInactividad
│   ├── churn.ts                    # calcularChurnScore, alertar
│   ├── encuestas.ts                # generarEncuesta, procesarRespuestas
│   ├── postventa.ts                # referidos, upsell, reseñas
│   ├── experimentos.ts             # A/B precio — asignación, tracking, ganador
│   ├── calidad-conversacional.ts   # score 0-100 en 4 dimensiones
│   ├── temporada.ts                # verificarTemporadaAlta
│   ├── alertas-ia.ts               # registrarUsoIA, alertas umbral
│   ├── log-ia.ts                   # log_ia — acciones de IA auditables
│   ├── health.ts                   # Panel LED 8 integraciones
│   ├── resumen-semanal.ts          # enviarResumenSemanal
│   ├── recordatorios.ts            # recordatorios de citas por WA
│   ├── conversacion.ts             # orquestador principal del flujo WA
│   ├── utm.ts                      # trackLead, registrarUtm
│   ├── mensajes-cola.ts            # encolarMensaje, procesarCola (retry WA)
│   └── whatsapp-sender.ts          # enviarRespuestaWhatsApp (fast-path + cola)
└── lib/
    ├── supabase/                   # client, server, middleware, service, types
    ├── followup/
    │   └── timing-motor.ts         # Capa1: calcularDelayMs(); Capa2: calcularProximoAt() bayesiano; actualizarPosterior()
    ├── ai/
    │   ├── client.ts               # anthropic + openai singletons
    │   ├── model-router.ts         # modeloPorTarea() — configurable por env var
    │   ├── clasificador.ts         # 7 intenciones + árbol de respuesta
    │   ├── motor-respuesta.ts      # búsqueda semántica + generación de respuesta
    │   └── clasificar-cobertura.ts # MPS-13: Haiku clasifica tipo de seguimiento para leads sin cobertura
    ├── whatsapp/                   # sendTextMessage, sendTextMessageWithRetry, parseWebhook
    ├── email/                      # resend.ts, brevo.ts, transaccional.ts, campanas.ts
    ├── stripe/                     # createCheckoutSession, client
    ├── google/                     # calendar.ts — OAuth + slots
    ├── smartbuilder/               # client.ts — alta + progreso
    └── facturama/                  # client.ts — CFDI 4.0 (sandbox/prod)

supabase/
└── migrations/                     # SQL en orden numérico
    ├── 00000000000000_initial_schema.sql
    ├── 00000000000001_sprint1_tables.sql
    ├── 00000000000002_sprint4_nurturing.sql
    ├── 00000000000003_sprint5_matriz.sql
    ├── 00000000000004_sprint6_gatillos.sql
    ├── 00000000000005_sprint7_citas.sql
    ├── 00000000000006_sprint8_pagos.sql
    ├── 00000000000007_sprint9_postventa.sql
    ├── 00000000000008_sprint10_control.sql
    ├── 00000000000009_sprint11_analitica.sql
    └── 00000000000010_sprint12_escala.sql
```

---

## Reglas estrictas de código

1. **Máximo 300 líneas por archivo.** Si supera el límite, extraer componentes o utilidades.
2. **Cero lógica de negocio en componentes UI.** Los componentes reciben props y disparan callbacks. La lógica vive en `services/` o `app/api/`.
3. **Todas las llamadas a APIs externas** tienen manejo de errores. Las críticas usan retry exponencial.
4. **Variables de entorno nunca hardcodeadas.** Siempre `process.env.VAR`.
5. **RLS de Supabase** se configura en la misma migración donde se crea la tabla.
6. **La IA nunca ejecuta acciones irreversibles** sin aprobación del admin (aprobaciones, cancelaciones, etc.).
7. **Embeddings se regeneran automáticamente** al crear o actualizar recursos de conocimiento.
8. **Integraciones son graceful-off:** si faltan credenciales, el módulo devuelve `null` sin lanzar excepción.

---

## Patrones clave

### Model Router — IA por tarea

```typescript
// src/lib/ai/model-router.ts
import { modeloPorTarea } from "@/lib/ai/model-router";

const res = await anthropic.messages.create({
  model: modeloPorTarea("CLASIFICAR"), // haiku por defecto, override con AI_MODEL_CLASIFICAR
  ...
});
```

Tareas configurables: `CLASIFICAR`, `RESPUESTA`, `ANALISIS`, `COACHING`, `ENCUESTA`, `SUGERIR_KB`, `COMPETIDORES`, `CHURN`.

### WhatsApp Hardening — Cola de mensajes

```
enviarRespuestaWhatsApp()
  → sendTextMessageWithRetry()   retry 1s/2s/4s
      → si falla: encolarMensaje()  persiste en mensajes_cola
          → cron /api/admin/procesar-cola cada 5 min vacía la cola
```

### Server Actions

```typescript
// src/app/(dashboard)/admin/leads/[id]/actions.ts
"use server";

export async function moverLeadDesdePerfilAction(formData: FormData) {
  const leadId = formData.get("leadId") as string;
  await moverLead(leadId, nuevaEtapa, "admin");
  revalidatePath(`/admin/leads/${leadId}`);
}
```

### Queries eficientes

- `listarLeads()` selecciona solo las columnas que la lista/kanban necesita (sin `metadata`).
- `obtenerLeadsParaNurturing()` usa 2 rondas: 5 queries en paralelo, luego mensajes por IDs conocidos.

---

## Roles y acceso

| Rol | Acceso |
|---|---|
| `admin` | Todo el sistema |
| `vendedor` | Sus leads, su agenda, sus métricas, sus comisiones |
| `admin_financiero` | Panel financiero, comisiones, pagos |

---

## Variables de entorno requeridas

| Variable | Módulo |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (server only) |
| `ANTHROPIC_API_KEY` | IA — Claude |
| `OPENAI_API_KEY` | Embeddings |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp webhook |
| `RESEND_API_KEY` | Email transaccional |
| `ADMIN_EMAIL` | Notificaciones internas |
| `BREVO_API_KEY` | Email nurturing |
| `BREVO_LIST_ID_TRIPWIRE` | Brevo |
| `BREVO_LIST_ID_PREMIUM` | Brevo |
| `STRIPE_SECRET_KEY` | Stripe |
| `STRIPE_WEBHOOK_SECRET` | Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe (cliente) |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `SMARTBUILDER_API_URL` | SmartBuilderEC |
| `SMARTBUILDER_API_KEY` | SmartBuilderEC |
| `FACTURAMA_USER` | Facturama |
| `FACTURAMA_PASSWORD` | Facturama |
| `FACTURAMA_SANDBOX` | Facturama (`true` / `false`) |
| `FACTURAMA_CP_EMISOR` | Facturama — CP del Centro ECM |
| `CRON_SECRET` | Vercel Cron (todos los endpoints `/api/admin/*`) |
| `SEED_SECRET_TOKEN` | One-shot seeds (`/api/admin/seed-*`) |
| `ADMIN_WHATSAPP` | Número admin para alertas WA |
| `AI_MODEL_{TAREA}` | Override de modelo por tarea (opcional) |
| `REVIEW_URL_GOOGLE` | Post-venta — link reseña Google |
| `CHURN_SCORE_UMBRAL` | Umbral score de churn (default 60) |
| `SBC_DIAS_INACTIVIDAD` | Días de inactividad en SmartBuilderEC (default 7) |

---

## Estado de sprints

| Sprint | Módulo | Estado |
|---|---|---|
| S0 | Fundamentos y Arquitectura | ✅ Completo |
| S1 | Motor WhatsApp MVP | ✅ Completo |
| S2 | Base de Conocimiento Dinámica | ✅ Completo |
| S3 | Pipeline Inteligente | ✅ Completo |
| S4 | Nurturing | ✅ Completo |
| S5 | Matriz nD y Avatares | ✅ Completo |
| S6 | Panel de Gatillos Mentales | ✅ Completo |
| S7 | Agendamiento y Vendedores | ✅ Completo |
| S8 | Pagos y Stripe | ✅ Completo |
| S9 | Post-Venta y SmartBuilderEC | ✅ Completo |
| S10 | Panel de Control y Alertas | ✅ Completo |
| S11 | Analítica Avanzada | ✅ Completo |
| S12 | Integraciones Pendientes y Escala | 🔄 En progreso |
| MPS-5 | Motor de Seguimiento Adaptativo v1 | ✅ Completo |
| MPS-14 | Ciclo KB Activo — Sugerencias → Mejora real del KB | ✅ Completo |
