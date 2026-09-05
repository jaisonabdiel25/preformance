import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * Roles. Se insertan tambien en la migracion `roles_table`, porque un usuario no
 * puede existir sin rol y un despliegue recien migrado debe poder registrar gente
 * sin depender de que alguien lance el seed.
 *
 * Estan aqui ADEMAS para poder repararlos: si alguien borra o edita una fila, este
 * seed la restaura sin necesidad de un `migrate:reset`, que borraria la base entera.
 * Los codigos deben coincidir con `src/constants/roles.ts`, y el arranque de la API
 * lo verifica.
 */
const ROLES = [
  {
    code: "USER",
    name: "Usuario",
    description: "Acceso a sus propios datos. Rol por defecto al registrarse.",
  },
  {
    code: "ADMIN",
    name: "Administrador",
    description: "Acceso completo, incluida la gestion de otros usuarios.",
  },
] as const;

/** Deja el catalogo al dia y devuelve cuantos roles hay en la tabla. */
export async function seedRoles(prisma: PrismaClient): Promise<number> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  return prisma.role.count();
}
