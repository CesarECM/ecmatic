// Pipelines: Certificación — Entrada en Frío para EC0076, EC0249, EC0301, EC0305, EC0366, EC0581
"use strict";
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ECS = [
  { codigo: "EC0076", nombre: "Evaluación de la Competencia de Candidatos",                           evalPresencial: true  },
  { codigo: "EC0249", nombre: "Consultoría General",                                                   evalPresencial: false },
  { codigo: "EC0301", nombre: "Diseño de Cursos de Formación del Capital Humano",                     evalPresencial: false },
  { codigo: "EC0305", nombre: "Prestación de Servicios de Atención a Clientes",                       evalPresencial: false },
  { codigo: "EC0366", nombre: "Desarrollo de Cursos de Formación en Línea",                           evalPresencial: false },
  { codigo: "EC0581", nombre: "Comisiones Mixtas de Capacitación, Adiestramiento y Productividad",    evalPresencial: false },
];

function buildEtapas(ec) {
  const { codigo, nombre, evalPresencial } = ec;
  const notaPresencial = evalPresencial
    ? " Importante: la evaluación oficial del EC0076 se realiza de forma PRESENCIAL — indicarlo claramente al prospecto durante la propuesta."
    : "";

  return [
    {
      nombre: "Prospecto Frío",
      orden: 1,
      fases_cagc: [0, 1],
      es_tronco: true,
      etapas_siguientes: ["Primer Contacto Enviado", "Perdido / Sin Respuesta"],
      sla_dias: 1, rotting_dias: 2,
      criterios_entrada: `Contacto identificado como potencial candidato al ${codigo} sin historial previo con Centro ECM.`,
      criterios_salida: "Primer mensaje de contacto enviado por WhatsApp.",
      tareas_obligatorias: [
        { id: "t1_1", nombre: "Registrar fuente del prospecto", tipo: "manual", obligatoria: true,
          descripcion: "Anotar cómo se obtuvo el contacto: lista propia, referido, evento, redes sociales u otro." }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: [],
      protocolo: {
        regla_avance: "Primer mensaje de presentación enviado con fuente del prospecto registrada.",
        regla_retroceso: "No aplica — etapa de entrada.",
        regla_espera: "No demorar más de 1 día hábil en hacer el primer contacto.",
      },
    },
    {
      nombre: "Primer Contacto Enviado",
      orden: 2,
      fases_cagc: [1, 2],
      es_tronco: true,
      etapas_siguientes: ["Calificando", "Perdido / Sin Respuesta"],
      sla_dias: 3, rotting_dias: 4,
      criterios_entrada: "Mensaje inicial enviado por WhatsApp.",
      criterios_salida: "El prospecto responde.",
      tareas_obligatorias: [
        { id: "t2_1", nombre: `Enviar mensaje de apertura ${codigo}`, tipo: "manual", obligatoria: true,
          descripcion: `Mensaje breve y personalizado sobre la certificación ${codigo}. No revelar precio. Invitar a conversación.` }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp"],
      protocolo: {
        regla_avance: "El prospecto responde al mensaje de apertura.",
        regla_retroceso: "No aplica.",
        regla_espera: "Día 2 sin respuesta: seguimiento breve. Día 4: segundo intento. Sin respuesta: mover a Perdido.",
      },
    },
    {
      nombre: "Calificando",
      orden: 3,
      fases_cagc: [2, 3, 4, 5],
      es_tronco: true,
      etapas_siguientes: ["Videollamada de Diagnóstico Agendada", "Perdido / Sin Respuesta"],
      sla_dias: 2, rotting_dias: 3,
      criterios_entrada: "Prospecto respondió; hay intercambio activo.",
      criterios_salida: "Prospecto calificado en los tres ejes y sesión de diagnóstico agendada.",
      tareas_obligatorias: [
        { id: "t3_1", nombre: "Aplicar protocolo Setter — 6 fases", tipo: "manual", obligatoria: true,
          descripcion: `Seguir el protocolo: (1) Apertura elegante. (2) Diagnóstico de situación. (3) Identificación del dolor. (4) Situación deseada. (5) Cualificación: inversión, tiempo, fit del ${codigo}. Si NO califica: despedida amable + nurturing, sin forzar. (6) Si califica: agendar sesión diagnóstico.` },
        { id: "t3_2", nombre: "Agendar videollamada de diagnóstico con el asesor", tipo: "manual", obligatoria: true,
          descripcion: "Proponer horarios disponibles del asesor. Confirmar por WhatsApp y email." }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "llamada"],
      protocolo: {
        regla_avance: "Prospecto calificado en los 3 ejes Y videollamada agendada en Calendar.",
        regla_retroceso: "No aplica.",
        regla_espera: "Máximo 2 días entre mensajes. Si no califica: despedida amable inmediata + nurturing.",
      },
    },
    {
      nombre: "Videollamada de Diagnóstico Agendada",
      orden: 4,
      fases_cagc: [4, 5, 6],
      es_tronco: true,
      etapas_siguientes: ["Videollamada Realizada / Propuesta Presentada", "Perdido / Sin Respuesta"],
      sla_dias: 7, rotting_dias: 3,
      criterios_entrada: "Sesión de diagnóstico agendada en Google Calendar; invitación enviada.",
      criterios_salida: "Sesión de diagnóstico realizada con el asesor.",
      tareas_obligatorias: [
        { id: "t4_1", nombre: "Enviar confirmación de cita", tipo: "manual", obligatoria: true,
          descripcion: "Confirmar fecha, hora CDMX, link Meet y nombre del asesor. Recordar que es gratuita y sin compromiso." },
        { id: "t4_2", nombre: "Recordatorio 24 h antes", tipo: "manual", obligatoria: true,
          descripcion: "WhatsApp de recordatorio el día anterior. Si cancela: reagendar de inmediato." }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email", "meet"],
      protocolo: {
        regla_avance: "Sesión de diagnóstico realizada.",
        regla_retroceso: "No aplica.",
        regla_espera: "Si cancela: reagendar una vez. Segunda cancelación o no responde: mover a Perdido.",
      },
    },
    {
      nombre: "Videollamada Realizada / Propuesta Presentada",
      orden: 5,
      fases_cagc: [6, 7, 8],
      es_tronco: true,
      etapas_siguientes: ["Liga de Pago Enviada", "En Seguimiento Post-Diagnóstico", "Perdido / Sin Respuesta"],
      sla_dias: 2, rotting_dias: 3,
      criterios_entrada: `Sesión de diagnóstico completada. Precio y opciones del ${codigo} revelados.${notaPresencial}`,
      criterios_salida: "Prospecto decide: compra, necesita tiempo, o descarta.",
      tareas_obligatorias: [
        { id: "t5_1", nombre: "Registrar resultado de la videollamada", tipo: "manual", obligatoria: true,
          descripcion: `Registrar: opción elegida (A/B/C del ${codigo}), precio cotizado, objeción principal y decisión inmediata.${notaPresencial}` },
        { id: "t5_2", nombre: "Aplicar Regla de Oro del Cierre", tipo: "manual", obligatoria: true,
          descripcion: "Antes de terminar: '¿esto te hace sentido?' y '¿cuál es el siguiente paso que te gustaría dar?'. No terminar sin intentar el cierre." }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Prospecto acepta en la llamada → enviar liga de pago de inmediato.",
        regla_retroceso: "No aplica.",
        regla_espera: "Si necesita tiempo: pasar a Seguimiento con siguiente contacto programado en ese momento.",
      },
    },
    {
      nombre: "En Seguimiento Post-Diagnóstico",
      orden: 6,
      fases_cagc: [7, 8],
      es_tronco: true,
      etapas_siguientes: ["Liga de Pago Enviada", "Videollamada de Diagnóstico Agendada", "Perdido / Sin Respuesta"],
      sla_dias: 5, rotting_dias: 7,
      criterios_entrada: "Prospecto no cerró en la videollamada; necesita tiempo.",
      criterios_salida: "Confirma compra o descarta definitivamente.",
      tareas_obligatorias: [
        { id: "t6_1", nombre: "Primer seguimiento post-llamada (48 h)", tipo: "manual", obligatoria: true,
          descripcion: "Recordar puntos clave de la propuesta y las 3 garantías del servicio. Resolver objeción pendiente." },
        { id: "t6_2", nombre: "Segundo seguimiento (día 5)", tipo: "manual", obligatoria: false,
          descripcion: "Si no responde al primero: un segundo intento. Sin respuesta: mover a Perdido." }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Prospecto confirma compra → enviar liga de pago.",
        regla_retroceso: "Pide aclarar dudas → re-agendar videollamada de diagnóstico.",
        regla_espera: "Máximo 2 rondas (48 h y día 5). Sin respuesta: Perdido.",
      },
    },
    {
      nombre: "Liga de Pago Enviada",
      orden: 7,
      fases_cagc: [9],
      es_tronco: true,
      etapas_siguientes: ["Pagado / Proceso Iniciado", "En Seguimiento Post-Diagnóstico", "Perdido / Sin Respuesta"],
      sla_dias: 2, rotting_dias: 3,
      criterios_entrada: "Prospecto confirmó intención de compra.",
      criterios_salida: "Pago confirmado.",
      tareas_obligatorias: [
        { id: "t7_1", nombre: "Enviar liga o datos de pago", tipo: "manual", obligatoria: true,
          descripcion: `Enviar link de pago (Stripe) o transferencia según preferencia. Incluir desglose: precio del servicio ${codigo} + recordatorio de que la emisión del certificado CONOCER se factura por separado conforme a normativa vigente.` }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Pago confirmado.",
        regla_retroceso: "Nueva duda → regresar a En Seguimiento Post-Diagnóstico.",
        regla_espera: "Seguimiento a 24 h si no hay confirmación. Máximo 3 días.",
      },
    },
    {
      nombre: "Pagado / Proceso Iniciado",
      orden: 8,
      fases_cagc: [10, 11],
      es_tronco: true,
      etapas_siguientes: [],
      sla_dias: 1, rotting_dias: 2,
      criterios_entrada: "Pago confirmado.",
      criterios_salida: `Etapa terminal. Cliente inicia proceso de certificación ${codigo}.`,
      tareas_obligatorias: [
        { id: "t8_1", nombre: "Confirmar pago y enviar bienvenida", tipo: "manual", obligatoria: true,
          descripcion: `Confirmar pago. Enviar bienvenida al proceso ${codigo} con los siguientes pasos.` },
        { id: "t8_2", nombre: "Agendar primera sesión de alineación", tipo: "manual", obligatoria: true,
          descripcion: "Coordinar la primera sesión 1a1 con el evaluador asignado. Informar sobre la pre-evaluación interna como primer paso." }
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "No aplica — etapa terminal.",
        regla_retroceso: "No aplica.",
        regla_espera: "Primer contacto de onboarding en máximo 24 h del pago confirmado.",
      },
    },
    {
      nombre: "Perdido / Sin Respuesta",
      orden: 9,
      fases_cagc: [0, 1, 2],
      es_tronco: true,
      etapas_siguientes: [],
      sla_dias: null, rotting_dias: null,
      criterios_entrada: "Sin respuesta tras seguimientos, descalificación por fit, o rechazo en cualquier etapa.",
      criterios_salida: "Etapa terminal. Lead ingresa a nurturing o reactivación.",
      tareas_obligatorias: [
        { id: "t9_1", nombre: "Registrar motivo de pérdida", tipo: "manual", obligatoria: true,
          descripcion: "Seleccionar: sin_respuesta / no_califica_inversion / no_califica_tiempo / no_califica_fit / eligio_competencia / no_le_interesa / otro." },
        { id: "t9_2", nombre: "Agregar a nurturing o reactivación según motivo", tipo: "manual", obligatoria: true,
          descripcion: "sin_respuesta / eligio_competencia: lista reactivación. no_califica_inversion / tiempo: nurturing largo plazo. no_califica_fit: no agregar a ninguna lista." }
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
  const { codigo, nombre, evalPresencial } = ec;
  const notaDesc = evalPresencial
    ? " La evaluación oficial de este EC es PRESENCIAL — comunicarlo durante la propuesta."
    : "";

  const ruta = `${codigo.toLowerCase().replace(".", "")}_cert_frio_${Date.now().toString(36)}`;

  const { data: pipeline, error: pErr } = await sb
    .from("pipelines")
    .insert({
      ruta,
      nombre: `${codigo} · ${nombre} — Entrada en Frío`,
      descripcion: `Pipeline consultivo para prospectos fríos interesados en certificarse en el ${codigo} (${nombre}). Calificación por WhatsApp con protocolo Setter; cierre en videollamada de diagnóstico con el asesor.${notaDesc}`,
      tipo: "tronco",
      servicio_id: null,
      fase_cagc_inicio: 0,
      fase_cagc_fin: 14,
      activo: true,
    })
    .select("id, ruta")
    .single();

  if (pErr) throw new Error(`Pipeline ${codigo}: ${pErr.message}`);
  console.log(`\n[OK] Pipeline ${codigo} — id: ${pipeline.id} | ruta: ${pipeline.ruta}`);

  const etapas = buildEtapas(ec);

  for (const etapa of etapas) {
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
  console.log(`Creando ${ECS.length} pipelines de entrada en frío...\n`);
  const resultados = [];

  for (const ec of ECS) {
    const p = await crearPipeline(ec);
    resultados.push({ ec: ec.codigo, id: p.id, ruta: p.ruta });
  }

  console.log("\n✅ Todos los pipelines creados:");
  resultados.forEach(r => console.log(`   ${r.ec.padEnd(10)} | ${r.ruta}`));
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
