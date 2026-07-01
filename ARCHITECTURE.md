# ECMatic — Arquitectura y Convenciones

## Posicionamiento estratégico

ECMatic es una **capa de inteligencia y decisión**, no un CRM con comunicación directa al lead.

| Responsabilidad | Quién la ejecuta |
|---|---|
| Analizar conversaciones, comportamientos y señales | ECMatic (IA) |
| Decidir qué acción ejecutar y cuándo | ECMatic (motor) |
| Base de conocimiento, aprendizaje continuo, aprobaciones | ECMatic (admin panel) |
| Analítica, scores, modelos matemáticos, A/B, KPIs | ECMatic (admin panel) |
| Configuración del motor IA, guardrails, protocolos | ECMatic (admin panel) |
| Vista espejo enriquecida de GHL (CAGC, DISC, contexto IA) | ECMatic (admin panel) |
| Enviar mensajes WA y email, ejecutar workflows | **GHL** |
| Gestionar citas, pipelines, contactos, templates | **GHL** |
| Recibir mensajes entrantes del lead | **GHL** → webhook → ECMatic |

La gestión operativa de leads (mover etapas, asignar vendedor, agendar cita) vive en GHL. ECMatic es el cerebro que decide, aprende y enriquece los datos.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind CSS + shadcn/ui |
| Base de datos | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (usuario/contraseña) |
| IA | Claude via Anthropic SDK — modelo por tarea via model-router |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) |
| GHL (GoHighLevel) | Capa de ejecución: WA outbound + inbound, email, citas, pipelines, contactos, templates, workflows |
| ~~WhatsApp inbound directo~~ | ~~Meta WA Business API v20~~ `[DEPRECADO D8]` — reemplazado por GHL webhook |
| ~~Email transaccional~~ | ~~Resend~~ `[DEPRECADO D4]` — reemplazado por GHL |
| ~~Email nurturing~~ | ~~Brevo~~ `[DEPRECADO D4]` — reemplazado por GHL |
| Pagos | Stripe — links generados en ECMatic, confirmación notificada a GHL (D11, mecanismo TBD) |
| ~~Calendario~~ | ~~Google Calendar API~~ `[DEPRECADO D6]` — GHL se sincroniza nativamente con GCal de vendedores |
| ~~Videollamadas~~ | ~~Google Meet~~ `[DEPRECADO D6]` — links generados por GHL vía integración GCal |
| Certificación | SmartBuilderEC API (directo, sin cambios — D10) |
| Facturación | Facturama (CFDI 4.0, directo, sin cambios — D10) |
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
│   ├── arco-emocional.ts           # MPS-17 S66: estado emocional del lead (hot/frustrado → ticket + cola)
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
    │   ├── clasificar-cobertura.ts # MPS-13: Haiku clasifica tipo de seguimiento para leads sin cobertura
    │   ├── kb-search.ts            # búsqueda semántica + re-ranking Haiku (MPS-17 S65)
    │   └── guardrails-precio.ts    # MPS-17 S67: detecta descuentos no autorizados e inyección (función pura)
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

### ~~WhatsApp Hardening — Cola de mensajes~~ `[DEPRECADO jun 2026]`

> ⚠️ Este patrón envía WA directamente vía Meta API. Está deprecado (Fase A).
> No usar para código nuevo. Ver **D1** en Principios de Integración GHL.

```
[DEPRECADO] enviarRespuestaWhatsApp() → sendTextMessageWithRetry() → Meta API
[DEPRECADO] encolarMensaje() → mensajes_cola → cron procesar-cola
```

### Canal único de salida WA (patrón vigente)

```
enviarMensajeGHL(leadId, texto)
  → buscar/crear contacto en GHL por teléfono
      → POST GHL Conversation Message API
          → GHL → WhatsApp Business API → Lead
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

## Principios de Integración GHL

Directrices globales vigentes desde **30 jun 2026**. Toda implementación nueva debe cumplirlas sin excepción.

### D1 — Canal único de salida WhatsApp

```
ECMatic (decisión) → enviarMensajeGHL() → GHL → WA Business API → Lead
```

- ECMatic **nunca** envía WA directamente (ni Meta API, ni Twilio).
- `enviarMensajeGHL()` es el **único** punto de salida de mensajería WA.
- D1 aplica también a alertas internas (notificaciones WA a César admin).
- Email, SMS, llamadas: no están afectados por D1 (email tiene su propia directriz D4).

### D2 — Templates gestionados en GHL, evaluados en ECMatic

- Los templates WA se crean, editan y envían a Meta **exclusivamente desde GHL**.
- ECMatic **no gestiona** el ciclo de vida del template.
- ECMatic **evalúa** efectividad: tasa de respuesta, conversión, score A/B (Thompson Sampling).
- El módulo `wa_templates` + `lib/whatsapp/templates-api.ts` (Sprint 34) está deprecado.

### D3 — Pipelines gestionados en GHL, conocidos por ECMatic

- GHL es la **fuente de verdad** de pipelines y etapas.
- ECMatic mantiene una **copia local** sincronizada periódicamente (GHL API → tabla `pipelines`).
- ECMatic puede **disparar workflows** de GHL sobre leads específicos — GHL ejecuta la acción.
- ECMatic puede **proponer** cambios de etapa pero la gestión operativa de leads vive en GHL.
- Los seeds locales (`scripts/seed/pipeline-*.js`) siguen siendo válidos para inicialización.

### D4 — Email exclusivamente vía GHL

- Todo email (transaccional y nurturing) sale por GHL.
- Resend y Brevo quedan **deprecados**.
- ECMatic decide qué comunicar y cuándo; GHL ejecuta el envío.
- Las secuencias de nurturing de Brevo se migran a workflows de GHL.

### D5 — Contactos bidireccional (última escritura gana)

- **GHL** es origen de: nombre, teléfono, email, etiquetas GHL, etapa de pipeline.
- **ECMatic** es origen de: CAGC, avatar DISC, score salud, historial conversacional, KB, contexto IA.
- Regla de merge: gana el registro con `updated_at` más reciente por campo.
- MPS-8 (`sync-contacto-ghl.ts`) implementa el push ECMatic → GHL; GHL webhook implementa el inverso.

### D6 — Citas gestionadas por GHL

- GHL gestiona el calendario de citas (creación, modificación, cancelación).
- GHL se sincroniza nativamente con Google Calendar de los vendedores — ECMatic no toca la GCal API.
- ECMatic ya no genera Meet links directamente.
- `lib/google/calendar.ts`, `lib/google/meet.ts`, `services/citas.ts` (flujo de creación) → deprecados.

### D7 — Alertas admin también vía GHL

- D1 aplica a **todo** WA saliente, incluyendo notificaciones internas a César.
- No existe excepción de "admin bypass" — consistencia total con D1.

### D8 — Lead entry: GHL es el punto de entrada

```
Lead (WA/formulario/anuncio) → GHL → webhook GHL → ECMatic (upsert + procesamiento IA)
```

- GHL crea el contacto primero. Su webhook notifica a ECMatic.
- ECMatic hace upsert en Supabase y procesa la conversación con IA.
- El webhook Meta directo (`api/whatsapp/webhook/`) queda **deprecado**.
- `api/ghl/` es el canal principal de mensajes entrantes (ya implementado en MPS-1).

### D9 — Nurturing: ECMatic decide, GHL ejecuta

- ECMatic analiza el lead (CAGC, score, comportamiento) y determina la secuencia/workflow apropiada.
- ECMatic instruye a GHL para inscribir al lead en el workflow correspondiente.
- GHL envía los mensajes WA y emails de nurturing.
- ECMatic mide efectividad y ajusta la decisión (motor bayesiano sigue activo).

### D10 — Facturama y SmartBuilderEC siguen directas

- Estas integraciones son especializadas (fiscal y certificación) — GHL no las reemplaza.
- No están afectadas por el pivot GHL.

### D11 — Stripe + notificación a GHL (mecanismo TBD)

- Links de pago generados desde ECMatic (Stripe Checkout Sessions).
- Cuando `checkout.session.completed`: ECMatic registra el pago en Supabase **y** notifica a GHL.
- El mecanismo exacto de notificación (webhook push, contacto field, workflow trigger) se define al abordar el módulo de pagos.

---

## Plan de Deprecación (jun 2026)

| Fase | Descripción | Plazo |
|---|---|---|
| **A — Marcado** | Documentado como deprecado. No usar para código nuevo. | Vigente desde 30 jun |
| **B — Deshabilitado** | Feature flag desactiva el módulo sin eliminar código. | ~jul 2026 |
| **C — Eliminado** | Código removido cuando se confirma cero tráfico. | ~ago 2026 |

| Componente | Directriz | Motivo | Fase |
|---|---|---|---|
| `services/whatsapp-sender.ts` | D1 | Outbound WA directo → GHL | A |
| `services/mensajes-cola.ts` | D1 | Cola outbound WA → GHL | A |
| `lib/whatsapp/sendTextMessage*` | D1 | Outbound Meta API → GHL | A |
| `api/admin/procesar-cola/` | D1 | Cron cola WA → GHL | A |
| `lib/whatsapp/templates-api.ts` | D2 | Templates → GHL los gestiona | A |
| `wa_templates` (tabla + UI) | D2 | Templates → GHL los gestiona | A |
| `lib/email/resend.ts` | D4 | Email → GHL | A |
| `lib/email/brevo.ts` | D4 | Email → GHL | A |
| `lib/email/transaccional.ts` | D4 | Email → GHL | A |
| `lib/email/campanas.ts` | D4 | Email → GHL | A |
| `services/nurturing.ts` (envíos) | D4+D9 | Email/WA nurturing → GHL ejecuta | A |
| `services/reengagement.ts` | D1+D4 | WA y email → GHL | A |
| `services/notificaciones-cita.ts` | D1+D4+D6 | WA/email cita → GHL | A |
| `services/resumen-semanal.ts` | D1+D4 | WA/email → GHL | A |
| `services/recordatorios.ts` | D1+D4 | WA/email → GHL | A |
| WA step en `prospeccion-secuencial.ts` | D1+D4 | WA/email → GHL | A |
| `lib/google/calendar.ts` | D6 | GHL gestiona citas+GCal sync | A |
| `lib/google/meet.ts` | D6 | GHL genera Meet links | A |
| `services/citas.ts` (creación+Meet) | D6 | GHL gestiona agendamiento | A |
| `services/meet-post-sesion.ts` | D6 | GHL/GCal manejan transcriptos | A |
| `services/log-agendamiento.ts` | D6 | Agendamiento → GHL | A |
| `api/whatsapp/webhook/` | D8 | Inbound WA → GHL webhook | A |
| Vista Kanban/lista de leads ECMatic | D8 | Gestión operativa → GHL | A |

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
| MPS-17 S65 | Re-ranking semántico KB (cross-encoder Haiku) | ✅ Completo |
| MPS-17 S66 | Arco emocional del lead + HITL hot/frustrado | ✅ Completo |
| MPS-17 S67 | Guardrails de precio (descuento/inyección → cola) | ✅ Completo |
