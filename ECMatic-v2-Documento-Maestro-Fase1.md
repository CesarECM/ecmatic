# ECMatic v2 — Documento Maestro de Especificación
### Fase 1 (MVP, usuario único) — Listo para ejecución con Claude Code

---

## 0. Instrucciones para Claude Code (leer primero)

- Este es un proyecto **nuevo e independiente** de ECMatic v1.7 (SMEC). **No compartir código entre ambos** — arquitectura, componentes, lógica de negocio: todo se construye desde cero en su propia carpeta.
- **Sí se comparte**: el mismo proyecto de Supabase (misma base de datos/conexión), las mismas variables de entorno, autenticación (Supabase Auth ya resuelta), y dependencias generales del monorepo/proyecto raíz donde aplique.
- Ambas versiones (v1.7 y v2) deben poder **correr en paralelo sin interferirse**, en carpetas separadas.
- **La UI no debe parecerse visualmente a v1.7.** Libertad de diseño total mientras cumpla el requisito de reactividad (ver §6).
- Antes de reconstruir lógica que ya existe en v1.7 (ej. el manejo de fechas de reactivación vía custom fields de GHL), **revisar el código de v1.7 primero** — reutilizar si aplica tal cual, reescribir si no.
- Esta Fase 1 es para **un solo usuario** (César). No incluir lógica de roles (Vendedor/Admin/Superadmin), distribución de leads, ni transferencia entre vendedores — eso es Fase 2+ (documentado en §11 solo como contexto futuro, no para construir ahora).

---

## 1. Qué es ECMatic v2 y por qué existe

ECMatic v1.7 (SMEC) se volvió sobre-diseñado: muchas capas de sofisticación (17 fases CAGC, setter/closer autónomo, personalización multidimensional, motor bayesiano) sin que el loop base estuviera validado y fuera fácil de mantener.

**Principio rector de v2:** el sistema no debe ser inteligente antes de ser claro. Es un CRM de **una sola tarea a la vez**, impulsado por un loop de IA-con-humano-en-el-circuito (human-in-the-loop), no un CRM de navegar-y-buscar entre menús.

---

## 2. Principios de diseño (no negociables)

1. **Una ventana, sin menús de navegación profunda.** Todo lo secundario vive en modales.
2. **Dos listas centrales que coexisten y se retroalimentan** (ver §7): Oportunidades y Tareas/Seguimientos.
3. **Uniembudo, pero por oportunidad, no por lead.** Un lead puede tener varias oportunidades (una por producto/servicio) en fases CAGC distintas simultáneamente. No hay macro-etapas fijas visibles en la UI — el CAGC vive en el motor de IA.
4. **KB = solo FAQs + Instrucciones de Conversación (IC).** Nada de catálogo de productos/servicios en la KB — el sistema debe descubrir qué vender a partir de las conversaciones, no de un catálogo hardcodeado. Hoy solo hay leads de EC0217.01, pero el panel no debe tener ningún campo que asuma un producto fijo.
5. **La IA decide canal y timing**, incluyendo cuándo fusionar comunicación de varias oportunidades del mismo lead en un solo mensaje o mantenerlas separadas.
6. **Aprobación humana por defecto**, con una excepción medida y auditada: WhatsApp con confianza ≥92% se auto-envía (ver §9).
7. **Ningún lead debe quedar sin ruta.** Cada oportunidad siempre tiene al menos un seguimiento activo, aunque sea "en espera". El destino final de todo lead es uno de: **GANADO, PERDIDO, INACTIVO, LISTA NEGRA**.
8. **GHL es la fuente de verdad de contactos.** Supabase mantiene una réplica sincronizada (no solo referencia), vía webhooks (ya montados) y sync de vuelta a GHL.
9. **Sin integraciones nuevas de envío que no existan ya.** WhatsApp sale por la API oficial ya conectada en GHL — no se implementa un repositorio open source de WhatsApp en esta fase. Donde la ventana de 24h u otra restricción lo impida, hay flujo de envío manual con botones de copiar.

---

## 3. El loop core — protocolo de decisión de la IA

Para cada oportunidad activa, en cada ciclo:

1. Lee la pregunta/mensaje entrante, la conversación previa y las notas de la oportunidad.
2. Solicita IC (instrucciones de conversación) relevantes.
3. Busca FAQs del tema en la KB.
4. Analiza el estatus con el sistema CAGC (por oportunidad, no por lead).
5. Determina el siguiente punto de contacto (canal + timing).
6. **Revisa si el mismo lead tiene otras oportunidades activas** y decide si conviene fusionar la comunicación en un solo mensaje o mantenerlas aisladas (ver §4).
7. Se detiene y espera instrucción del humano para generar el contenido de la respuesta (no genera contenido de forma automática).
8. Al recibir la instrucción, genera el contenido propuesto.
9. Humano aprueba, edita o rechaza.
10. Si edita o rechaza, se solicita el porqué (retroalimentación obligatoria). Con esa retroalimentación, la IA genera o ajusta IC/FAQs y los envía al sistema KBX, que decide si los rechaza por duplicidad o los manda a revisión humana (ver §10).
11. La IA evalúa en cada ciclo si la oportunidad debe transicionar a un estado terminal (GANADO/PERDIDO/INACTIVO/LISTA NEGRA). Si no, vuelve al paso 5 para el siguiente punto de contacto.

**Nota:** cuando no se edita/rechaza y se envía tal cual, es señal positiva — el elemento de KB usado gana confianza (ver §9).

---

## 4. Múltiples oportunidades por lead — fusión vs. aislamiento

- Un lead puede tener **más de una oportunidad abierta** (una por producto/servicio de interés), cada una con su propio estatus CAGC independiente.
- La IA puede decidir **consolidar en una sola oportunidad** si detecta que conviene una venta en paquete.
- Cada oportunidad dispara su propio punto de contacto de forma independiente. **Solo al momento de ejecutar** la IA revisa si hay otra oportunidad del mismo lead pendiente y decide si fusiona el mensaje (ej. "la bañera tiene descuento... por cierto la chimenea también") o los manda aislados.
- La tarea que ve el usuario refleja la decisión ya tomada (fusionada o no), pero dentro de una tarea fusionada, **cada oportunidad se aprueba/edita/rechaza de forma independiente**. Si se aprueba una parte y se rechaza otra, el mensaje final sale solo con lo aprobado; la parte rechazada vuelve a análisis de la IA para su propio siguiente paso, sin bloquear a la otra oportunidad.

---

## 5. Estados terminales del lead/oportunidad

| Estado | Disparador típico | Reversibilidad |
|---|---|---|
| **GANADO** | Conversión confirmada | — |
| **PERDIDO** | Lead confirma que no avanzará, o se agotan criterios razonables de insistencia | — |
| **INACTIVO** | Sin respuesta tras varios intentos multicanal | Reversible — un mensaje entrante del lead puede reabrir el loop automáticamente |
| **LISTA NEGRA** | Señales de mala fe, abuso, o petición explícita de no contacto | No reversible automáticamente. En Fase 1 (usuario único) el propio usuario revisa antes de reactivar; en fases con roles, queda reservado solo a Admin |

La IA **siempre** intenta avanzar cada oportunidad hacia uno de estos cuatro estados — no puede quedar un lead "tibio" sin explorar indefinidamente.

---

## 6. UI/UX

### 6.1 Panel único, reactivo
- Una sola ventana, navegación mínima, todo lo secundario en modales.
- **Reactivo sin recargar**: usar Supabase Realtime sobre el stack ya existente. Nuevo mensaje entrante, nueva tarea, cambio de estado — se reflejan solos.
- Sin señales visuales/sonoras de notificación cuando llega algo nuevo mientras el usuario está en el panel; la lista simplemente se actualiza.

### 6.2 Dos listas centrales (independientes mutuamente, pero se retroalimentan)

**Lista de Oportunidades**
- Orden default: score de probabilidad de cierre descendente, **con filtro "en espera" aplicado por default** (solo muestra lo accionable hoy).
- Filtros/ordenamientos disponibles: por monto (ticket), por fecha límite, por score de calidad, y por **días desde el último contacto** (señal de riesgo de enfriamiento, independiente del score de cierre).
- Vista separada/expandible para ver las que están "en espera" (con fecha futura de reactivación) — no se mezclan con las accionables hoy.
- El score de urgencia por fecha sube gradualmente conforme se acerca la fecha límite mencionada por el lead, no de forma binaria.

**Lista de Tareas/Seguimientos**
- Orden default: **más antiguo primero** (lo que lleva más tiempo esperando acción del usuario), con opción de invertir el orden para atender algo en tiempo real.
- Mezcla en una sola cola: puntos de contacto pendientes, aprobaciones de mensajes generados, y (en Fase 1.5) leads viejos rescatados de la base para calificar.
- No se ordena por score de oportunidad — se ordena por lo que hay que ejecutar para seguir avanzando el sistema.
- Sin marcado visual especial por antigüedad — el orden cronológico es suficiente.
- El usuario puede navegar libremente dentro de la lista (no está forzado a trabajar en orden estricto) y saltar a cualquier tarea.
- Cuando la lista se vacía completamente, el sistema puede inyectar proactivamente (cada varios minutos) tareas de aprovechamiento: adelantar algo de "en espera", adelantar algo programado para más tarde hoy, o (Fase 1.5) rescatar un lead viejo sin calificar. Todo pasa por el mismo protocolo de aprobación.

### 6.3 Ficha del lead (modal)
Debe incluir, todo visible sin clics adicionales extra:
- Historial de conversación en formato tipo WhatsApp, con opción de copiar mensajes individuales para pegar fuera del sistema.
- Fase del embudo CAGC según la determinación de la IA (por oportunidad, si hay varias).
- Campo de contenido propuesto **editable directamente ahí**, con botón único "guardar y enviar/aprobar".
- Al editar o rechazar: solicitud obligatoria de retroalimentación (el porqué).
- % de confianza calculado por la IA, siempre visible (no solo cuando está bajo el umbral).
- Botón: abrir conversación en WhatsApp Web.
- Botón: abrir perfil del contacto en GHL.
- Botón: copiar datos de contacto (nombre completo, teléfono, email).
- Botón "ver más mensajes previos" que trae más historial desde GHL — también la IA puede solicitar más historial por su cuenta si lo necesita para responder mejor, no solo el usuario.

### 6.4 Búsqueda
- Búsqueda simple por nombre, teléfono o email.
- Resultados muestran las oportunidades y seguimientos asociados a ese lead dentro de ECMatic.
- Clic en un resultado abre la ficha del lead; el salto a GHL ocurre desde dentro de la ficha, no desde la búsqueda.

### 6.5 Fuera de alcance en Fase 1
- Estadísticas/dashboards (modal de stats) — se deja para fase posterior.
- CRUD completo y búsqueda avanzada — solo la búsqueda simple descrita arriba.
- Deduplicación de leads / manejo de identidades duplicadas.

---

## 7. Módulo de oportunidades — scoring

### 7.1 Señales para score de probabilidad de cierre (aprobado)
1. Tipo de preguntas del lead (precio/proceso pesa más que información general).
2. Señales explícitas de compra (presupuesto, fecha de decisión, autoridad de decisión mencionada).
3. Objeciones resueltas vs. pendientes.
4. Velocidad de respuesta del lead.
5. Progreso de fase CAGC en el tiempo (avanza vs. se estanca).
6. Fuente/origen del lead (etiqueta de GHL) — reglas simples en Fase 1, calibración con datos reales en fase posterior.
7. Contenido interpretado de notas de llamadas/videollamadas.

### 7.2 Señales para score de urgencia
- Tiempo esperando desde el último contacto.
- Fecha límite mencionada explícitamente por el lead.
- Tiempo promedio de venta **por producto** (dato de referencia, no por segmento en Fase 1).

### 7.3 Ficha de oportunidad — notas siempre disponibles
- El usuario puede agregar una nota a la ficha de oportunidad en cualquier momento, no solo tras un punto de contacto.
- Cada nota nueva dispara **re-análisis inmediato** por la IA (recalcula scores y, si aplica, el próximo punto de contacto).
- Distinto de las notas de seguimiento atadas a un contact_point específico — esta nota es libre y contextual al lead/oportunidad en general.

### 7.4 Notas de llamadas/videollamadas
- El usuario nunca llena campos estructurados directamente. Escribe en lenguaje natural (nota libre).
- La IA interpreta la nota, llena los campos estructurados internos (duración, resultado, agendado o no) para estadísticas y seguimiento, y **genera una pregunta de vuelta al usuario** para profundizar (tipo objeciones, próximos pasos acordados). La respuesta a esa pregunta se vuelve una nueva nota — es un ciclo de refinamiento conversacional, no un formulario fijo.

### 7.5 Campo de reactivación (custom field sincronizado con GHL)
- Cuando un lead da una fecha/hora para retomar contacto, la IA escribe esa fecha en un **custom field de GHL** (revisar implementación existente en v1.7 antes de reescribir).
- El usuario/vendedor no edita ese campo directamente — solo se actualiza si el usuario agrega una nueva nota que la IA interpreta como cambio de fecha (ej. el lead adelantó la reunión).
- Este campo es lo que determina cuándo una oportunidad sale de "en espera" y entra a la lista accionable.

---

## 8. Modelo de datos (núcleo mínimo, Fase 1)

| Entidad | Campos clave |
|---|---|
| `leads` | id, ghl_contact_id, nombre, teléfono (obligatorio), email (opcional), origen (whatsapp/ghl/manual), fecha_creación, estado (activo/GANADO/PERDIDO/INACTIVO/LISTA_NEGRA) |
| `opportunities` | id, lead_id, producto_servicio_inferido, fase_cagc_actual, score_probabilidad, score_urgencia, score_combinado, fecha_reactivación (sync con custom field de GHL), última_actualización, estado |
| `opportunity_notes` | id, opportunity_id, contenido, autor, timestamp — nota libre, dispara re-análisis |
| `contact_points` | id, opportunity_id (o lista de opportunity_ids si es fusionado), tipo (whatsapp/email/llamada/videollamada), estado (propuesto/pendiente_generación/generado/aprobado/rechazado/editado/enviado_automático/enviado_manual), contenido_propuesto, contenido_final, % confianza, timestamp |
| `follow_up_notes` | id, contact_point_id, resultado (hecho/no_hecho), observaciones, retroalimentación_edición (si aplica), autor, timestamp |
| `kb_items` | id, tipo (FAQ/IC), contenido, estado (propuesto/aprobado/rechazado), score_confianza, última_validación (para decaimiento), versión |
| `conversation_rules` | id, contenido, activa (bool) — se inyectan siempre en cada prompt |
| `kbx_review_queue` | id, kb_item_id(s), acción_sugerida (eliminar/unir/separar/marcar_obsoleto), estado (pendiente/aprobado/rechazado) |

**Nota de diseño:** no existe tabla `productos/servicios` — el "producto_servicio_inferido" en `opportunities` es un campo libre que la IA infiere de la conversación, no una FK a un catálogo.

---

## 9. Confianza y auto-envío de WhatsApp

- **Umbral: 92% de confianza.** Solo aplica a contenido de WhatsApp. Email siempre pasa por revisión humana. Llamadas/videollamadas no generan contenido evaluable por confianza — son coordinación de agenda (100% mecánico una vez acordado el horario).
- **Cálculo de confianza**: combinación de (a) qué tan validadas están las fuentes de KB usadas en el mensaje, y (b) historial agregado de aciertos en situaciones similares.
- **Todo auto-envío queda registrado y visible** en el panel (feed/log accesible) — nunca invisible para el usuario.
- **Decaimiento temporal de KB**: cada elemento de KB pierde 2 puntos porcentuales de confianza por cada 7 días sin ser reforzado (uso exitoso o revisión humana que lo revalide). Parámetro ajustable. Cuando cae bajo el umbral, vuelve a pasar por aprobación humana automáticamente.
- **Muestreo forzado de auditoría**: 1 de cada 50 auto-aprobaciones (contador global, no por elemento) se fuerza a revisión humana, incluso si tiene confianza alta.
- **Refuerzo de KB**: usar un elemento sin editar/rechazar es señal positiva y sube su score; editar o rechazar es señal negativa y siempre exige retroalimentación del porqué.

---

## 10. KBX — capa de mantenimiento de la KB

- Corre **una vez al día** sobre la KB existente (distinto del flujo de aprobación en tiempo real de contenido nuevo).
- Identifica: elementos obsoletos, duplicados, irrelevantes.
- Puede proponer **unir o separar** elementos de la KB.
- Nunca elimina/modifica automáticamente — siempre genera una tarea de revisión (tipo "revisar/editar/aprobar/rechazar", igual que el resto del sistema).

---

## 11. Generación de KB (FAQs e IC)

1. La IA detecta un vacío de conocimiento (pregunta sin buena respuesta, o patrón repetido sin regla clara) y propone un nuevo FAQ o IC.
2. Aparece como tarea de revisión en el loop principal.
3. Al aprobar (con o sin edición), entra a la base vectorial (pgvector) y queda disponible para inyección futura.
4. Si se rechaza, la IA registra el rechazo como señal para no repetir la propuesta sin nueva evidencia.

---

## 12. Integraciones

### 12.1 GHL
- **Fuente de verdad** de contactos. Ya están montados los webhooks de entrada — no se reconstruyen.
- Supabase mantiene copia sincronizada (no solo referencia), sync bidireccional.
- Custom field de fecha de reactivación se escribe desde ECMatic hacia GHL (ver §7.5).
- Historial de conversación se consulta vía API a GHL: carga default de **últimos 20 mensajes o últimos 14 días** (lo mayor), tope duro de 50 mensajes. Botón "ver más" y la IA puede solicitar más por su cuenta si lo necesita.
- Sincronización bidireccional de mensajes: si un mensaje se envía manualmente fuera de ECMatic (ver 12.2), debe reflejarse de vuelta en la conversación mostrada en ECMatic.

### 12.2 WhatsApp
- Sale por la **API oficial ya conectada en GHL**. No se implementa repositorio open source en esta fase.
- Cuando la ventana de 24h (u otra restricción de la API oficial) no permite enviar, se habilita flujo manual: botones de **copiar número** y **copiar mensaje**, el usuario lo envía desde su WhatsApp personal, y marca "lo envié manualmente" — el hilo se mantiene y esos mensajes se reflejan en la conversación de ECMatic.
- El botón de envío manual está disponible **siempre** como respaldo (no solo cuando la ventana de 24h lo obliga), porque puede haber otras restricciones de la API oficial no siempre predecibles.

### 12.3 Email
- Sin integración de envío automatizado en Fase 1. La IA genera el contenido del cuerpo del correo, el usuario lo copia, lo envía desde su propio cliente de correo, y lo marca como hecho en ECMatic.

### 12.4 Calendario (llamadas/videollamadas)
- Integración con Google Calendar + Google Meet.
- La IA revisa disponibilidad real en el calendario del usuario antes de proponer horario.
- Propone horarios directo al lead sin pasar por aprobación humana previa (se confía en la disponibilidad real del calendario).
- En Fase 1 (usuario único): un solo calendario, sin lógica de bloqueos cruzados entre vendedores ni transferencia — eso es Fase 2+.
- Al confirmarse horario, se crea el evento automáticamente en el calendario.

---

## 13. Fases de implementación (orden actualizado)

### Fase 1 — MVP, usuario único (ESTA ES LA PRIORIDAD ACTUAL)
Todo lo descrito en este documento: loop completo con protocolo de 11 pasos, dos listas (Oportunidades + Tareas), ficha del lead, módulo de oportunidades con scoring aprobado, sistema de confianza/auto-envío con decaimiento y muestreo, KBX, generación de KB, integraciones GHL/WhatsApp-manual/Email-manual/Calendar, para un solo usuario (César), sin roles.

**Criterio de éxito:** un lead real entra, se trabaja de principio a fin sin salir del loop principal, con visibilidad total de por qué la IA propone cada acción, y termina en uno de los 4 estados terminales.

### Fase 1.5 — Rescate de leads viejos de la base
- Cuando la lista de Tareas está vacía, además de adelantar "en espera" o programados, el sistema puede rescatar leads viejos/sin calificar de GHL: lotes de 10, evaluación en segundo plano por conversación/etiquetas existentes, descarta los sin señales de vida y solicita otro lote si aplica.

### Fase 2 — Roles y equipo
- Roles Superadmin / Admin / Vendedores.
- Admin centraliza leads de un solo negocio, configura conexión a GHL/WhatsApp, define reglas de distribución.
- Asignación automática por matriz de productividad (aprobada en §14).
- Reglas de inactividad de vendedor → reasignación de lead a otro vendedor.
- Lógica de negociación de horario con transferencia entre vendedores cuando no hay disponibilidad (bloqueos de calendario tipo "congreso el martes").
- Reasignación masiva al desactivar un vendedor: heredar a uno solo, distribuir por condiciones, o repartir a ciegas — el Admin elige el modo.
- LISTA NEGRA reservado solo a Admin para revisión de reactivación.

### Fase 3 — Sofisticación de IA y datos
- Scoring de oportunidades con modelos serios (gradient boosting: XGBoost/LightGBM) reemplazando la heurística de Fase 1, una vez haya histórico suficiente.
- Motor bayesiano (PyMC) opcional para timing de seguimiento, si se justifica frente a la heurística.
- Nutrición por email a leads inactivos (mencionado como idea futura, sin desarrollar aún).
- Posible transcripción automática de llamadas/videollamadas (hoy son solo notas manuales).

### Fase 4 — Productizable (si aplica)
- Multi-tenant real, cobros/suscripciones gestionadas por Superadmin — solo si se decide la ruta de vender ECMatic como SaaS a otros centros de evaluación.

---

## 14. Matriz de productividad para asignación de vendedores (aprobada, para Fase 2)

| Factor | Peso |
|---|---|
| Tasa de cierre histórica (general) | 30% |
| Tasa de cierre específica por tipo de producto/segmento | 20% |
| Velocidad de respuesta promedio | 15% |
| Carga actual de trabajo (leads activos abiertos) | 15% en negativo |
| Monto promedio cerrado (ticket size) | 10% |
| Antigüedad/experiencia en el rol | 10% |

Score final = suma ponderada normalizada (0–100), recalculado periódicamente. Vendedores nuevos/sin historial suficiente arrancan con prior neutro (score 50).

---

## 15. Stack técnico

| Capa | Decisión |
|---|---|
| Frontend/Backend | Next.js + Supabase (mismo proyecto que v1.7, carpeta separada) |
| Reactividad | Supabase Realtime |
| Orquestación del loop | Evaluar LangGraph (MIT, open source) para la state machine con `interrupt()` nativo para las aprobaciones humanas — decisión técnica a confirmar en construcción, no bloquea el inicio |
| WhatsApp | API oficial vía GHL (no open source en esta fase) |
| Email | Copiado manual en Fase 1 (sin Resend/Brevo integrado todavía para este flujo) |
| Calendario | Google Calendar + Google Meet API |
| KB / embeddings | pgvector, solo FAQs/IC |
| Scoring | Heurística ponderada en Fase 1 (secciones 7.1–7.2), migra a XGBoost/LightGBM en Fase 3 |
| Autenticación | Reutilizada de v1.7 (ya resuelta) |

---

## 16. Decisiones explícitamente fuera de alcance en Fase 1
- Estadísticas/dashboards.
- CRUD avanzado y búsqueda avanzada (más allá de nombre/teléfono/email).
- Roles múltiples, distribución/transferencia de leads entre vendedores.
- Deduplicación de identidad de leads.
- Nutrición automatizada por email a inactivos.
- Transcripción automática de llamadas.
- Repositorio open source de WhatsApp (reservado para revalorar más adelante; hoy todo vía API oficial + fallback manual).
- Cobros/suscripciones (Superadmin es solo control de accesos en Fase 1, si acaso se construye).
