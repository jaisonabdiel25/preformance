import type { PublicUser, UserRow } from "../types/user.types.js";

/**
 * Convierte una fila de `users` en la proyeccion publica.
 *
 * Construye el objeto campo a campo en lugar de reenviar la fila: si manana se anade
 * una columna sensible al esquema, Prisma la incluira en el modelo pero no se filtra
 * sola por la respuesta. Alguien tiene que venir aqui y escribirla.
 *
 * Acepta `UserRow` (sin `passwordHash`), asi que el hash ni siquiera es visible desde
 * esta funcion. Un `UserCredentialsRow` tambien encaja, y el resultado sigue sin
 * contenerlo.
 */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    // Se aplana igual que el pais, y se deja fuera `description`.
    role: { code: row.role.code, name: row.role.name },
    birthDate: row.birthDate,
    // Se aplana a { code, name }: el cliente no necesita la fila entera de countries.
    country: row.country ? { code: row.country.code, name: row.country.name } : null,
    createdAt: row.createdAt,
  };
}
