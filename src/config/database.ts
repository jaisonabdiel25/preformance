import pg from "pg";

import type { Env } from "./env.js";

const { Pool } = pg;

/**
 * Crea el pool de conexiones. Es la unica pieza de infraestructura que reciben los
 * repositorios: nadie mas en la aplicacion importa `pg`.
 */
export function createPool(env: Env): pg.Pool {
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

  return pool;
}
