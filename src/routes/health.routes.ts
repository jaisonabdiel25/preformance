import { Router } from "express";

import type { HealthController } from "../controllers/HealthController.js";

/** Ruta de salud, montada fuera del prefijo versionado (/health). */
export function buildHealthRoutes(healthController: HealthController): Router {
  const router = Router();

  router.get("/", healthController.check);

  return router;
}
