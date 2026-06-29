// Genera el bloque de instrucciones de cierre cuando el producto ya fue revelado al lead.
// Sin llamada a IA — lógica determinista basada en modo_venta y señales del historial.

export interface DatosPrecioServicio {
  titulo: string;
  precio_centavos: number | null;
  precio_descuento_centavos: number | null;
  precio_apartado_centavos: number | null;
  modo_venta: "directo" | "meet";
  url_landing_propia?: string | null;
}

export interface LinkPago {
  tipo: string;
  url: string;
  nombre: string;
}

const fmt = (c: number) => `$${(c / 100).toLocaleString("es-MX")} MXN`;

const SEÑALES_PRECIO_BAJO = /no tengo|es caro|muy caro|poco presupuesto|no puedo pagar|no me alcanza|no cuento con|sin dinero/i;
const SEÑALES_RESISTENCIA_AGENDA = /no puedo|no tengo tiempo|muy ocupado|no me da tiempo|no sé cuándo|después|luego|ya veré|ahorita no|cuando pueda/i;

export function generarBloqueEstrategiaPrecio(
  svc: DatosPrecioServicio,
  links: LinkPago[],
  historial: string
): string {
  const restriccionPresupuesto = SEÑALES_PRECIO_BAJO.test(historial);
  const resistenciaAgenda      = SEÑALES_RESISTENCIA_AGENDA.test(historial);
  const precioEfectivo = svc.precio_descuento_centavos ?? svc.precio_centavos;
  const linkPago = links.find((l) => l.tipo === "pasarela" || l.tipo === "landing");
  const linkApartado = links.find((l) => l.tipo === "apartado");

  const lineas: string[] = ["\nESTRATEGIA DE CIERRE — SIGUE ESTE PROTOCOLO (PRIORIDAD MÁXIMA):"];

  // Precio
  if (precioEfectivo) {
    if (svc.precio_descuento_centavos && svc.precio_centavos && svc.precio_descuento_centavos < svc.precio_centavos) {
      const ahorro = Math.round((1 - svc.precio_descuento_centavos / svc.precio_centavos) * 100);
      lineas.push(`Precio actual: ${fmt(svc.precio_descuento_centavos)} (precio normal ${fmt(svc.precio_centavos)}, ${ahorro}% de descuento — menciona el ahorro si el lead duda)`);
    } else {
      lineas.push(`Precio: ${fmt(precioEfectivo)}`);
    }
  }

  if (restriccionPresupuesto && precioEfectivo) {
    lineas.push(`El lead ha expresado una restricción de presupuesto. Presenta el valor primero antes de dar el precio. Si persiste la resistencia y hay opciones más accesibles en el catálogo, puedes mencionarlas.`);
  }

  if (svc.modo_venta === "directo") {
    if (linkPago) {
      lineas.push(`Modo: VENTA DIRECTA. Cuando el lead muestre intención, comparte este link: ${linkPago.url}`);
    } else {
      // Sin link configurado: salida elegante hacia agenda
      lineas.push(`Modo: VENTA DIRECTA — sin link de pago activo. Informa al lead que los montos y el enlace de inscripción se comparten únicamente en la sesión con el equipo.`);
      lineas.push(`OBJETIVO EN ESTE TURNO: Agendar esa sesión. Termina con: "¿Cuándo tienes 30 minutos disponibles esta semana?"`);
    }
    if (svc.precio_apartado_centavos) {
      const montoApartado = fmt(svc.precio_apartado_centavos);
      if (linkApartado) {
        lineas.push(`${linkPago ? "Si duda por el precio" : "Alternativa antes de la sesión"}: aparta su lugar con solo ${montoApartado} → ${linkApartado.url}`);
      } else {
        lineas.push(`Si duda por el precio: ofrece apartar su lugar con solo ${montoApartado} (coordinar con el equipo)`);
      }
    }
    if (linkPago) {
      lineas.push(`OBJETIVO EN ESTE TURNO: Cerrar la venta. Si no → ofrecer apartado. Si tampoco → agendar videollamada.`);
      lineas.push(`Termina con: "¿Te comparto el link para inscribirte?" o "¿Apartamos tu lugar con ${svc.precio_apartado_centavos ? fmt(svc.precio_apartado_centavos) : "un adelanto"}?"`);
    }
  } else {
    lineas.push(`Modo: VIDEOLLAMADA CON ASESOR.`);
    lineas.push(`- Responde con naturalidad TODAS las preguntas (precio, estándar, duración, entregables, requisitos). No ocultes información.`);
    lineas.push(`- NO presiones la venta directa. En la sesión con su asesor asignado el lead podrá cerrar el trato si así lo decide.`);
    const linkParaMeet = linkPago ?? (svc.url_landing_propia ? { url: svc.url_landing_propia } : null);

    if (resistenciaAgenda && (linkParaMeet || (svc.precio_apartado_centavos && linkApartado))) {
      // Pivot proactivo: lead no puede/quiere agendar → ofrecer alternativa de pago inmediato
      lineas.push(`El lead muestra resistencia para agendar. Ofrece de forma natural una alternativa para no perder el momentum:`);
      if (linkParaMeet) lineas.push(`  → Inscripción directa sin esperar sesión: ${linkParaMeet.url}`);
      if (svc.precio_apartado_centavos && linkApartado) {
        lineas.push(`  → O aparta su lugar desde aquí con ${fmt(svc.precio_apartado_centavos)}: ${linkApartado.url}`);
      } else if (svc.precio_apartado_centavos) {
        lineas.push(`  → O aparta su lugar con ${fmt(svc.precio_apartado_centavos)} (coordinar con el equipo)`);
      }
      lineas.push(`Usa algo como: "Entiendo que estás muy ocupado — también puedes inscribirte directamente desde aquí y nuestro equipo se adapta a tu ritmo."`);
    } else {
      lineas.push(`- SOLO comparte el link de pago si el lead EXPLÍCITAMENTE: (a) dice que quiere pagar antes de la sesión, (b) menciona querer agilizar, o (c) indica que no puede agendar pronto.`);
      if (linkParaMeet) {
        lineas.push(`  → Link para esos casos: ${linkParaMeet.url}`);
      }
      if (svc.precio_apartado_centavos && linkApartado) {
        lineas.push(`  → Alternativa: apartar lugar con ${fmt(svc.precio_apartado_centavos)} → ${linkApartado.url}`);
      } else if (svc.precio_apartado_centavos) {
        lineas.push(`  → Alternativa: apartar lugar con ${fmt(svc.precio_apartado_centavos)} (coordinar con el equipo)`);
      }
      lineas.push(`- En cualquier otro caso, termina con: "¿Cuándo tienes 30 minutos disponibles esta semana para una videollamada con nuestro equipo?"`);
    }
  }

  return lineas.join("\n");
}
