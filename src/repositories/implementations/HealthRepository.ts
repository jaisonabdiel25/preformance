import type { Pool } from "pg";

import type { IHealthRepository } from "../interfaces/IHealthRepository.js";

/** Comprobacion de vida de PostgreSQL usada por GET /health. */
export class HealthRepository implements IHealthRepository {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch (error) {
      // Devolver false en vez de propagar: un healthcheck informa del estado,
      // no convierte la caida de la BD en un 500 sin contexto.
      console.error("[health] la base de datos no responde:", error);
      return false;
    }
  }
}
