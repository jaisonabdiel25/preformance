import type { PublicUser, UserRow } from "../types/user.types.js";

/**
 * Convierte una fila de `users` en la proyeccion publica.
 *
 * Construye el objeto campo a campo en lugar de desestructurar y descartar
 * `password_hash`: si manana se anade una columna sensible a la tabla, no se filtra
 * sola por la respuesta.
 */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
  };
}
