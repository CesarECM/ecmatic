// Genera el bloque de instrucciones de cierre cuando el producto ya fue revelado al lead.
// Sin llamada a IA — lógica determinista basada en modo_venta y señales del historial.

export interface DatosPrecioServicio {
  titulo: string;
  precio_centavos: number | null;
  precio_descuento_centavos: number | null;
  precio_apartado_centavos: number | null;
  modo_venta: "directo" | "meet";
}

export interface LinkPago {
  tipo: string;
  url: string;
  nombre: string;
}

const fmt = (c: number) => `$${(c / 100).toLocaleString("es-MX")} MXN`;

const SEÑALES_PRECIO_BAJO = /no tengo|es caro|muy caro|poco presupuesto|no puedo pagar|no me alcanza|no cuento con|sin dinero/i;

export function generarBloqueEstrategiaPrecio(
  svc: DatosPrecioServicio,
  links: LinkPago[],
  historial: string
): string {
  const restriccionPresupuesto = SEÑALES_PRECIO_BAJO.test(historial);
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
    }
    if (svc.precio_apartado_centavos) {
      const montoApartado = fmt(svc.precio_apartado_centavos);
      if (linkApartado) {
        lineas.push(`Si duda por el precio: ofrece apartar su lugar con solo ${montoApartado} → ${linkApartado.url}`);
      } else {
        lineas.push(`Si duda por el precio: ofrece apartar su lugar con solo ${montoApartado} (coordinar con el equipo)`);
      }
    }
    lineas.push(`OBJETIVO EN ESTE TURNO: Cerrar la venta. Si no → ofrecer apartado. Si tampoco → agendar videollamada.`);
    lineas.push(`Termina con: "¿Te comparto el link para inscribirte?" o "¿Apartamos tu lugar con ${svc.precio_apartado_centavos ? fmt(svc.precio_apartado_centavos) : 'un adelanto'}?"`);
  } else {
    lineas.push(`Modo: VIDEOLLAMADA CON ASESOR. No reveles el precio completo por mensaje; invita a una sesión de diagnóstico donde el equipo lo explica todo.`);
    if (svc.precio_apartado_centavos) {
      const montoApartado = fmt(svc.precio_apartado_centavos);
      if (linkApartado) {
        lineas.push(`Si el lead quiere comprometerse antes de la videollamada: puede apartar con ${montoApartado} → ${linkApartado.url}`);
      } else {
        lineas.push(`Si el lead quiere comprometerse antes de la videollamada: puede apartar con ${montoApartado}`);
      }
    }
    lineas.push(`OBJETIVO EN ESTE TURNO: Que el lead confirme una videollamada HOY. Si no agenda → ofrecer apartado. Termina con "¿Cuándo tienes 30 minutos disponibles esta semana?"`);
  }

  return lineas.join("\n");
}
