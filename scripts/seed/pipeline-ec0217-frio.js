// Pipeline: EC0217.01 · Certificación — Entrada en Frío
"use strict";
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ETAPAS = [
  {
    nombre: "Prospecto Frío",
    orden: 1,
    fases_cagc: [0, 1],
    es_tronco: true,
    etapas_siguientes: ["Primer Contacto Enviado", "Perdido / Sin Respuesta"],
    sla_dias: 1,
    rotting_dias: 2,
    criterios_entrada: "Contacto identificado como potencial candidato al EC0217.01 sin ningún historial previo con Centro ECM.",
    criterios_salida: "Primer mensaje de contacto enviado por WhatsApp.",
    tareas_obligatorias: [
      { id: "t1_1", nombre: "Registrar fuente del prospecto", tipo: "manual", obligatoria: true,
        descripcion: "Anotar cómo se obtuvo el contacto: lista propia, referido, evento, redes sociales u otro. Necesario para medir eficiencia de canales de adquisición." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: [],
    protocolo: {
      regla_avance: "Primer mensaje de presentación enviado por WhatsApp con fuente del prospecto registrada.",
      regla_retroceso: "No aplica — etapa de entrada.",
      regla_espera: "No demorar más de 1 día hábil en hacer el primer contacto tras identificar al prospecto.",
    },
  },
  {
    nombre: "Primer Contacto Enviado",
    orden: 2,
    fases_cagc: [1, 2],
    es_tronco: true,
    etapas_siguientes: ["Calificando", "Perdido / Sin Respuesta"],
    sla_dias: 3,
    rotting_dias: 4,
    criterios_entrada: "Mensaje inicial enviado por WhatsApp.",
    criterios_salida: "El prospecto responde al mensaje.",
    tareas_obligatorias: [
      { id: "t2_1", nombre: "Enviar mensaje de apertura EC0217.01", tipo: "manual", obligatoria: true,
        descripcion: "Mensaje breve y personalizado presentando la opción de certificación en EC0217.01. No revelar precio. Invitar a una conversación para conocer su situación." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp"],
    protocolo: {
      regla_avance: "El prospecto responde al mensaje de apertura.",
      regla_retroceso: "No aplica.",
      regla_espera: "Día 2 sin respuesta: enviar seguimiento breve. Día 4: segundo seguimiento. Sin respuesta tras dos intentos: mover a Perdido / Sin Respuesta.",
    },
  },
  {
    nombre: "Calificando",
    orden: 3,
    fases_cagc: [2, 3, 4, 5],
    es_tronco: true,
    etapas_siguientes: ["Videollamada de Diagnóstico Agendada", "Perdido / Sin Respuesta"],
    sla_dias: 2,
    rotting_dias: 3,
    criterios_entrada: "Prospecto respondió; hay intercambio activo.",
    criterios_salida: "Prospecto calificado en los tres ejes (capacidad de inversión, tiempo disponible, fit del servicio) y sesión de diagnóstico agendada en Google Calendar.",
    tareas_obligatorias: [
      { id: "t3_1", nombre: "Aplicar protocolo Setter — 6 fases", tipo: "manual", obligatoria: true,
        descripcion: "Seguir el protocolo: (1) Apertura elegante. (2) Diagnóstico de situación. (3) Identificación del dolor. (4) Definición de situación deseada. (5) Cualificación: capacidad de inversión, tiempo, fit del EC0217.01. Si NO califica: despedida amable + agregar a nurturing, sin forzar venta. (6) Si califica: transición y agendamiento de la sesión diagnóstico." },
      { id: "t3_2", nombre: "Agendar videollamada de diagnóstico con el asesor", tipo: "manual", obligatoria: true,
        descripcion: "Proponer horarios disponibles del asesor. La sesión es gratuita, sin compromiso, de aproximadamente 30-45 minutos. Confirmar por WhatsApp y email." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "llamada"],
    protocolo: {
      regla_avance: "Prospecto calificado en los 3 ejes Y videollamada de diagnóstico agendada en Calendar.",
      regla_retroceso: "No aplica.",
      regla_espera: "Máximo 2 días entre mensajes. Si el prospecto no califica: despedida amable inmediata + nurturing. No insistir si no hay fit real.",
    },
  },
  {
    nombre: "Videollamada de Diagnóstico Agendada",
    orden: 4,
    fases_cagc: [4, 5, 6],
    es_tronco: true,
    etapas_siguientes: ["Videollamada Realizada / Propuesta Presentada", "Perdido / Sin Respuesta"],
    sla_dias: 7,
    rotting_dias: 3,
    criterios_entrada: "Sesión de diagnóstico agendada en Google Calendar; invitación enviada al prospecto.",
    criterios_salida: "Sesión de diagnóstico realizada con el asesor.",
    tareas_obligatorias: [
      { id: "t4_1", nombre: "Enviar confirmación de cita por WhatsApp y email", tipo: "manual", obligatoria: true,
        descripcion: "Confirmar fecha, hora (CDMX), link de Google Meet y nombre del asesor asignado. Recordar que la sesión es gratuita y sin compromiso." },
      { id: "t4_2", nombre: "Recordatorio 24 h antes de la sesión", tipo: "manual", obligatoria: true,
        descripcion: "Enviar recordatorio por WhatsApp el día anterior confirmando asistencia. Si cancela: reagendar de inmediato." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email", "meet"],
    protocolo: {
      regla_avance: "Sesión de diagnóstico realizada.",
      regla_retroceso: "No aplica.",
      regla_espera: "Si cancela o no se presenta: intentar reagendar una vez. Si vuelve a cancelar o no responde: mover a Perdido / Sin Respuesta.",
    },
  },
  {
    nombre: "Videollamada Realizada / Propuesta Presentada",
    orden: 5,
    fases_cagc: [6, 7, 8],
    es_tronco: true,
    etapas_siguientes: ["Liga de Pago Enviada", "En Seguimiento Post-Diagnóstico", "Perdido / Sin Respuesta"],
    sla_dias: 2,
    rotting_dias: 3,
    criterios_entrada: "Sesión de diagnóstico completada. Precio y opciones de servicio revelados.",
    criterios_salida: "Prospecto decide: compra (→ Liga de Pago), necesita tiempo (→ Seguimiento), o descarta (→ Perdido).",
    tareas_obligatorias: [
      { id: "t5_1", nombre: "Registrar resultado de la videollamada", tipo: "manual", obligatoria: true,
        descripcion: "Registrar: opción elegida (A/B/C del EC0217.01), precio cotizado, objeción principal si la hay, y decisión inmediata del prospecto." },
      { id: "t5_2", nombre: "Aplicar Regla de Oro del Cierre", tipo: "manual", obligatoria: true,
        descripcion: "Antes de terminar la llamada: sondear con '¿esto te hace sentido?' y '¿cuál es el siguiente paso que te gustaría dar?'. No terminar la llamada sin intentar el cierre." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "Prospecto acepta la propuesta en la llamada → enviar liga de pago de inmediato.",
      regla_retroceso: "No aplica.",
      regla_espera: "Si necesita tiempo: pasar a Seguimiento Post-Diagnóstico con fecha de seguimiento agendada en el mismo momento de la llamada. No dejar la decisión abierta sin siguiente contacto programado.",
    },
  },
  {
    nombre: "En Seguimiento Post-Diagnóstico",
    orden: 6,
    fases_cagc: [7, 8],
    es_tronco: true,
    etapas_siguientes: ["Liga de Pago Enviada", "Videollamada de Diagnóstico Agendada", "Perdido / Sin Respuesta"],
    sla_dias: 5,
    rotting_dias: 7,
    criterios_entrada: "Prospecto no cerró en la videollamada; necesita tiempo para decidir.",
    criterios_salida: "Prospecto confirma la compra (→ Liga de Pago) o descarta definitivamente (→ Perdido).",
    tareas_obligatorias: [
      { id: "t6_1", nombre: "Primer seguimiento post-llamada (48 h)", tipo: "manual", obligatoria: true,
        descripcion: "Mensaje de seguimiento recordando los puntos clave de la propuesta y las garantías del servicio. Resolver cualquier objeción pendiente." },
      { id: "t6_2", nombre: "Segundo seguimiento (día 5 si no hubo respuesta)", tipo: "manual", obligatoria: false,
        descripcion: "Si no hay respuesta al primer seguimiento: un segundo intento. Si tampoco responde: mover a Perdido / Sin Respuesta." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "Prospecto confirma intención de compra → enviar liga de pago.",
      regla_retroceso: "Prospecto pide aclarar dudas → re-agendar videollamada de diagnóstico.",
      regla_espera: "Máximo 2 rondas de seguimiento (48 h y día 5). Sin respuesta después de ambas: mover a Perdido / Sin Respuesta.",
    },
  },
  {
    nombre: "Liga de Pago Enviada",
    orden: 7,
    fases_cagc: [9],
    es_tronco: true,
    etapas_siguientes: ["Pagado / Proceso Iniciado", "En Seguimiento Post-Diagnóstico", "Perdido / Sin Respuesta"],
    sla_dias: 2,
    rotting_dias: 3,
    criterios_entrada: "Prospecto confirmó intención de compra.",
    criterios_salida: "Pago confirmado (Stripe o comprobante de transferencia).",
    tareas_obligatorias: [
      { id: "t7_1", nombre: "Enviar liga o datos de pago", tipo: "manual", obligatoria: true,
        descripcion: "Enviar link de pago (Stripe) o datos de transferencia bancaria según preferencia del cliente. Incluir el desglose: precio del servicio + recordatorio de que la emisión del certificado se factura por separado conforme a normativa CONOCER." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "Pago confirmado.",
      regla_retroceso: "Nueva duda u objeción → regresar a En Seguimiento Post-Diagnóstico.",
      regla_espera: "Seguimiento a las 24 h si no hay confirmación. Máximo 3 días antes de evaluar si el prospecto desistió.",
    },
  },
  {
    nombre: "Pagado / Proceso Iniciado",
    orden: 8,
    fases_cagc: [10, 11],
    es_tronco: true,
    etapas_siguientes: [],
    sla_dias: 1,
    rotting_dias: 2,
    criterios_entrada: "Pago confirmado.",
    criterios_salida: "Etapa terminal. Cliente pasa al proceso de certificación EC0217.01.",
    tareas_obligatorias: [
      { id: "t8_1", nombre: "Confirmar pago y enviar bienvenida", tipo: "manual", obligatoria: true,
        descripcion: "Confirmar recepción del pago. Enviar mensaje de bienvenida al proceso de certificación EC0217.01 con los siguientes pasos." },
      { id: "t8_2", nombre: "Agendar primera sesión de alineación", tipo: "manual", obligatoria: true,
        descripcion: "Coordinar la primera sesión de alineación 1a1 con el evaluador asignado. Informar al cliente sobre la pre-evaluación interna como primer paso." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
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
    sla_dias: null,
    rotting_dias: null,
    criterios_entrada: "Sin respuesta tras múltiples seguimientos, descalificación por fit, o rechazo explícito en cualquier etapa.",
    criterios_salida: "Etapa terminal. Lead ingresa a secuencia de nurturing o lista de reactivación.",
    tareas_obligatorias: [
      { id: "t9_1", nombre: "Registrar motivo de pérdida", tipo: "manual", obligatoria: true,
        descripcion: "Seleccionar motivo: sin_respuesta / no_califica_inversion / no_califica_tiempo / no_califica_fit / eligio_competencia / no_le_interesa / otro." },
      { id: "t9_2", nombre: "Agregar a nurturing o reactivación según motivo", tipo: "manual", obligatoria: true,
        descripcion: "Si no_responde o eligio_competencia: lista de reactivación. Si no_califica_inversion o no_califica_tiempo: nurturing de largo plazo. Si no_califica_fit: no agregar a ninguna lista." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: [],
    protocolo: {
      regla_avance: "No aplica — etapa terminal.",
      regla_retroceso: "No aplica.",
      regla_espera: "No aplica.",
    },
  },
];

async function main() {
  console.log("Creando pipeline EC0217.01 · Certificación — Entrada en Frío...");
  const ruta = "ec0217_cert_frio_" + Date.now().toString(36);

  const { data: pipeline, error: pErr } = await sb
    .from("pipelines")
    .insert({
      ruta,
      nombre: "EC0217.01 · Certificación — Entrada en Frío",
      descripcion: "Pipeline consultivo para prospectos fríos interesados en certificarse en el EC0217.01. La calificación ocurre por WhatsApp con protocolo Setter; la venta se cierra en videollamada de diagnóstico con el asesor.",
      tipo: "tronco",
      servicio_id: null,
      fase_cagc_inicio: 0,
      fase_cagc_fin: 14,
      activo: true,
    })
    .select("id, ruta")
    .single();

  if (pErr) throw new Error("Pipeline: " + pErr.message);
  console.log("[OK] Pipeline creado — id:", pipeline.id, "| ruta:", pipeline.ruta);

  for (const etapa of ETAPAS) {
    const { canales, protocolo, ...etapaData } = etapa;

    const { data: e, error: eErr } = await sb
      .from("pipeline_etapas")
      .insert({ ...etapaData, ruta: pipeline.ruta, activo: true })
      .select("id")
      .single();

    if (eErr) throw new Error(`Etapa "${etapa.nombre}": ${eErr.message}`);
    console.log(`[OK] Etapa ${etapa.orden}: ${etapa.nombre} — id: ${e.id}`);

    if (canales.length) {
      const { error: cErr } = await sb
        .from("etapa_canales")
        .insert(canales.map((canal) => ({ etapa_id: e.id, canal, activo: true })));
      if (cErr) throw new Error(`Canales etapa ${etapa.orden}: ${cErr.message}`);
      console.log(`    canales: ${canales.join(", ")}`);
    }

    const { error: prErr } = await sb.from("etapa_protocolo").insert({
      etapa_id: e.id,
      tipo: "ia-propuesto",
      regla_avance:    protocolo.regla_avance,
      regla_retroceso: protocolo.regla_retroceso,
      regla_espera:    protocolo.regla_espera,
    });
    if (prErr) throw new Error(`Protocolo etapa ${etapa.orden}: ${prErr.message}`);
    console.log(`    protocolo: OK`);
  }

  console.log("\n✅ Pipeline creado completo.");
  console.log("   Ruta:", pipeline.ruta);
  console.log("   ID:", pipeline.id);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
