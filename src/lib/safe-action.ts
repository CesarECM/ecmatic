"use server";

// Resultado tipado estándar para server actions.
// Uso: const result = await miAction(args)
//      if (result.error) toast.error(result.error)
//      else doSomething(result.data)
export type ActionResult<T = void> =
  | { data: T; error?: never }
  | { data?: never; error: string };

// Envuelve cualquier función async y convierte excepciones en { error: string }.
// Garantiza que las server actions nunca lancen al componente — los errores
// viajan como datos y el cliente decide cómo mostrarlos.
export function safeAction<TArgs extends unknown[], TOutput>(
  handler: (...args: TArgs) => Promise<TOutput>,
): (...args: TArgs) => Promise<ActionResult<TOutput>> {
  return async (...args: TArgs): Promise<ActionResult<TOutput>> => {
    try {
      const data = await handler(...args);
      return { data };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Error inesperado";
      console.error("[safe-action]", error);
      return { error };
    }
  };
}
