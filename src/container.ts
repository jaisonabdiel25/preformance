import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";

import { createDatabase, type AppPrismaClient } from "./config/database.js";
import { env as defaultEnv, type Env } from "./config/env.js";
import { AuthController } from "./controllers/AuthController.js";
import { CountryController } from "./controllers/CountryController.js";
import { HealthController } from "./controllers/HealthController.js";
import { AuthMiddleware } from "./middlewares/AuthMiddleware.js";
import { CountryRepository } from "./repositories/implementations/CountryRepository.js";
import { HealthRepository } from "./repositories/implementations/HealthRepository.js";
import { RefreshTokenRepository } from "./repositories/implementations/RefreshTokenRepository.js";
import { RoleRepository } from "./repositories/implementations/RoleRepository.js";
import { UserRepository } from "./repositories/implementations/UserRepository.js";
import { AuthService } from "./services/implementations/AuthService.js";
import { CountryService } from "./services/implementations/CountryService.js";
import { HealthService } from "./services/implementations/HealthService.js";
import { PasswordService } from "./services/implementations/PasswordService.js";
import { RoleService } from "./services/implementations/RoleService.js";
import { TokenService } from "./services/implementations/TokenService.js";
import type { IRoleService } from "./services/interfaces/IRoleService.js";
import { AuthValidator } from "./validators/AuthValidator.js";

/** Piezas que la capa HTTP necesita del contenedor. */
export interface Container {
  env: Env;
  prisma: AppPrismaClient;
  authController: AuthController;
  authValidator: AuthValidator;
  authMiddleware: AuthMiddleware;
  /** Cupo estricto para /register y /login. */
  authRateLimiter: RequestHandler;
  /** Cupo holgado para /refresh, que los clientes llaman de forma rutinaria. */
  refreshRateLimiter: RequestHandler;
  countryController: CountryController;
  healthController: HealthController;
  /**
   * Comprobacion de integridad del catalogo de roles. La ejecuta `server.ts` antes
   * de aceptar trafico; no la consume ninguna ruta.
   */
  roleService: IRoleService;
  /** Desconecta Prisma y cierra el pool. Lo llama el apagado ordenado del servidor. */
  shutdown(): Promise<void>;
}

/**
 * COMPOSITION ROOT.
 *
 * El unico archivo del proyecto donde se ejecuta `new`. El grafo se construye de
 * abajo arriba (infraestructura -> repositorios -> servicios -> HTTP) y cada pieza
 * recibe sus dependencias por constructor.
 *
 * Este es tambien el unico punto donde interfaz e implementacion se encuentran: en
 * el resto del codigo las clases solo se conocen por su contrato (IUserRepository,
 * ITokenService, IAuthService...). Por eso sustituir una implementacion se reduce a
 * cambiar una linea aqui.
 */
export function buildContainer(env: Env = defaultEnv): Container {
  // --- Infraestructura ------------------------------------------------------
  const { prisma, pool } = createDatabase(env);

  // --- Repositorios: implementan I*Repository, unica capa que conoce Prisma --
  const userRepository = new UserRepository(prisma);
  const refreshTokenRepository = new RefreshTokenRepository(prisma);
  const countryRepository = new CountryRepository(prisma);
  const roleRepository = new RoleRepository(prisma);
  const healthRepository = new HealthRepository(prisma);

  // --- Servicios: implementan I*Service, sin dependencias de HTTP -----------
  const passwordService = new PasswordService(env.BCRYPT_ROUNDS);
  const tokenService = new TokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  });

  // AuthService declara sus cuatro dependencias como interfaces, asi que aunque
  // aqui reciba las clases concretas, dentro no tiene forma de usar nada que no
  // este en el contrato.
  const authService = new AuthService(
    userRepository,
    refreshTokenRepository,
    passwordService,
    tokenService,
  );
  const countryService = new CountryService(countryRepository);
  const roleService = new RoleService(roleRepository);
  const healthService = new HealthService(healthRepository);

  // --- Capa HTTP ------------------------------------------------------------
  const authController = new AuthController(authService);
  const countryController = new CountryController(countryService);
  const healthController = new HealthController(healthService);
  const authValidator = new AuthValidator();
  const authMiddleware = new AuthMiddleware(tokenService);

  const windowMs = env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  const tooManyRequests = {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Demasiados intentos. Vuelve a probar en unos minutos.",
    },
  };

  // Dos limitadores con cupos independientes. Compartir uno solo haria que los
  // intentos de login fallidos consumieran el presupuesto de renovacion de tokens
  // y echaran de la sesion a usuarios legitimos que no han hecho nada raro.
  const authRateLimiter = rateLimit({
    windowMs,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: tooManyRequests,
  });

  const refreshRateLimiter = rateLimit({
    windowMs,
    limit: env.REFRESH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: tooManyRequests,
  });

  return {
    env,
    prisma,
    authController,
    authValidator,
    authMiddleware,
    authRateLimiter,
    refreshRateLimiter,
    countryController,
    healthController,
    roleService,
    shutdown: async () => {
      // El orden importa: Prisma primero, para que suelte las conexiones que tenga
      // tomadas del pool antes de que este las cierre.
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
