// Compara dos objetos planos y devuelve los campos que cambiaron.
// Ignora campos de auditoría internos (timestamps, versiones).
// Nunca lanza — si el diff falla, devuelve array vacío.

export interface CambioCampo {
  campo: string;
  anterior: unknown;
  nuevo: unknown;
}

const CAMPOS_INTERNOS: Record<string, true> = {
  updated_at: true,
  created_at: true,
  updatedAt: true,
  createdAt: true,
};

export function diffObjects(
  anterior: Record<string, unknown>,
  nuevo: Record<string, unknown>,
): CambioCampo[] {
  try {
    const cambios: CambioCampo[] = [];
    const vistos = new Set<string>();

    const procesar = (campo: string) => {
      if (vistos.has(campo) || CAMPOS_INTERNOS[campo]) return;
      vistos.add(campo);
      const valAnterior = anterior[campo];
      const valNuevo = nuevo[campo];
      if (JSON.stringify(valAnterior) !== JSON.stringify(valNuevo)) {
        cambios.push({ campo, anterior: valAnterior ?? null, nuevo: valNuevo ?? null });
      }
    };

    Object.keys(anterior).forEach(procesar);
    Object.keys(nuevo).forEach(procesar);
    return cambios;
  } catch {
    return [];
  }
}
