import { Router } from "express";

import type { Container } from "../container.js";
import { buildAuthRoutes } from "./auth.routes.js";
import { buildCountryRoutes } from "./country.routes.js";

/**
 * Router raiz de la API versionada (/api/v1).
 *
 * Para anadir un modulo nuevo basta con registrar aqui su router:
 *   router.use("/products", buildProductRoutes({ ... }));
 */
export function buildApiRoutes(container: Container): Router {
  const router = Router();

  router.use(
    "/auth",
    buildAuthRoutes({
      authController: container.authController,
      authValidator: container.authValidator,
      authMiddleware: container.authMiddleware,
      authRateLimiter: container.authRateLimiter,
      refreshRateLimiter: container.refreshRateLimiter,
    }),
  );

  router.use("/countries", buildCountryRoutes(container.countryController));

  return router;
}
