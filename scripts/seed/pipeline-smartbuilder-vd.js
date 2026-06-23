// Pipeline: SmartBuilderEC — Venta Directa WhatsApp
"use strict";
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── Definición de etapas ──────────────────────────────────────────────────────

const ETAPAS = [
  {
    nombre: "Prospecto Identificado",
    orden: 1,
    fases_cagc: [1, 2],
    es_tronco: true,
    etapas_siguientes: ["Primer Contacto Enviado", "Perdido / Sin Respuesta"],
    sla_dias: 1,
    rotting_dias: 2,
    criterios_entrada: "Contacto identificado como candidato para SmartBuilderEC: lead estancado en pipeline EC0217.01, base histórica fría, o contacto frío de outreach.",
    criterios_salida: "Mensaje de presentación de SmartBuilderEC enviado por WhatsApp y origen del contacto etiquetado.",
    tareas_obligatorias: [
      { id: "t1_1", nombre: "Etiquetar origen del contacto", tipo: "manual", obligatoria: true,
        descripcion: "Registrar si el prospecto viene de: downsell_ec0217 (estancado en pipeline EC0217.01), base_historica, o lista_fria. Necesario para medir conversión por segmento." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: [],
    protocolo: {
      regla_avance: "Origen etiquetado y mensaje de presentación enviado por WhatsApp.",
      regla_retroceso: "No aplica — etapa de entrada.",
      regla_espera: "No avanzar sin registrar el origen del contacto.",
    },
  },
  {
    nombre: "Primer Contacto Enviado",
    orden: 2,
    fases_cagc: [2, 3],
    es_tronco: true,
    etapas_siguientes: ["En Conversación", "Perdido / Sin Respuesta"],
    sla_dias: 3,
    rotting_dias: 4,
    criterios_entrada: "Mensaje de presentación de SmartBuilderEC enviado por WhatsApp.",
    criterios_salida: "Prospecto responde al mensaje.",
    tareas_obligatorias: [
      { id: "t2_1", nombre: "Enviar mensaje de presentación SmartBuilderEC", tipo: "manual", obligatoria: true,
        descripcion: "Presentar SmartBuilderEC como solución para generar el expediente EC0217.01 en ~40 min. Mencionar precio vigente de lanzamiento." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp"],
    protocolo: {
      regla_avance: "El prospecto responde al mensaje de presentación.",
      regla_retroceso: "No aplica.",
      regla_espera: "Esperar respuesta hasta 3 días. Al día 2: enviar seguimiento breve. Después de 2 seguimientos sin respuesta: mover a Perdido / Sin Respuesta.",
    },
  },
  {
    nombre: "En Conversación",
    orden: 3,
    fases_cagc: [3, 4, 5, 6],
    es_tronco: true,
    etapas_siguientes: ["Liga de Pago Enviada", "Perdido / Sin Respuesta"],
    sla_dias: 2,
    rotting_dias: 3,
    criterios_entrada: "Prospecto respondió; hay intercambio activo.",
    criterios_salida: "Prospecto interesado y precio vigente confirmado internamente antes de enviar liga.",
    tareas_obligatorias: [
      { id: "t3_1", nombre: "Confirmar precio vigente de SmartBuilderEC", tipo: "manual", obligatoria: true,
        descripcion: "Verificar el precio de lanzamiento vigente antes de cotizar. El precio ($1,799 MXN o el actual) y la fecha límite son variables — no asumir precio anterior." },
      { id: "t3_2", nombre: "Resolver objeciones y dudas", tipo: "manual", obligatoria: false,
        descripcion: "Resolver dudas sobre el wizard, el curso incluido, los expedientes de ejemplo y el proceso de certificación posterior." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "llamada"],
    protocolo: {
      regla_avance: "Prospecto expresa intención de compra. Precio vigente confirmado internamente.",
      regla_retroceso: "No aplica.",
      regla_espera: "Máximo 2 días sin respuesta antes de enviar seguimiento activo. Después de 2 intentos: evaluar mover a Perdido.",
    },
  },
  {
    nombre: "Liga de Pago Enviada",
    orden: 4,
    fases_cagc: [7, 8, 9],
    es_tronco: true,
    etapas_siguientes: ["Pagado / Acceso Entregado", "En Conversación", "Perdido / Sin Respuesta"],
    sla_dias: 2,
    rotting_dias: 3,
    criterios_entrada: "Prospecto listo para pagar. Precio vigente confirmado.",
    criterios_salida: "Pago confirmado (Stripe o comprobante de transferencia recibido).",
    tareas_obligatorias: [
      { id: "t4_1", nombre: "Enviar liga de pago con precio vigente", tipo: "manual", obligatoria: true,
        descripcion: "Enviar el link de pago activo. Confirmar que el precio en la liga corresponde al precio de lanzamiento vigente antes de enviarlo." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "Pago confirmado por notificación Stripe o comprobante de transferencia validado.",
      regla_retroceso: "Nueva objeción o duda del prospecto → regresar a En Conversación.",
      regla_espera: "Seguimiento a las 24 h si no hay confirmación. Máximo 3 seguimientos en 3 días antes de evaluar Perdido.",
    },
  },
  {
    nombre: "Pagado / Acceso Entregado",
    orden: 5,
    fases_cagc: [10, 11],
    es_tronco: true,
    etapas_siguientes: ["Ventana de Conversión Activa (30 días)"],
    sla_dias: 1,
    rotting_dias: 2,
    criterios_entrada: "Pago confirmado.",
    criterios_salida: "Credenciales del wizard entregadas y onboarding completado.",
    tareas_obligatorias: [
      { id: "t5_1", nombre: "Entregar credenciales de acceso al wizard", tipo: "manual", obligatoria: true,
        descripcion: "Enviar acceso al wizard SmartBuilderEC en máximo 24 h del pago confirmado." },
      { id: "t5_2", nombre: "Verificar capacidad de soporte semanal", tipo: "manual", obligatoria: true,
        descripcion: "Si el cupo de 15 instructores/semana está lleno: entregar acceso igual y agendar sesión de soporte 1a1 para la siguiente semana disponible. El acceso no se retrasa por capacidad." },
      { id: "t5_3", nombre: "Completar onboarding del wizard", tipo: "manual", obligatoria: true,
        descripcion: "Confirmar que el cliente accedió exitosamente al wizard, el curso y los expedientes de ejemplo." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "Credenciales entregadas y cliente confirmó acceso exitoso.",
      regla_retroceso: "No aplica.",
      regla_espera: "Resolver cualquier problema técnico de acceso antes de avanzar. Máximo 24 h.",
    },
  },
  {
    nombre: "Ventana de Conversión Activa (30 días)",
    orden: 6,
    fases_cagc: [12, 13],
    es_tronco: true,
    etapas_siguientes: ["Convertido a Certificación Completa", "Ventana Cerrada / No Convertido"],
    sla_dias: 30,
    rotting_dias: 10,
    criterios_entrada: "Acceso al wizard entregado. Inicia ventana de 30 días.",
    criterios_salida: "El cliente compra la certificación EC0217.01 completa con Centro ECM (→ Convertido) O vencen los 30 días sin conversión (→ Ventana Cerrada).",
    tareas_obligatorias: [
      { id: "t6_1", nombre: "Seguimiento día 7 — oferta de certificación", tipo: "manual", obligatoria: true,
        descripcion: "Presentar la opción de certificación EC0217.01 completa con Centro ECM recordando que el pago de SmartBuilderEC se abona íntegramente al costo de la evaluación." },
      { id: "t6_2", nombre: "Seguimiento día 15 — verificar avance en el wizard", tipo: "manual", obligatoria: true,
        descripcion: "Confirmar que el cliente está usando el wizard. Resolver dudas. Reforzar oferta de certificación." },
      { id: "t6_3", nombre: "Seguimiento día 25 — último recordatorio de ventana", tipo: "manual", obligatoria: true,
        descripcion: "Recordar que la ventana de abono cierra en 5 días. Invitar a agendar la sesión diagnóstico para la certificación." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [
      {
        tipo: "auto_avance_temporal",
        dias_en_etapa: 30,
        etapa_destino: "Ventana Cerrada / No Convertido",
        descripcion: "Si pasan 30 días desde la entrada a esta etapa sin que el lead pase a Convertido, avanzar automáticamente a Ventana Cerrada / No Convertido."
      }
    ],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "Cliente adquiere el proceso de certificación EC0217.01 completo con Centro ECM dentro de los 30 días.",
      regla_retroceso: "No aplica.",
      regla_espera: "Seguimiento estructurado en días 7, 15 y 25. Al día 30 sin conversión: avance automático a Ventana Cerrada.",
    },
  },
  {
    nombre: "Convertido a Certificación Completa",
    orden: 7,
    fases_cagc: [14, 15],
    es_tronco: true,
    etapas_siguientes: [],
    sla_dias: null,
    rotting_dias: null,
    criterios_entrada: "Cliente compró la certificación EC0217.01 completa con Centro ECM dentro de los 30 días.",
    criterios_salida: "Etapa terminal. Registro vinculado al pipeline de certificación EC0217.01.",
    tareas_obligatorias: [
      { id: "t7_1", nombre: "Aplicar descuento en cotización de Tomás", tipo: "manual", obligatoria: true,
        descripcion: "El pago de SmartBuilderEC ($1,799 MXN o el monto pagado) se descuenta del precio de la evaluación EC0217.01. No cotizar desde cero. No crear un nuevo lead — usar el mismo registro." },
      { id: "t7_2", nombre: "Vincular al pipeline de certificación EC0217.01", tipo: "manual", obligatoria: true,
        descripcion: "Mover el lead al pipeline correspondiente del EC0217.01 preservando todo el historial. Nunca duplicar el contacto." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["whatsapp", "email"],
    protocolo: {
      regla_avance: "No aplica — etapa terminal.",
      regla_retroceso: "No aplica.",
      regla_espera: "No aplica.",
    },
  },
  {
    nombre: "Ventana Cerrada / No Convertido",
    orden: 8,
    fases_cagc: [12, 13],
    es_tronco: true,
    etapas_siguientes: [],
    sla_dias: null,
    rotting_dias: null,
    criterios_entrada: "30 días transcurridos sin que el lead adquiera la certificación completa.",
    criterios_salida: "Etapa terminal. Lead ingresa a secuencia de nurturing.",
    tareas_obligatorias: [
      { id: "t8_1", nombre: "Ingresar a secuencia de nurturing", tipo: "manual", obligatoria: true,
        descripcion: "Agregar el lead a la secuencia de nurturing para retención a largo plazo y futura oferta de certificación EC0217.01." }
    ],
    plantillas_mensaje: [],
    condiciones_workflow: [],
    canales: ["email"],
    protocolo: {
      regla_avance: "No aplica — etapa terminal.",
      regla_retroceso: "No aplica.",
      regla_espera: "Ingresar a nurturing antes de cerrar seguimiento activo.",
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
    criterios_entrada: "Sin respuesta tras múltiples seguimientos, o descalificación explícita antes del pago.",
    criterios_salida: "Etapa terminal. Lead ingresa a lista de reactivación.",
    tareas_obligatorias: [
      { id: "t9_1", nombre: "Ingresar a lista de reactivación", tipo: "manual", obligatoria: true,
        descripcion: "Registrar motivo de pérdida y agregar a lista de reactivación para outreach futuro." }
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

// ── Script principal ──────────────────────────────────────────────────────────

async function main() {
  // 1. Crear pipeline
  console.log("Creando pipeline...");
  const ruta = "smartbuilder_vd_wa_" + Date.now().toString(36);
  const { data: pipeline, error: pErr } = await sb
    .from("pipelines")
    .insert({
      ruta,
      nombre: "SmartBuilderEC — Venta Directa WhatsApp",
      descripcion: "Pipeline de venta directa por WhatsApp para el wizard SmartBuilderEC (EC0217.01). Dirige prospectos fríos, base histórica y leads estancados del pipeline EC0217.01 hacia la compra del expediente automatizado a precio de entrada.",
      tipo: "tronco",
      servicio_id: null,
      fase_cagc_inicio: 1,
      fase_cagc_fin: 15,
      activo: true,
    })
    .select("id, ruta")
    .single();

  if (pErr) throw new Error("Pipeline: " + pErr.message);
  console.log("[OK] Pipeline creado — id:", pipeline.id, "| ruta:", pipeline.ruta);

  // 2. Insertar etapas + canales + protocolo
  for (const etapa of ETAPAS) {
    const { canales, protocolo, ...etapaData } = etapa;

    const { data: e, error: eErr } = await sb
      .from("pipeline_etapas")
      .insert({ ...etapaData, ruta: pipeline.ruta, activo: true })
      .select("id")
      .single();

    if (eErr) throw new Error(`Etapa "${etapa.nombre}": ${eErr.message}`);
    console.log(`[OK] Etapa ${etapa.orden}: ${etapa.nombre} — id: ${e.id}`);

    // Canales
    if (canales.length) {
      const { error: cErr } = await sb
        .from("etapa_canales")
        .insert(canales.map((canal) => ({ etapa_id: e.id, canal, activo: true })));
      if (cErr) throw new Error(`Canales etapa ${etapa.orden}: ${cErr.message}`);
      console.log(`    canales: ${canales.join(", ")}`);
    }

    // Protocolo
    const { error: prErr } = await sb.from("etapa_protocolo").insert({
      etapa_id: e.id,
      tipo: "ia-propuesto",
      regla_avance: protocolo.regla_avance,
      regla_retroceso: protocolo.regla_retroceso,
      regla_espera: protocolo.regla_espera,
    });
    if (prErr) throw new Error(`Protocolo etapa ${etapa.orden}: ${prErr.message}`);
    console.log(`    protocolo: OK`);
  }

  console.log("\n✅ Pipeline SmartBuilderEC — Venta Directa WhatsApp creado completo.");
  console.log("   Ruta:", pipeline.ruta);
  console.log("   ID:", pipeline.id);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
