// Pipelines: Nurturing para Leads Perdidos — 7 ECs
"use strict";
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ECS = [
  { codigo: "EC0076",    nombre: "Evaluación de la Competencia de Candidatos"                        },
  { codigo: "EC0217.01", nombre: "Impartición de Cursos de Formación del Capital Humano"             },
  { codigo: "EC0249",    nombre: "Consultoría General"                                               },
  { codigo: "EC0301",    nombre: "Diseño de Cursos de Formación del Capital Humano"                  },
  { codigo: "EC0305",    nombre: "Prestación de Servicios de Atención a Clientes"                    },
  { codigo: "EC0366",    nombre: "Desarrollo de Cursos de Formación en Línea"                        },
  { codigo: "EC0581",    nombre: "Comisiones Mixtas de Capacitación, Adiestramiento y Productividad" },
];

function buildEtapas(ec) {
  const { codigo, nombre } = ec;

  return [
    {
      nombre: "Entrada en Nurturing",
      orden: 1,
      fases_cagc: [0, 1, 2],
      es_tronco: false,
      etapas_siguientes: ["Nurturing Temprano"],
      sla_dias: 3, rotting_dias: 5,
      criterios_entrada: `Lead proveniente de la etapa "Perdido / Sin Respuesta" del pipeline de ventas ${codigo}. Motivo de pérdida: sin_respuesta, no_califica_inversion, no_califica_tiempo o eligio_competencia. NO ingresan leads con motivo no_califica_fit o no_le_interesa.`,
      criterios_salida: "Lead categorizado, motivo de pérdida registrado y primer email de nurturing enviado.",
      tareas_obligatorias: [
        { id: "t1_1", nombre: "Verificar motivo de pérdida antes de ingresar", tipo: "manual", obligatoria: true,
          descripcion: "Confirmar que el motivo de pérdida es apto para nurturing: sin_respuesta / no_califica_inversion / no_califica_tiempo / eligio_competencia. Si el motivo es no_califica_fit o no_le_interesa: NO ingresar al nurturing." },
        { id: "t1_2", nombre: "Establecer cadencia de nurturing según motivo", tipo: "manual", obligatoria: true,
          descripcion: "sin_respuesta: cadencia estándar. no_califica_inversion: énfasis en ROI y opciones de pago. no_califica_tiempo: contenido breve y flexible. eligio_competencia: diferenciadores y casos de éxito de Centro ECM." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["email"],
      protocolo: {
        regla_avance: "Primer email de nurturing enviado y lead categorizado por motivo.",
        regla_retroceso: "No aplica — etapa de entrada.",
        regla_espera: "Enviar primer contenido en máximo 3 días de ingresar al nurturing para no perder momentum.",
      },
    },
    {
      nombre: "Nurturing Temprano",
      orden: 2,
      fases_cagc: [1, 2, 3],
      es_tronco: false,
      etapas_siguientes: ["Nurturing Medio", "Intento de Reactivación", "Recuperado — Re-activar Pipeline"],
      sla_dias: 30, rotting_dias: 15,
      criterios_entrada: "Primer email de bienvenida al nurturing enviado.",
      criterios_salida: "Secuencia de contenido educativo temprano completada (30 días) o lead responde activamente.",
      tareas_obligatorias: [
        { id: "t2_1", nombre: "Enviar contenido semana 1 — ¿Qué es el EC y qué abre?", tipo: "manual", obligatoria: true,
          descripcion: `Contenido educativo: qué es el ${codigo} (${nombre}), para quién es, qué puertas abre profesionalmente. Tono informativo, sin presión de venta.` },
        { id: "t2_2", nombre: "Enviar contenido semana 2 — Casos de uso reales", tipo: "manual", obligatoria: true,
          descripcion: `Ejemplos concretos de personas que se certificaron en ${codigo} y cómo cambió su situación laboral o profesional.` },
        { id: "t2_3", nombre: "Enviar contenido semana 3 — El proceso de certificación", tipo: "manual", obligatoria: false,
          descripcion: `Explicación simple de cómo funciona el proceso CONOCER para el ${codigo}: etapas, tiempos estimados, garantías de Centro ECM. Resolver las dudas más frecuentes.` },
        { id: "t2_4", nombre: "Monitorear apertura y clics", tipo: "manual", obligatoria: false,
          descripcion: "Si el lead abre emails y hace clic en algún enlace: considerar adelantar el Intento de Reactivación sin esperar a completar el ciclo completo." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["email"],
      protocolo: {
        regla_avance: "30 días de nurturing temprano completados → pasar a Nurturing Medio. Si el lead responde o hace clic activamente: adelantar a Intento de Reactivación.",
        regla_retroceso: "No aplica.",
        regla_espera: "Máximo 15 días sin enviar contenido. Mantener cadencia semanal o quincenal.",
      },
    },
    {
      nombre: "Nurturing Medio",
      orden: 3,
      fases_cagc: [2, 3, 4],
      es_tronco: false,
      etapas_siguientes: ["Nurturing Tardío", "Intento de Reactivación", "Recuperado — Re-activar Pipeline"],
      sla_dias: 60, rotting_dias: 20,
      criterios_entrada: "Nurturing Temprano completado (30 días) sin respuesta activa.",
      criterios_salida: "Secuencia de contenido medio completada (60 días) o lead responde.",
      tareas_obligatorias: [
        { id: "t3_1", nombre: "Enviar mes 2 — ROI y beneficios tangibles", tipo: "manual", obligatoria: true,
          descripcion: `Contenido sobre el retorno de inversión de la certificación ${codigo}: incremento salarial promedio, acceso a licitaciones, diferenciador competitivo, validez nacional del certificado CONOCER.` },
        { id: "t3_2", nombre: "Enviar mes 2 — Testimonio de certificado exitoso", tipo: "manual", obligatoria: true,
          descripcion: `Caso de éxito real (anonimizado si es necesario) de alguien certificado en ${codigo} con Centro ECM. Incluir antes/después concreto.` },
        { id: "t3_3", nombre: "Enviar mes 3 — Las 3 garantías de Centro ECM", tipo: "manual", obligatoria: false,
          descripcion: "Recordar las garantías: pre-evaluación interna, segunda evaluación sin costo si ANC, devolución total si insatisfacción. Diferenciador frente a otros centros de evaluación." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["email"],
      protocolo: {
        regla_avance: "60 días de nurturing medio completados → pasar a Nurturing Tardío. Si responde activamente: adelantar a Reactivación.",
        regla_retroceso: "No aplica.",
        regla_espera: "Envío quincenal mínimo. Si el lead cancela suscripción: mover a Archivado.",
      },
    },
    {
      nombre: "Nurturing Tardío",
      orden: 4,
      fases_cagc: [3, 4, 5],
      es_tronco: false,
      etapas_siguientes: ["Intento de Reactivación", "Archivado / Sin Respuesta Definitiva"],
      sla_dias: 90, rotting_dias: 30,
      criterios_entrada: "Nurturing Medio completado (90 días desde ingreso) sin respuesta activa.",
      criterios_salida: "90 días de nurturing tardío completados → pasar a Intento de Reactivación.",
      tareas_obligatorias: [
        { id: "t4_1", nombre: "Enviar mes 4-5 — Actualización de condiciones o promoción vigente", tipo: "manual", obligatoria: true,
          descripcion: `Comunicar si hay condiciones especiales vigentes: precio de lanzamiento, descuentos por temporada, nuevas modalidades del ${codigo}. Si no hay nada especial: recordar el valor de certificarse antes de que cambien los estándares CONOCER.` },
        { id: "t4_2", nombre: "Enviar mes 5-6 — Urgencia suave y cierre del ciclo", tipo: "manual", obligatoria: true,
          descripcion: `Mensaje que comunica que próximamente se reducirá la frecuencia de contacto. Invitar a responder si el timing cambió. Última oportunidad antes del intento de reactivación directo.` },
        { id: "t4_3", nombre: "Monitorear cualquier señal de interés", tipo: "manual", obligatoria: false,
          descripcion: "Clic en enlace, respuesta, visita a landing page: adelantar inmediatamente al Intento de Reactivación sin esperar los 90 días." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["email"],
      protocolo: {
        regla_avance: "90 días completados → Intento de Reactivación obligatorio antes de archivar.",
        regla_retroceso: "No aplica.",
        regla_espera: "Envío mensual mínimo. Si cancela suscripción o marca como spam: mover a Archivado de inmediato.",
      },
    },
    {
      nombre: "Intento de Reactivación",
      orden: 5,
      fases_cagc: [4, 5, 6],
      es_tronco: false,
      etapas_siguientes: ["Recuperado — Re-activar Pipeline", "Archivado / Sin Respuesta Definitiva"],
      sla_dias: 14, rotting_dias: 7,
      criterios_entrada: "Nurturing Tardío completado (180 días desde ingreso) o señal de interés detectada en cualquier etapa anterior.",
      criterios_salida: "Lead responde y muestra interés real (→ Recuperado) o no responde tras 2 intentos (→ Archivado).",
      tareas_obligatorias: [
        { id: "t5_1", nombre: "Contacto directo por WhatsApp — intento 1", tipo: "manual", obligatoria: true,
          descripcion: `Mensaje directo y personal por WhatsApp: "Hola [nombre], hace un tiempo hablamos sobre tu certificación en ${codigo}. ¿Cambió algo en tu situación? Me gustaría saber si puedo ayudarte ahora." Tono cálido, sin presión.` },
        { id: "t5_2", nombre: "Email de reactivación con oferta concreta", tipo: "manual", obligatoria: true,
          descripcion: `Email con propuesta concreta: recordar las garantías, mencionar precio vigente (sin revelar en el email si es confidencial), invitar a agendar una nueva sesión diagnóstico gratuita de 20 minutos.` },
        { id: "t5_3", nombre: "Segundo intento WA si no hay respuesta en 7 días", tipo: "manual", obligatoria: false,
          descripcion: "Si no respondió al primer intento: un segundo mensaje breve por WhatsApp. Si tampoco responde: mover a Archivado." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Lead responde positivamente y muestra interés concreto → mover a Recuperado.",
        regla_retroceso: "No aplica.",
        regla_espera: "2 intentos en 14 días. Sin respuesta: archivar. Con respuesta negativa definitiva: archivar.",
      },
    },
    {
      nombre: "Recuperado — Re-activar Pipeline",
      orden: 6,
      fases_cagc: [3, 4, 5],
      es_tronco: false,
      etapas_siguientes: [],
      sla_dias: null, rotting_dias: null,
      criterios_entrada: "Lead respondió al intento de reactivación y muestra interés real en certificarse.",
      criterios_salida: "Etapa terminal. Lead transferido al pipeline de Entrada en Frío correspondiente al EC.",
      tareas_obligatorias: [
        { id: "t6_1", nombre: "Registrar motivo de retorno del lead", tipo: "manual", obligatoria: true,
          descripcion: "Documentar qué cambió para que el lead retome el interés: cambió empleo, subió presupuesto, venció contrato con competidor, referido, otro." },
        { id: "t6_2", nombre: "Transferir al pipeline de ventas activo", tipo: "manual", obligatoria: true,
          descripcion: `Mover al lead al pipeline "Entrada en Frío" del ${codigo}, en la etapa "Calificando" (ya respondió, no necesita primer contacto de nuevo). Aplicar todo el historial de nurturing como contexto.` },
        { id: "t6_3", nombre: "Agendar sesión diagnóstico con prioridad", tipo: "manual", obligatoria: true,
          descripcion: "El lead recuperado tiene prioridad para agendar. Ofrecer disponibilidad inmediata del asesor para no perder el momentum del retorno." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "No aplica — etapa terminal.",
        regla_retroceso: "No aplica.",
        regla_espera: "Mover al pipeline de ventas en máximo 24 h de confirmado el interés. No dejar enfriar el retorno.",
      },
    },
    {
      nombre: "Archivado / Sin Respuesta Definitiva",
      orden: 7,
      fases_cagc: [0],
      es_tronco: false,
      etapas_siguientes: [],
      sla_dias: null, rotting_dias: null,
      criterios_entrada: "Sin respuesta tras todo el ciclo de nurturing (180 días) y el intento de reactivación, o cancelación de suscripción, o rechazo explícito definitivo.",
      criterios_salida: "Etapa terminal. Lead archivado permanentemente.",
      tareas_obligatorias: [
        { id: "t7_1", nombre: "Registrar motivo de archivo", tipo: "manual", obligatoria: true,
          descripcion: "Motivo: sin_respuesta_total / cancelo_suscripcion / rechazo_explicito / datos_invalidos / otro." },
        { id: "t7_2", nombre: "Remover de todas las secuencias activas", tipo: "manual", obligatoria: true,
          descripcion: "Asegurarse de que el lead no reciba más comunicaciones de nurturing. Respetar la decisión y las normas anti-spam." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: [],
      protocolo: {
        regla_avance: "No aplica — etapa terminal.",
        regla_retroceso: "No aplica.",
        regla_espera: "No aplica.",
      },
    },
  ];
}

async function crearPipeline(ec) {
  const { codigo, nombre } = ec;
  const slug = codigo.toLowerCase().replace(".", "");
  const ruta = `${slug}_nurturing_perdidos_${Date.now().toString(36)}`;

  const { data: pipeline, error: pErr } = await sb
    .from("pipelines")
    .insert({
      ruta,
      nombre: `${codigo} · ${nombre} — Nurturing Leads Perdidos`,
      descripcion: `Flujo de nurturing para leads que no compraron en el pipeline de ventas ${codigo}. Contenido educativo escalonado en 3 fases (30/60/90 días) seguido de un intento de reactivación directa. Alimentado por la etapa "Perdido / Sin Respuesta" del pipeline de Entrada en Frío del ${codigo}.`,
      tipo: "rama",
      servicio_id: null,
      fase_cagc_inicio: 0,
      fase_cagc_fin: 5,
      activo: true,
    })
    .select("id, ruta")
    .single();

  if (pErr) throw new Error(`Pipeline ${codigo}: ${pErr.message}`);
  console.log(`\n[OK] ${codigo} — id: ${pipeline.id} | ruta: ${pipeline.ruta}`);

  for (const etapa of buildEtapas(ec)) {
    const { canales, protocolo, ...etapaData } = etapa;

    const { data: e, error: eErr } = await sb
      .from("pipeline_etapas")
      .insert({ ...etapaData, ruta: pipeline.ruta, activo: true })
      .select("id")
      .single();

    if (eErr) throw new Error(`Etapa "${etapa.nombre}" (${codigo}): ${eErr.message}`);
    process.stdout.write(`    [${etapa.orden}] ${etapa.nombre}`);

    if (canales.length) {
      const { error: cErr } = await sb
        .from("etapa_canales")
        .insert(canales.map((canal) => ({ etapa_id: e.id, canal, activo: true })));
      if (cErr) throw new Error(`Canales etapa ${etapa.orden} (${codigo}): ${cErr.message}`);
    }

    const { error: prErr } = await sb.from("etapa_protocolo").insert({
      etapa_id: e.id,
      tipo: "ia-propuesto",
      regla_avance:    protocolo.regla_avance,
      regla_retroceso: protocolo.regla_retroceso,
      regla_espera:    protocolo.regla_espera,
    });
    if (prErr) throw new Error(`Protocolo etapa ${etapa.orden} (${codigo}): ${prErr.message}`);
    console.log(canales.length ? ` [${canales.join("+")}] ✓` : " ✓");
  }

  return pipeline;
}

async function main() {
  console.log(`Creando ${ECS.length} pipelines de nurturing para leads perdidos...\n`);
  const resultados = [];

  for (const ec of ECS) {
    const p = await crearPipeline(ec);
    resultados.push({ ec: ec.codigo, id: p.id, ruta: p.ruta });
  }

  console.log("\n✅ Todos los pipelines de nurturing creados:");
  resultados.forEach(r => console.log(`   ${r.ec.padEnd(10)} | ${r.ruta}`));
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
