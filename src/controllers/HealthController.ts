import type { Request, Response } from "express";

import type { IHealthService } from "../services/interfaces/IHealthService.js";

export class HealthController {
  constructor(private readonly healthService: IHealthService) {}

  /** GET /health */
  check = async (_req: Request, res: Response): Promise<void> => {
    const health = await this.healthService.check();

    // 503 cuando la BD no responde: es lo que permite a Docker, a un balanceador o
    // a Kubernetes sacar la instancia de rotacion en lugar de seguir enviandole trafico.
    res.status(health.status === "ok" ? 200 : 503).json(health);
  };
}
