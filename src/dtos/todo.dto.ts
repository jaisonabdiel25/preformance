import type { PublicTodo, TodoRow } from "../types/todo.types.js";

/**
 * Convierte una fila de `todos` en la proyeccion publica.
 *
 * Campo a campo y no `{ ...row }`, igual que toPublicUser: si manana la tabla gana
 * una columna interna, Prisma la incluira en el modelo pero no se filtrara sola por
 * la respuesta. Alguien tiene que venir aqui y escribirla.
 */
export function toPublicTodo(row: TodoRow): PublicTodo {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    completed: row.completed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
