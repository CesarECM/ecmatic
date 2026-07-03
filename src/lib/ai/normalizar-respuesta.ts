// Limpia la respuesta de Claude para compatibilidad con WhatsApp:
// convierte rayas em-dash en puntuación natural y markdown bold en formato WA.
export function normalizarRespuesta(texto: string): string {
  return texto
    .replace(/^[—–] /gm, "")           // viñeta con raya → quitar
    .replace(/ [—–]$/gm, ".")          // raya al final de oración → punto
    .replace(/ [—–] /g, ", ")          // raya entre frases → coma
    .replace(/[—–]/g, ", ")            // cualquier raya restante → coma
    .replace(/\*\*(.+?)\*\*/g, "*$1*"); // markdown bold → WhatsApp bold
}
