import { createHash, randomBytes } from "node:crypto";

import jwt from "jsonwebtoken";

import { UnauthorizedError } from "../../errors/app-error.js";
import type {
  AccessTokenPayload,
  ITokenService,
  IssuedAccessToken,
} from "../interfaces/ITokenService.js";

/** Configuracion propia de esta implementacion; no forma parte del contrato. */
export interface TokenServiceConfig {
  accessSecret: string;
  /** Formato aceptado por jsonwebtoken: "15m", "1h", o segundos como numero. */
  accessExpiresIn: string;
  issuer: string;
  refreshTtlDays: number;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Implementacion JWT + token opaco de ITokenService.
 *
 * Dos tipos de credencial con roles distintos:
 *  - access token: JWT firmado, corto, autocontenido. No se guarda en BD; su unica
 *    forma de invalidarse es caducar, por eso vive 15 minutos.
 *  - refresh token: cadena aleatoria opaca (no un JWT), larga, cuyo hash SI se
 *    persiste. Al estar en BD puede revocarse de inmediato.
 */
export class TokenService implements ITokenService {
  constructor(private readonly config: TokenServiceConfig) {}

  issueAccessToken(user: { id: string; email: string }): IssuedAccessToken {
    const options = {
      subject: user.id,
      issuer: this.config.issuer,
      expiresIn: this.config.accessExpiresIn,
      algorithm: "HS256",
    } as jwt.SignOptions;

    const token = jwt.sign({ email: user.email }, this.config.accessSecret, options);

    // Se derivan los segundos del propio token en lugar de reinterpretar "15m":
    // asi el `expiresIn` que ve el cliente no puede desviarse de la caducidad real.
    const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
    const expiresInSeconds =
      decoded?.exp !== undefined && decoded?.iat !== undefined ? decoded.exp - decoded.iat : 0;

    return { token, expiresInSeconds };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    let payload: string | jwt.JwtPayload;

    try {
      // `algorithms` es obligatorio: sin restringirlo, un atacante podria presentar
      // un token con alg "none" o forzar una confusion de algoritmo.
      payload = jwt.verify(token, this.config.accessSecret, {
        issuer: this.config.issuer,
        algorithms: ["HS256"],
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError("El token de acceso ha expirado");
      }
      throw new UnauthorizedError("Token de acceso invalido");
    }

    if (typeof payload === "string" || !payload.sub || typeof payload["email"] !== "string") {
      throw new UnauthorizedError("Token de acceso invalido");
    }

    return { sub: payload.sub, email: payload["email"] };
  }

  /** Token opaco de 96 caracteres hex. No lleva informacion, solo sirve de clave de busqueda. */
  generateRefreshToken(): string {
    return randomBytes(48).toString("hex");
  }

  /**
   * SHA-256 del refresh token, que es lo unico que se guarda.
   *
   * Basta un hash rapido (no bcrypt) porque el token ya es un valor aleatorio de
   * 384 bits: no hay nada que adivinar por fuerza bruta ni diccionario que aplicar.
   */
  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  refreshTokenExpiryDate(from: Date = new Date()): Date {
    return new Date(from.getTime() + this.config.refreshTtlDays * MILLISECONDS_PER_DAY);
  }
}
