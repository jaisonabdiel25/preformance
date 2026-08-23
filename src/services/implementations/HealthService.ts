import type { IHealthRepository } from "../../repositories/interfaces/IHealthRepository.js";
import type { HealthStatus, IHealthService } from "../interfaces/IHealthService.js";

/** Estado de la API y de sus dependencias. Lo consume GET /health. */
export class HealthService implements IHealthService {
  constructor(private readonly healthRepository: IHealthRepository) {}

  async check(): Promise<HealthStatus> {
    const databaseUp = await this.healthRepository.ping();

    return {
      status: databaseUp ? "ok" : "degraded",
      database: databaseUp ? "up" : "down",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
