// S35.6 — Registro de todas las funciones de ECMatic para /admin/guia

export type EstadoFeature = "activo" | "automatico" | "proximo";

export interface Feature {
  id: string;
  titulo: string;
  descripcion: string;
  estado: EstadoFeature;
  href?: string;       // enlace directo a la función
  badge?: string;      // sprint de origen, novedad, etc.
}

export interface ModuloGuia {
  id: string;
  label: string;
  emoji: string;
  features: Feature[];
}

export const MODULOS: ModuloGuia[] = [
  {
    id: "leads",
    label: "Leads",
    emoji: "👥",
    features: [
      { id: "leads-lista", titulo: "Lista de leads y pipeline", descripcion: "Vista kanban y tabla de todos los leads. Filtros por etapa, ruta, vendedor y búsqueda de texto.", estado: "activo", href: "/admin/leads" },
      { id: "leads-ficha", titulo: "Ficha del lead", descripcion: "Perfil completo: datos, pipeline, etiquetas, contexto IA, CAGC, mensajes recientes, historial de pipeline y score de salud.", estado: "activo", href: "/admin/leads" },
      { id: "leads-score", titulo: "Score de salud", descripcion: "Score 0-100 calculado con modelo de features ponderadas (etapa, inactividad, mensajes, CAGC, email, canal). Se recalibra semanalmente.", estado: "automatico" },
      { id: "leads-score-historial", titulo: "Historial de score de salud", descripcion: "Gráfica colapsable en la ficha del lead que muestra la evolución del score en las últimas 30 mediciones.", estado: "activo", href: "/admin/leads" },
      { id: "leads-contexto", titulo: "Contexto IA del lead", descripcion: "Capa interpretativa viva que la IA actualiza tras cada conversación. Incluye notas manuales, historial versionado y compresión automática.", estado: "activo" },
      { id: "leads-etiquetas", titulo: "Etiquetas", descripcion: "Sistema de etiquetas por categoría. La IA sugiere etiquetas automáticamente; el admin las aprueba en la cola.", estado: "activo", href: "/admin/etiquetas" },
      { id: "leads-setter", titulo: "Protocolo Setter (6 fases)", descripcion: "La IA evalúa y avanza al lead por las 6 fases del setter: Apertura → Diagnóstico → Dolor → Situación deseada → Cualificación → Transición.", estado: "automatico" },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    emoji: "🔀",
    features: [
      { id: "pipeline-kanban", titulo: "Kanban de pipeline", descripcion: "Vista Kanban con semáforo de score_salud por lead. Arrastra o usa los botones para mover leads entre etapas.", estado: "activo", href: "/admin/leads" },
      { id: "pipeline-ramas", titulo: "Ramas paralelas", descripcion: "Un lead puede estar en múltiples pipelines simultáneamente. La IA evalúa cuándo abrir una rama paralela según señales CAGC.", estado: "automatico" },
      { id: "pipeline-protocolos", titulo: "Protocolos de etapa", descripcion: "Cada etapa tiene reglas de avance/retroceso. Pueden ser propuestas por IA o configuradas manualmente.", estado: "activo" },
      { id: "pipeline-cagc", titulo: "Auditoría CAGC", descripcion: "Panel de 17 fases del modelo CAGC (Consciencia → Advocacy). Detecta huecos y oportunidades por fase.", estado: "activo", href: "/admin/cagc" },
      { id: "pipeline-matriz-global", titulo: "Matriz Global CAGC", descripcion: "Cuadrícula Servicios × 17 Fases CAGC. Click en celda lleva a los leads activos en ese cruce.", estado: "activo", href: "/admin/matriz-cagc-global" },
      { id: "pipeline-matriz-nd", titulo: "Matriz nD", descripcion: "Respuestas sugeridas segmentadas por temperamento DISC, objeción, servicio, canal y fase CAGC.", estado: "activo", href: "/admin/matriz" },
      { id: "pipeline-objeciones", titulo: "Sistema de objeciones 3 capas", descripcion: "Capa 1: Setter · Capa 2: Condición vs. Objeción · Capa 3: Las 3 Desconfianzas (empresa / profesional / propia).", estado: "automatico" },
      { id: "pipeline-regla-oro", titulo: "Regla de Oro del Cierre", descripcion: "En cada pausa la IA sondea: '¿esto te hace sentido?' y '¿cuál es el siguiente paso?'. Nunca abandona una negociación sin intentar el cierre.", estado: "automatico" },
    ],
  },
  {
    id: "conocimiento",
    label: "Conocimiento",
    emoji: "📚",
    features: [
      { id: "kb-base", titulo: "Base de conocimiento (KB)", descripcion: "FAQs, objeciones, templates y prácticas de venta. La IA busca por similitud semántica antes de responder.", estado: "activo", href: "/admin/conocimiento" },
      { id: "kb-servicios", titulo: "Catálogo de servicios", descripcion: "Cada servicio tiene precio lista/descuento, imágenes por canal, brochures, reglas de bundle y links de pago.", estado: "activo", href: "/admin/servicios" },
      { id: "kb-gatillos", titulo: "Gatillos mentales", descripcion: "Escasez, urgencia, precio vigente y próximos eventos. La IA los inyecta en el contexto de las conversaciones.", estado: "activo", href: "/admin/gatillos" },
      { id: "kb-leadmagnets", titulo: "Leadmagnets", descripcion: "La IA selecciona el leadmagnet óptimo por fase CAGC con cooldown de 24h y score mínimo de 0.30.", estado: "automatico" },
      { id: "kb-brochures", titulo: "Brochures", descripcion: "La IA selecciona y envía brochures proactivamente con la misma lógica que los leadmagnets.", estado: "automatico" },
      { id: "kb-custom-fields", titulo: "Custom fields IA", descripcion: "La IA escanea conversaciones y sugiere campos personalizados por avatar. Cron miércoles 2am.", estado: "automatico" },
      { id: "kb-embeddings", titulo: "Embeddings y búsqueda semántica", descripcion: "Todos los recursos de KB tienen embedding text-embedding-3-small (OpenAI). Búsqueda por similitud coseno.", estado: "automatico" },
    ],
  },
  {
    id: "ia-proactiva",
    label: "IA Proactiva",
    emoji: "🤖",
    features: [
      { id: "ia-aprobaciones", titulo: "Cola de aprobaciones", descripcion: "Todas las acciones de IA pasan por aquí: sugerencias KB, Matriz nD, mensajes WA, briefs de diseño y clusters.", estado: "activo", href: "/admin/aprobaciones" },
      { id: "ia-sugerencias-v2", titulo: "Sugerencias 2.0", descripcion: "Cada sugerencia tiene servicio_id, fase_cagc y embedding. Auto-aprobación en cascada configurable (umbral 75-97%). Clustering diario.", estado: "activo", href: "/admin/aprobaciones" },
      { id: "ia-brief-diseno", titulo: "Briefs de diseño", descripcion: "Cuando detecta un asset faltante, la IA genera un brief estructurado con dimensiones, concepto y textos. Cron lunes 8am.", estado: "automatico" },
      { id: "ia-nurturing", titulo: "Nurturing dinámico", descripcion: "Secuencias automáticas ajustadas por fase CAGC. La IA propone ajustes cada semana. Cron lunes a viernes 8am.", estado: "automatico", href: "/admin/nurturing" },
      { id: "ia-contexto", titulo: "Contexto IA por lead", descripcion: "Se actualiza con cada conversación WA. Compresión automática al superar 10 entradas. Notas manuales con autor.", estado: "automatico" },
      { id: "ia-auditor-integridad", titulo: "Auditoría de integridad", descripcion: "Verifica la cadena completa (captura → pipeline → tarea → Calendar) por lead activo. Cron diario 11pm.", estado: "automatico", href: "/admin/auditoria-integridad" },
      { id: "ia-validador-contacto", titulo: "Validador de contacto", descripcion: "Detecta leads con tarea activa sin punto de contacto programado y genera alertas. Cron diario 6am.", estado: "automatico" },
    ],
  },
  {
    id: "prospeccion",
    label: "Prospección",
    emoji: "📋",
    features: [
      { id: "prosp-csv", titulo: "Importar lista CSV", descripcion: "Carga hasta 500 contactos desde CSV. Valida contra blacklist, asigna etiqueta 'Lista propia' y tarea de seguimiento.", estado: "activo", href: "/admin/prospeccion" },
      { id: "prosp-reconexion", titulo: "Mensajes de reconexión", descripcion: "Envía un primer contacto sin oferta a leads de lista propia. Personalizable con {nombre}. Pasa por cola de aprobación.", estado: "activo", href: "/admin/prospeccion" },
      { id: "prosp-secuencias", titulo: "Secuencias omnicanal", descripcion: "Configura flujos de N pasos con canal (WA/email), delay en días y condición (siempre / sin respuesta). Cron diario 7am.", estado: "activo", href: "/admin/prospeccion", badge: "S34" },
      { id: "prosp-templates-wa", titulo: "Plantillas WhatsApp", descripcion: "Crea templates con editor de header/body/footer, envíalos a Meta para aprobación y consulta su estado. Polling automático cada 2h.", estado: "activo", href: "/admin/plantillas-wa", badge: "S34" },
    ],
  },
  {
    id: "vendedores",
    label: "Vendedores",
    emoji: "🏆",
    features: [
      { id: "vend-agenda", titulo: "Mi agenda", descripcion: "Vista del vendedor con sus citas del día y próximas. Acceso a Meet, notas y resultado de sesión.", estado: "activo", href: "/vendedor/agenda" },
      { id: "vend-citas", titulo: "Panel de citas", descripcion: "Todas las citas del equipo con estado (pendiente/show/noshow), notas y botón de transcripto Meet.", estado: "activo", href: "/admin/citas" },
      { id: "vend-meet", titulo: "Google Meet autónomo", descripcion: "Al confirmar una cita, ECMatic crea el evento en Google Calendar y comparte el link Meet en WA sin intervención.", estado: "automatico" },
      { id: "vend-transcriptos", titulo: "Transcriptos de Meet", descripcion: "Botón 'Transcripto' en citas con estado show. La IA analiza el contenido y extrae objeciones y compromisos.", estado: "activo" },
      { id: "vend-pesos", titulo: "Pesos de prioridad", descripcion: "Cada vendedor tiene un peso 0-100. La IA monitorea desempeño y sugiere ajustes. Cron diario 1am.", estado: "activo", href: "/admin/vendedores" },
      { id: "vend-asignacion-optima", titulo: "Asignación óptima (Algoritmo Húngaro)", descripcion: "Calcula la asignación vendedor-lead que maximiza la conversión esperada total. Propuesta + botón 'Aplicar'.", estado: "activo", href: "/admin/vendedores", badge: "S35" },
    ],
  },
  {
    id: "analitica",
    label: "Analítica",
    emoji: "📊",
    features: [
      { id: "anal-calidad", titulo: "Calidad conversacional", descripcion: "Score de conversaciones analizadas por IA: coherencia, velocidad, cobertura de objeciones y personalización.", estado: "activo", href: "/admin/analitica" },
      { id: "anal-competidores", titulo: "Inteligencia de competidores", descripcion: "Detecta menciones de competidores en conversaciones y las agrupa con fecha de última mención.", estado: "automatico" },
      { id: "anal-precio-ab", titulo: "Test A/B de precio", descripcion: "Thompson Sampling aplicado a grupos de precio. Declara ganador cuando la diferencia supera el umbral o aplica benchmark.", estado: "activo", href: "/admin/analitica" },
      { id: "anal-pipeline-ab", titulo: "Test A/B de pipeline", descripcion: "Thompson Sampling por etapa y variante. Visualización de θ̄ (media de la Beta) y variante preferida en tiempo real.", estado: "activo", href: "/admin/analitica", badge: "S35" },
      { id: "anal-score-historial", titulo: "Historial de score de salud", descripcion: "Gráfica colapsable en la ficha del lead con las últimas 30 mediciones del score.", estado: "activo", badge: "S35" },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    emoji: "🔌",
    features: [
      { id: "sist-modo", titulo: "Modo de operación", descripcion: "Pruebas → Seguro → Seguro automático → Automático. Controla si la IA actúa o solo sugiere.", estado: "activo", href: "/admin/sistema" },
      { id: "sist-gasto-ia", titulo: "Log de sistema", descripcion: "Registro unificado de IA, crons, webhooks y servicios externos. Filtrable por categoría.", estado: "activo", href: "/admin/log" },
      { id: "sist-automatizaciones", titulo: "Panel de automatizaciones", descripcion: "Todos los CRONs en un lugar: descripción, schedule, última ejecución y botón 'Ejecutar ahora'.", estado: "activo", href: "/admin/automatizaciones", badge: "S35" },
      { id: "sist-marca", titulo: "Identidad de marca", descripcion: "Nombre, colores, voz y tono de la empresa. La IA inyecta este contexto en cada conversación.", estado: "activo", href: "/admin/marca" },
      { id: "sist-lanzamiento", titulo: "Checklist de lanzamiento WA", descripcion: "Guía paso a paso para conectar el número WhatsApp definitivo a Meta Business.", estado: "activo", href: "/admin/lanzamiento" },
      { id: "sist-sandbox", titulo: "Widget de pruebas", descripcion: "Simula conversaciones WA sin afectar datos reales. Soporta múltiples sesiones guardadas en localStorage.", estado: "activo", href: "/admin/sandbox" },
      { id: "sist-debug-agenda", titulo: "Debug de agendamiento", descripcion: "Timeline coloreado de cada paso del flujo Google Calendar: creación, Meet, notificaciones y errores.", estado: "activo", href: "/admin/debug-agendamiento" },
    ],
  },
];
