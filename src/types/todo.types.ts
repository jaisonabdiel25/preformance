import type { Todo } from "../generated/prisma/client.js";

/**
 * Fila de `todos`, derivada del cliente que Prisma genera desde el esquema. No se
 * declara a mano por la misma razon que UserRow: anadir una columna la actualiza
 * sola, asi que el tipo no puede desincronizarse de la tabla.
 */
export type TodoRow = Todo;

/** Proyeccion publica de una tarea: lo unico que cruza la frontera HTTP. */
export interface PublicTodo {
  id: string;
  /** El dueno. Siempre coincide con el usuario del token que la pidio. */
  userId: string;
  title: string;
  /** null mientras no se haya escrito un detalle. */
  description: string | null;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}
