// Seed inicial de servicios ECMatic — 24 registros
// Ejecutar: node scripts/seed/servicios-iniciales.js
"use strict";
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function embedding(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("OpenAI: " + JSON.stringify(d));
  return d.data[0].embedding;
}

const GARANTIAS = `Garantías del servicio: (1) Pre-evaluación interna antes de la evaluación oficial para verificar que el candidato está listo. (2) Segunda evaluación oficial sin costo si el dictamen no es favorable. (3) Devolución total del pago ante cualquier insatisfacción con el servicio.`;

const GARANTIAS_ALINEACION = `Garantías del servicio: (1) Pre-evaluación interna para verificar que el portafolio está completo y listo antes de la evaluación oficial. (2) Sesión adicional de refuerzo sin costo si el candidato no supera la evaluación oficial. (3) Devolución total del pago ante cualquier insatisfacción.`;

const ECS = [
  { codigo: "EC0076",    nivel: 2, nombre: "Evaluación de la Competencia de Candidatos",                                    evalPresencial: true  },
  { codigo: "EC0217.01", nivel: 3, nombre: "Impartición de Cursos de Formación del Capital Humano",                         evalPresencial: false },
  { codigo: "EC0249",    nivel: 5, nombre: "Consultoría General",                                                            evalPresencial: false },
  { codigo: "EC0301",    nivel: 3, nombre: "Diseño de Cursos de Formación del Capital Humano",                              evalPresencial: false },
  { codigo: "EC0305",    nivel: 2, nombre: "Prestación de Servicios de Atención a Clientes",                                evalPresencial: false },
  { codigo: "EC0366",    nivel: 3, nombre: "Desarrollo de Cursos de Formación en Línea",                                    evalPresencial: false },
  { codigo: "EC0581",    nivel: 2, nombre: "Comisiones Mixtas de Capacitación, Adiestramiento y Productividad",             evalPresencial: false },
];

function skusParaEC(ec, orden) {
  const { codigo, nivel, nombre, evalPresencial } = ec;
  const modalA   = evalPresencial ? "hibrido"     : "en_linea";
  const modalC   = evalPresencial ? "presencial"  : "en_linea";
  const notaA    = evalPresencial
    ? "La alineación se realiza en línea; la evaluación oficial se lleva a cabo de forma presencial."
    : "Servicio 100% en línea, sin grupos ni clases pregrabadas obligatorias.";

  return [
    {
      titulo: `${codigo} · ${nombre} — Alineación + Evaluación (1a1)`,
      contenido: `Proceso completo de certificación bajo el Estándar de Competencia ${codigo}. ${notaA} El precio se revela en la sesión de diagnóstico gratuita de 20 minutos. ${GARANTIAS}`,
      estandar_conocer: codigo,
      nivel_estandar: nivel,
      modalidad: modalA,
      conocer_habilitado: true,
      para_quien_es: `Personas que desean certificarse en ${codigo} y requieren acompañamiento personalizado en la alineación y la evaluación oficial.`,
      para_quien_no_es: `Candidatos que ya cuentan con portafolio de evidencias completo y solo necesitan la evaluación oficial.`,
      beneficios: `Certificado CONOCER oficial con validez nacional. Pre-evaluación interna incluida. Segunda evaluación sin costo si el dictamen no es favorable. Devolución total si hay insatisfacción.`,
      ventajas: `Proceso 1 a 1 con evaluador autorizado CONOCER. Sin grupos. Sin clases pregrabadas obligatorias. Diagnóstico previo gratuito.`,
      precio_centavos: null,
      precio_descuento_centavos: null,
      orden_catalogo: orden,
    },
    {
      titulo: `${codigo} · ${nombre} — Alineación (1a1)`,
      contenido: `Servicio de alineación personalizada 1 a 1 en modalidad en línea para el Estándar ${codigo}. Prepara al candidato con portafolio de evidencias estructurado conforme al estándar para presentar la evaluación oficial ante CONOCER. El precio se revela en la sesión de diagnóstico gratuita de 20 minutos. ${GARANTIAS_ALINEACION}`,
      estandar_conocer: codigo,
      nivel_estandar: nivel,
      modalidad: "en_linea",
      conocer_habilitado: true,
      para_quien_es: `Candidatos que desean preparar su portafolio de evidencias para ${codigo} con guía experta, y presentarán la evaluación oficial por separado.`,
      para_quien_no_es: `Personas que buscan el proceso completo de alineación y evaluación en un solo servicio.`,
      beneficios: `Portafolio de evidencias estructurado conforme al estándar CONOCER. Pre-evaluación interna incluida. Acompañamiento personalizado 1 a 1. Devolución total si hay insatisfacción.`,
      ventajas: `Proceso 1 a 1 en línea. Flexible en tiempos. Diagnóstico previo gratuito.`,
      precio_centavos: null,
      precio_descuento_centavos: null,
      orden_catalogo: orden + 1,
    },
    {
      titulo: `${codigo} · ${nombre} — Evaluación Independiente`,
      contenido: `Evaluación oficial de competencia bajo el Estándar ${codigo} para candidatos con experiencia demostrable o portafolio propio ya elaborado. La pre-evaluación interna de calidad aplica a todos los candidatos, independientemente de si la alineación fue con Centro ECM. ${evalPresencial ? "La evaluación se realiza de forma presencial." : ""} El precio se revela en la sesión de diagnóstico gratuita de 20 minutos. ${GARANTIAS}`,
      estandar_conocer: codigo,
      nivel_estandar: nivel,
      modalidad: modalC,
      conocer_habilitado: true,
      para_quien_es: `Profesionales con experiencia comprobable o portafolio de evidencias propio para ${codigo}, que solo necesitan la evaluación oficial CONOCER.`,
      para_quien_no_es: `Candidatos que no cuentan aún con evidencias de competencia o que requieren preparación previa.`,
      beneficios: `Pre-evaluación interna del portafolio antes de la evaluación oficial. Segunda evaluación sin costo si el dictamen no es favorable. Devolución total si hay insatisfacción.`,
      ventajas: `Evaluador autorizado CONOCER. Pre-evaluación de calidad incluida sin costo extra. Diagnóstico previo gratuito.`,
      precio_centavos: null,
      precio_descuento_centavos: null,
      orden_catalogo: orden + 2,
    },
  ];
}

function serviciosEspeciales() {
  return [
    {
      titulo: "EC0217.01 · SmartBuilderEC — Alineación Automatizada de Expediente",
      contenido: `Wizard automatizado que genera los 10 documentos del expediente para la certificación EC0217.01 en aproximadamente 40 minutos. Incluye acceso al wizard, curso en línea pregrabado y 5 expedientes de ejemplo. Capacidad: hasta 15 instructores por semana. Precio de lanzamiento: $1,799 MXN — precio y disponibilidad configurables. Si el candidato decide certificarse formalmente con Centro ECM en el EC0217.01, aplica un descuento de $1,799 MXN sobre ese proceso de evaluación.`,
      estandar_conocer: "EC0217.01",
      nivel_estandar: 3,
      modalidad: "en_linea",
      conocer_habilitado: true,
      para_quien_es: "Instructores y formadores que necesitan estructurar su expediente de evidencias para el EC0217.01 de forma rápida y guiada, sin depender de un asesor en tiempo real.",
      para_quien_no_es: "Candidatos que ya tienen su expediente completo o que prefieren acompañamiento personalizado 1 a 1.",
      beneficios: "Expediente listo en ~40 minutos. 5 expedientes de ejemplo incluidos. Curso en línea pregrabado de apoyo. Descuento de $1,799 MXN sobre la evaluación EC0217.01 con Centro ECM.",
      ventajas: "Automatizado. Sin cita previa. Acceso inmediato. Precio de lanzamiento.",
      precio_centavos: 179900,
      precio_descuento_centavos: null,
      orden_catalogo: 22,
    },
    {
      titulo: "Directorio Nacional CONOCER — Cuponera Fundadora",
      contenido: `Membresía en el Directorio Nacional CONOCER (directorioec.mx) mediante cupón de la Cuponera Fundadora. El cupón se asigna según el perfil del receptor: candidatos individuales certificados reciben cupón de Evaluador Independiente; centros de evaluación u organismos certificadores reciben cupón del tipo de actor correspondiente. Duración disponible: 1, 3, 6 o 12 meses, sujeto a cupo vigente. Verificar inventario en directorioec.mx antes de cada entrega.`,
      estandar_conocer: null,
      nivel_estandar: null,
      modalidad: "en_linea",
      conocer_habilitado: false,
      para_quien_es: "Evaluadores independientes certificados, centros de evaluación, organismos certificadores y entidades de certificación que desean visibilidad en el directorio nacional CONOCER.",
      para_quien_no_es: "Candidatos en proceso de certificación que aún no han obtenido su dictamen favorable.",
      beneficios: "Presencia en el Directorio Nacional CONOCER. Cupón personalizado por perfil de actor. Complemento al proceso de certificación sin costo adicional.",
      ventajas: "Cupón fundador con cupo limitado. Asignación inteligente por perfil del receptor.",
      precio_centavos: 0,
      precio_descuento_centavos: null,
      orden_catalogo: 23,
    },
    {
      titulo: "Sesión de Diagnóstico CONOCER (Gratuita)",
      contenido: `Sesión gratuita de 20 minutos con Tomás para conocer la situación del candidato, identificar el Estándar de Competencia CONOCER más adecuado para su perfil, resolver dudas sobre el proceso de certificación y revelar el precio personalizado del servicio. Sin costo, sin compromiso. Primer paso recomendado para cualquier proceso de certificación con Centro ECM.`,
      estandar_conocer: null,
      nivel_estandar: null,
      modalidad: "en_linea",
      conocer_habilitado: true,
      para_quien_es: "Cualquier persona interesada en certificarse ante CONOCER que quiere conocer su ruta más adecuada y el costo antes de comprometerse.",
      para_quien_no_es: "Candidatos que ya tienen claro su estándar objetivo y están listos para contratar el servicio.",
      beneficios: "Orientación personalizada sin costo. Identificación del EC más adecuado. Conocer el precio antes de decidir.",
      ventajas: "100% gratuita. Sin compromiso de compra. Agenda flexible en línea.",
      precio_centavos: 0,
      precio_descuento_centavos: null,
      orden_catalogo: 24,
    },
  ];
}

async function main() {
  const servicios = [];
  let orden = 1;
  for (const ec of ECS) {
    servicios.push(...skusParaEC(ec, orden));
    orden += 3;
    if (ec.codigo === "EC0217.01") orden++; // SmartBuilderEC ocupa el slot entre EC0217.01 y EC0249
  }
  servicios.push(...serviciosEspeciales());

  console.log(`Total servicios a insertar: ${servicios.length}`);

  for (let i = 0; i < servicios.length; i++) {
    const s = servicios[i];
    process.stdout.write(`[${i + 1}/${servicios.length}] Generando embedding: ${s.titulo.slice(0, 60)}...`);
    const emb = await embedding(`${s.titulo}\n${s.contenido}`);
    process.stdout.write(" ✓ Insertando...");

    const { data, error } = await sb
      .from("servicios")
      .insert({ ...s, embedding: emb, activo: true, aprobado: true, origen: "interno" })
      .select("id")
      .single();

    if (error) {
      console.log(` ✗ ERROR: ${error.message}`);
    } else {
      console.log(` ✓ id: ${data.id}`);
    }
  }

  console.log("\n✅ Seed de servicios completado.");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
