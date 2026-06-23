// Pipelines: Seguimiento Post-Venta para los 7 ECs
"use strict";
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ECS = [
  { codigo: "EC0076", nombre: "Evaluación de la Competencia de Candidatos",                        evalPresencial: true  },
  { codigo: "EC0217.01", nombre: "Impartición de Cursos de Formación del Capital Humano",          evalPresencial: false },
  { codigo: "EC0249", nombre: "Consultoría General",                                                evalPresencial: false },
  { codigo: "EC0301", nombre: "Diseño de Cursos de Formación del Capital Humano",                  evalPresencial: false },
  { codigo: "EC0305", nombre: "Prestación de Servicios de Atención a Clientes",                    evalPresencial: false },
  { codigo: "EC0366", nombre: "Desarrollo de Cursos de Formación en Línea",                        evalPresencial: false },
  { codigo: "EC0581", nombre: "Comisiones Mixtas de Capacitación, Adiestramiento y Productividad", evalPresencial: false },
];

function buildEtapas(ec) {
  const { codigo, nombre, evalPresencial } = ec;
  const modalEval   = evalPresencial ? "PRESENCIAL" : "en línea";
  const notaPresencial = evalPresencial
    ? ` La evaluación oficial del ${codigo} es ESTRICTAMENTE PRESENCIAL — confirmar lugar y logística con anticipación.`
    : "";

  return [
    {
      nombre: "Onboarding Completado",
      orden: 1,
      fases_cagc: [10, 11],
      es_tronco: true,
      etapas_siguientes: ["En Alineación", "Devolución / Insatisfacción"],
      sla_dias: 1, rotting_dias: 2,
      criterios_entrada: `Pago confirmado del servicio ${codigo}. Mensaje de bienvenida enviado.`,
      criterios_salida: "Primera sesión de alineación agendada y cliente con acceso a los materiales del proceso.",
      tareas_obligatorias: [
        { id: "t1_1", nombre: "Registrar opción de servicio contratada", tipo: "manual", obligatoria: true,
          descripcion: `Anotar qué opción compró el cliente: A (Alineación + Evaluación), B (Solo Alineación) o C (Evaluación Independiente). Esto determina las etapas que aplican.` },
        { id: "t1_2", nombre: "Agendar primera sesión de alineación", tipo: "manual", obligatoria: true,
          descripcion: "Coordinar con el evaluador asignado. Si es Opción C (Evaluación Independiente), agendar directamente la Pre-evaluación Interna (etapa 3)." },
        { id: "t1_3", nombre: "Enviar bienvenida y resumen del proceso", tipo: "manual", obligatoria: true,
          descripcion: `Explicar los pasos del proceso ${codigo}, las 3 garantías, y recordar que la emisión del certificado se factura por separado conforme a normativa CONOCER.` },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Primera sesión agendada y cliente informado del proceso completo.",
        regla_retroceso: "No aplica — etapa de entrada post-pago.",
        regla_espera: "Contacto de onboarding en máximo 24 h del pago confirmado. Si es Opción C: saltar a etapa 3.",
      },
    },
    {
      nombre: "En Alineación",
      orden: 2,
      fases_cagc: [11, 12],
      es_tronco: true,
      etapas_siguientes: ["Pre-evaluación Interna Realizada", "Devolución / Insatisfacción"],
      sla_dias: 60, rotting_dias: 14,
      criterios_entrada: "Proceso de alineación iniciado. Aplica a Opciones A y B.",
      criterios_salida: "Portafolio de evidencias completo y validado internamente, listo para Pre-evaluación Interna. Para Opción B: portafolio entregado al cliente (etapa terminal para esta opción).",
      tareas_obligatorias: [
        { id: "t2_1", nombre: "Seguimiento quincenal de avance", tipo: "manual", obligatoria: true,
          descripcion: "Verificar avance en la construcción del portafolio de evidencias cada 15 días. Resolver dudas y ajustar ritmo si es necesario." },
        { id: "t2_2", nombre: "Notificar entrega de portafolio (Opción B)", tipo: "manual", obligatoria: false,
          descripcion: "Si el cliente contrató Solo Alineación (Opción B): al entregar el portafolio completo, cerrar esta etapa como completada. El cliente gestiona la evaluación oficial por su cuenta." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email", "meet"],
      protocolo: {
        regla_avance: "Portafolio de evidencias completo y listo para la Pre-evaluación Interna.",
        regla_retroceso: "No aplica.",
        regla_espera: "Seguimiento cada 14 días. Si el cliente no avanza: identificar bloqueo y proponer solución. Rotting a los 14 días sin actividad.",
      },
    },
    {
      nombre: "Pre-evaluación Interna Realizada",
      orden: 3,
      fases_cagc: [12, 13],
      es_tronco: true,
      etapas_siguientes: ["Evaluación Oficial Agendada", "En Alineación", "Devolución / Insatisfacción"],
      sla_dias: 7, rotting_dias: 5,
      criterios_entrada: "Portafolio listo para revisión interna. Aplica a Opciones A y C.",
      criterios_salida: "Pre-evaluación interna aprobada: portafolio validado y candidato autorizado para presentar evaluación oficial.",
      tareas_obligatorias: [
        { id: "t3_1", nombre: "Realizar pre-evaluación interna del portafolio", tipo: "manual", obligatoria: true,
          descripcion: `Evaluación interna de calidad (garantía a). Aplica a TODOS los candidatos, incluida Opción C con portafolio propio. Verificar que el portafolio cumple los criterios del ${codigo} antes de presentar la evaluación oficial.` },
        { id: "t3_2", nombre: "Retroalimentar y corregir si es necesario", tipo: "manual", obligatoria: false,
          descripcion: "Si el portafolio tiene observaciones: regresar a En Alineación para corregir. No agendar evaluación oficial con portafolio incompleto." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email", "meet"],
      protocolo: {
        regla_avance: "Pre-evaluación interna aprobada: portafolio apto para evaluación oficial.",
        regla_retroceso: "Portafolio con observaciones → regresar a En Alineación para correcciones.",
        regla_espera: "Completar la pre-evaluación en máximo 7 días desde que el portafolio esté listo.",
      },
    },
    {
      nombre: "Evaluación Oficial Agendada",
      orden: 4,
      fases_cagc: [12, 13],
      es_tronco: true,
      etapas_siguientes: ["Evaluación Oficial Realizada", "Devolución / Insatisfacción"],
      sla_dias: 30, rotting_dias: 14,
      criterios_entrada: `Pre-evaluación interna aprobada. Fecha de evaluación oficial con CONOCER programada.${notaPresencial}`,
      criterios_salida: "Evaluación oficial realizada.",
      tareas_obligatorias: [
        { id: "t4_1", nombre: `Agendar evaluación oficial ${modalEval}`, tipo: "manual", obligatoria: true,
          descripcion: `Coordinar fecha y horario de la evaluación oficial ante CONOCER en modalidad ${modalEval}.${notaPresencial}` },
        { id: "t4_2", nombre: "Enviar recordatorio y preparación final", tipo: "manual", obligatoria: true,
          descripcion: "Recordatorio 48 h antes. Confirmar que el candidato tiene todo listo: portafolio, identificación y cualquier requisito logístico de la evaluación." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Evaluación oficial completada.",
        regla_retroceso: "No aplica.",
        regla_espera: "Agendar evaluación en máximo 30 días desde aprobación de pre-evaluación. CONOCER puede tener tiempos de espera — gestionar con anticipación.",
      },
    },
    {
      nombre: "Evaluación Oficial Realizada",
      orden: 5,
      fases_cagc: [13],
      es_tronco: true,
      etapas_siguientes: ["Dictamen Favorable — Certificado en Trámite", "Segunda Evaluación Agendada", "Devolución / Insatisfacción"],
      sla_dias: 3, rotting_dias: 3,
      criterios_entrada: "Evaluación oficial ante CONOCER completada.",
      criterios_salida: "Dictamen recibido: Competente (→ etapa 6) o Aún No Competente (→ etapa 8).",
      tareas_obligatorias: [
        { id: "t5_1", nombre: "Registrar resultado del dictamen CONOCER", tipo: "manual", obligatoria: true,
          descripcion: "Registrar: Competente o Aún No Competente. Si es ANC: activar garantía b de inmediato (segunda evaluación sin costo). Si el cliente expresa insatisfacción grave: ofrecer garantía c (devolución)." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Dictamen Competente → iniciar trámite de certificado. Dictamen ANC → agendar segunda evaluación sin costo.",
        regla_retroceso: "No aplica.",
        regla_espera: "Contactar al cliente en máximo 24 h de recibir el dictamen para comunicar el resultado y el siguiente paso.",
      },
    },
    {
      nombre: "Dictamen Favorable — Certificado en Trámite",
      orden: 6,
      fases_cagc: [13, 14],
      es_tronco: true,
      etapas_siguientes: ["Certificado Emitido", "Devolución / Insatisfacción"],
      sla_dias: 60, rotting_dias: 20,
      criterios_entrada: "Dictamen Competente recibido de CONOCER.",
      criterios_salida: "Certificado oficial CONOCER emitido y entregado al candidato.",
      tareas_obligatorias: [
        { id: "t6_1", nombre: "Informar al cliente sobre el costo de emisión del certificado", tipo: "manual", obligatoria: true,
          descripcion: "La emisión del certificado oficial CONOCER se factura por separado conforme a normativa vigente. Comunicar el monto exacto antes de iniciar el trámite y confirmar que el cliente está de acuerdo." },
        { id: "t6_2", nombre: "Iniciar trámite de emisión ante CONOCER", tipo: "manual", obligatoria: true,
          descripcion: "Gestionar los documentos y el pago de emisión con CONOCER. El plazo puede ser de hasta 60 días hábiles." },
        { id: "t6_3", nombre: "Seguimiento quincenal del trámite", tipo: "manual", obligatoria: true,
          descripcion: "Verificar avance del trámite con CONOCER cada 15 días. Mantener informado al cliente." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Certificado oficial emitido y entregado al candidato.",
        regla_retroceso: "No aplica.",
        regla_espera: "CONOCER puede tardar hasta 60 días. Rotting a los 20 días sin actualización del trámite.",
      },
    },
    {
      nombre: "Certificado Emitido",
      orden: 7,
      fases_cagc: [14, 15, 16],
      es_tronco: true,
      etapas_siguientes: [],
      sla_dias: null, rotting_dias: null,
      criterios_entrada: "Certificado oficial CONOCER entregado al candidato.",
      criterios_salida: "Etapa terminal — proceso completado exitosamente.",
      tareas_obligatorias: [
        { id: "t7_1", nombre: "Felicitar al cliente y solicitar testimonio", tipo: "manual", obligatoria: true,
          descripcion: "Mensaje de felicitación por la certificación. Invitar a dejar un testimonio o reseña. Preguntar si tiene colegas o contactos que pudieran certificarse." },
        { id: "t7_2", nombre: "Ofrecer Cuponera Fundadora del Directorio CONOCER", tipo: "manual", obligatoria: false,
          descripcion: "Ofrecer cupón del Directorio Nacional CONOCER según el perfil del candidato certificado: Evaluador Independiente si es candidato individual, o cupón por tipo de actor si es organización." },
        { id: "t7_3", nombre: "Evaluar cross-sell a otro EC", tipo: "manual", obligatoria: false,
          descripcion: `Cliente certificado en ${codigo}: evaluar si tiene perfil para certificarse en otro estándar complementario. Agregar a nurturing de cross-sell si aplica.` },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "No aplica — etapa terminal.",
        regla_retroceso: "No aplica.",
        regla_espera: "No aplica.",
      },
    },
    {
      nombre: "Segunda Evaluación Agendada",
      orden: 8,
      fases_cagc: [12, 13],
      es_tronco: true,
      etapas_siguientes: ["Segunda Evaluación Realizada", "Devolución / Insatisfacción"],
      sla_dias: 30, rotting_dias: 14,
      criterios_entrada: `Dictamen Aún No Competente recibido. Garantía b activada: segunda evaluación sin costo.${notaPresencial}`,
      criterios_salida: "Segunda evaluación oficial realizada.",
      tareas_obligatorias: [
        { id: "t8_1", nombre: "Comunicar garantía b al cliente", tipo: "manual", obligatoria: true,
          descripcion: "Informar al cliente que tiene derecho a una segunda evaluación sin costo adicional (garantía b del servicio). Reforzar el acompañamiento." },
        { id: "t8_2", nombre: "Sesión de retroalimentación pre-segunda evaluación", tipo: "manual", obligatoria: true,
          descripcion: "Revisar con el cliente los puntos del portafolio donde no fue competente y reforzarlos antes de la segunda evaluación." },
        { id: "t8_3", nombre: `Agendar segunda evaluación oficial ${modalEval}`, tipo: "manual", obligatoria: true,
          descripcion: `Coordinar la segunda evaluación ante CONOCER en modalidad ${modalEval}.${notaPresencial} Esta segunda evaluación no tiene costo adicional para el cliente.` },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Segunda evaluación completada.",
        regla_retroceso: "No aplica.",
        regla_espera: "Agendar segunda evaluación en máximo 30 días del dictamen ANC. Reforzar preparación antes de reagendar.",
      },
    },
    {
      nombre: "Segunda Evaluación Realizada",
      orden: 9,
      fases_cagc: [13, 14],
      es_tronco: true,
      etapas_siguientes: ["Dictamen Favorable — Certificado en Trámite", "Devolución / Insatisfacción"],
      sla_dias: 3, rotting_dias: 3,
      criterios_entrada: "Segunda evaluación oficial completada.",
      criterios_salida: "Dictamen recibido: Competente (→ etapa 6) o insatisfacción (→ etapa 10).",
      tareas_obligatorias: [
        { id: "t9_1", nombre: "Registrar resultado del segundo dictamen", tipo: "manual", obligatoria: true,
          descripcion: "Si es Competente: iniciar trámite de certificado (etapa 6). Si es ANC en la segunda evaluación: evaluar caso con el cliente — la garantía b ya fue usada. Si el cliente solicita devolución: activar garantía c (etapa 10)." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "Dictamen Competente → etapa 6 (Certificado en Trámite).",
        regla_retroceso: "No aplica.",
        regla_espera: "Contactar al cliente en máximo 24 h del segundo dictamen.",
      },
    },
    {
      nombre: "Devolución / Insatisfacción",
      orden: 10,
      fases_cagc: [0],
      es_tronco: true,
      etapas_siguientes: [],
      sla_dias: null, rotting_dias: null,
      criterios_entrada: "Cliente solicita devolución total del pago (garantía c) en cualquier etapa del proceso, o insatisfacción grave tras segunda evaluación ANC.",
      criterios_salida: "Etapa terminal. Devolución procesada.",
      tareas_obligatorias: [
        { id: "t10_1", nombre: "Registrar motivo de insatisfacción", tipo: "manual", obligatoria: true,
          descripcion: "Documentar el motivo: tiempo_proceso / calidad_alineacion / resultado_evaluacion / expectativa_no_cumplida / otro. Insumo para mejora del servicio." },
        { id: "t10_2", nombre: "Procesar devolución total", tipo: "manual", obligatoria: true,
          descripcion: "Garantía c: devolución total del monto pagado por el servicio (no incluye el costo de emisión del certificado si ya fue pagado a CONOCER por normativa). Procesar en máximo 5 días hábiles." },
      ],
      plantillas_mensaje: [], condiciones_workflow: [], canales: ["whatsapp", "email"],
      protocolo: {
        regla_avance: "No aplica — etapa terminal.",
        regla_retroceso: "No aplica.",
        regla_espera: "Procesar la devolución con la máxima prioridad. No dejar al cliente esperando respuesta.",
      },
    },
  ];
}

async function crearPipeline(ec) {
  const { codigo, nombre, evalPresencial } = ec;
  const notaDesc = evalPresencial
    ? ` La evaluación oficial es PRESENCIAL para este EC.`
    : "";
  const slug = codigo.toLowerCase().replace(".", "");
  const ruta = `${slug}_post_venta_${Date.now().toString(36)}`;

  const { data: pipeline, error: pErr } = await sb
    .from("pipelines")
    .insert({
      ruta,
      nombre: `${codigo} · ${nombre} — Seguimiento Post-Venta`,
      descripcion: `Seguimiento completo del proceso de certificación ${codigo} tras el pago. Cubre alineación, pre-evaluación interna (garantía a), evaluación oficial, gestión del certificado y garantías b y c.${notaDesc}`,
      tipo: "tronco",
      servicio_id: null,
      fase_cagc_inicio: 10,
      fase_cagc_fin: 16,
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
  console.log(`Creando ${ECS.length} pipelines post-venta...\n`);
  const resultados = [];

  for (const ec of ECS) {
    const p = await crearPipeline(ec);
    resultados.push({ ec: ec.codigo, id: p.id, ruta: p.ruta });
  }

  console.log("\n✅ Todos los pipelines post-venta creados:");
  resultados.forEach(r => console.log(`   ${r.ec.padEnd(10)} | ${r.ruta}`));
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
