import { Router, type RequestHandler } from "express";

import type { AuthController } from "../controllers/AuthController.js";
import type { AuthMiddleware } from "../middlewares/AuthMiddleware.js";
import { validate } from "../middlewares/ValidateMiddleware.js";
import type { AuthValidator } from "../validators/AuthValidator.js";

export interface AuthRoutesDeps {
  authController: AuthController;
  authValidator: AuthValidator;
  authMiddleware: AuthMiddleware;
  authRateLimiter: RequestHandler;
  refreshRateLimiter: RequestHandler;
}

/**
 * Rutas de /api/v1/auth.
 *
 * Recibe sus dependencias por parametro en vez de importarlas: el modulo no
 * instancia nada, todo el cableado ocurre en el contenedor.
 */
export function buildAuthRoutes(deps: AuthRoutesDeps): Router {
  const { authController, authValidator, authMiddleware, authRateLimiter, refreshRateLimiter } =
    deps;
  const router = Router();

  // El rate limiter va PRIMERO: si se pusiera detras del validador, un atacante
  // podria seguir consumiendo CPU de validacion en cada intento.
  router.post(
    "/register",
    authRateLimiter,
    validate(authValidator.register),
    authController.register,
  );

  router.post(
    "/login",
    authRateLimiter,
    validate(authValidator.login),
    authController.login,
  );

  // Cupo propio: renovar el token es una operacion rutinaria de un cliente ya
  // autenticado, no un intento de adivinar credenciales.
  router.post(
    "/refresh",
    refreshRateLimiter,
    validate(authValidator.refreshToken),
    authController.refresh,
  );

  // Sin rate limit: cerrar sesion es una accion deseable y limitarla solo
  // conseguiria dejar sesiones abiertas.
  router.post("/logout", validate(authValidator.refreshToken), authController.logout);

  router.get("/me", authMiddleware.handle, authController.me);

  return router;
}
