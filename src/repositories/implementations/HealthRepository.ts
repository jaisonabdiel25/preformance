import type { AppPrismaClient } from "../../config/database.js";
import type { IHealthRepository } from "../interfaces/IHealthRepository.js";

/** Comprobacion de vida de PostgreSQL usada por GET /health. */
export class HealthRepository implements IHealthRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      // Devolver false en vez de propagar: un healthcheck informa del estado,
      // no convierte la caida de la BD en un 500 sin contexto.
      console.error("[health] la base de datos no responde:", error);
      return false;
    }
  }
}
