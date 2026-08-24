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
    for (const country of COUNTRIES) {
      await prisma.country.upsert({
        where: { code: country.code },
        // `update` con el nombre: si se corrige una errata en la lista de arriba,
        // volver a sembrar la propaga en lugar de ignorarla.
        update: { name: country.name },
        create: country,
      });
    }

    const total = await prisma.country.count();
    console.log(`[seed] paises sembrados: ${COUNTRIES.length} (total en BD: ${total})`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[seed] fallo:", error);
  process.exit(1);
});
