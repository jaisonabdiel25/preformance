import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../generated/prisma/client.js";
import type { Env } from "./env.js";

const { Pool } = pg;

/**
 * Instancia el cliente. Existe como funcion aparte para poder derivar de ella el
 * tipo `AppPrismaClient`: el `omit` global estrecha los tipos de retorno del cliente,
 * asi que `PrismaClient` a secas ya no describe esta instancia.
 */
function instantiatePrisma(pool: pg.Pool) {
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    // `omit` global: passwordHash no sale de la base de datos salvo que una consulta
    // lo pida explicitamente. Prisma devuelve el modelo entero por defecto, asi que
    // sin esto el hash viajaria en cada findUnique aunque nadie lo necesite.
    // Lo desactiva un unico sitio: UserRepository.findCredentialsByEmail.
    omit: {
      user: { passwordHash: true },
    },
  });
}

/** El cliente ya configurado. Es el tipo que reciben los repositorios por constructor. */
export type AppPrismaClient = ReturnType<typeof instantiatePrisma>;

export interface Database {
  prisma: AppPrismaClient;
  /** El pool subyacente. Se expone solo para poder cerrarlo en el apagado ordenado. */
  pool: pg.Pool;
}

/**
 * Crea el cliente de Prisma sobre un pool de `pg`.
 *
 * En Prisma 7 el adaptador de driver es OBLIGATORIO: `new PrismaClient()` sin
 * argumentos lanza, y `datasourceUrl` ya no existe. La contrapartida buena es que
 * el pool sigue siendo nuestro, asi que conservamos el control fino sobre tamano y
 * timeouts en lugar de heredar los valores por defecto de Prisma.
 */
export function createDatabase(env: Env): Database {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Sin este listener, un corte de red en un cliente ocioso emite un 'error' sin
  // manejador y Node tumba el proceso entero.
  pool.on("error", (error) => {
    console.error("[db] error inesperado en un cliente ocioso del pool:", error);
  });

  return { prisma: instantiatePrisma(pool), pool };
}
