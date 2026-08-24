import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

/**
 * Datos de referencia del proyecto.
 *
 * Se ejecuta con `npm run db:seed`. En Prisma 7 las migraciones NO lo lanzan solas;
 * el unico comando que lo encadena es `prisma migrate reset`.
 *
 * Es idempotente: usa `upsert`, asi que correrlo dos veces no duplica ni pisa nada.
 */

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

/** ISO 3166-1 alpha-2. Anadir un pais aqui y volver a ejecutar el seed. */
const COUNTRIES = [
  { code: "PA", name: "Panama" },
  { code: "US", name: "Estados Unidos" },
  { code: "CO", name: "Colombia" },
] as const;

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    for (const role of ROLES) {
      await prisma.role.upsert({
        where: { code: role.code },
        update: { name: role.name, description: role.description },
        create: role,
      });
    }

    for (const country of COUNTRIES) {
      await prisma.country.upsert({
        where: { code: country.code },
        // `update` con el nombre: si se corrige una errata en la lista de arriba,
        // volver a sembrar la propaga en lugar de ignorarla.
        update: { name: country.name },
        create: country,
      });
    }

    const [roles, countries] = await Promise.all([
      prisma.role.count(),
      prisma.country.count(),
    ]);
    console.log(`[seed] roles: ${roles} | paises: ${countries}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[seed] fallo:", error);
  process.exit(1);
});
