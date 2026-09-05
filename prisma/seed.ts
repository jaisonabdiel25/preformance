import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedAdmin } from "./seeds/admin.js";
import { seedCountries } from "./seeds/countries.js";
import { seedRoles } from "./seeds/roles.js";

/**
 * Orquestador del seed: abre la conexion, encadena los sembradores de `seeds/` en el
 * orden correcto y la cierra. La logica de cada conjunto de datos vive en su propio
 * modulo, asi que anadir uno nuevo son dos lineas aqui y un archivo alla.
 *
 * Se ejecuta con `npm run db:seed`, y solo asi: en Prisma 7 ningun comando de
 * migracion lo lanza, `prisma migrate reset` incluido. El script `migrate:reset` del
 * package.json lo encadena de forma explicita por ese motivo.
 *
 * Es idempotente: los catalogos usan `upsert`, asi que correrlo dos veces no duplica
 * ni pisa nada. El administrador inicial es la excepcion matizada, ver `seeds/admin.ts`.
 *
 * El cliente se crea aqui a mano en vez de reutilizar `createDatabase`: esa fabrica
 * pide un `Env` completo, y `config/env.ts` exige JWT_ACCESS_SECRET y compania, que el
 * seed no usa y que no tienen por que existir al sembrar una base remota desde una
 * maquina de desarrollo.
 */
async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // El orden no es decorativo: `users.role_code` es clave foranea de `roles`, asi
    // que el administrador no puede sembrarse antes que su rol.
    const roles = await seedRoles(prisma);
    const countries = await seedCountries(prisma);
    const admin = await seedAdmin(prisma);

    console.log(`[seed] roles: ${roles} | paises: ${countries}`);
    console.log(`[seed] admin: ${admin}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[seed] fallo:", error);
  process.exit(1);
});
