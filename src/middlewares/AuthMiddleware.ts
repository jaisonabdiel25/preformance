import type { NextFunction, Request, RequestHandler, Response } from "express";

import { UnauthorizedError } from "../errors/app-error.js";
import type { ITokenService } from "../services/interfaces/ITokenService.js";

/**
 * Guard de rutas protegidas.
 *
 * Es una clase, y no una funcion suelta, porque necesita ITokenService inyectado:
 * asi el middleware se configura desde el contenedor igual que el resto del grafo y
 * se puede probar con un doble del servicio de tokens.
 */
export class AuthMiddleware {
  constructor(private readonly tokenService: ITokenService) {}

  /** Exige un access token valido y deja el usuario en `req.user`. */
  handle: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const token = AuthMiddleware.extractBearerToken(req.header("authorization"));
      const payload = this.tokenService.verifyAccessToken(token);

      req.user = { id: payload.sub, email: payload.email };
      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Variante permisiva: rellena `req.user` si hay un token valido, pero deja pasar
   * la peticion cuando no lo hay. Util para endpoints con respuesta enriquecida
   * para usuarios identificados.
   */
  optional: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (!header) {
      next();
      return;
    }

    try {
      const payload = this.tokenService.verifyAccessToken(
        AuthMiddleware.extractBearerToken(header),
      );
      req.user = { id: payload.sub, email: payload.email };
    } catch {
      // Un token invalido se ignora: este guard es opcional por definicion.
    }

    next();
  };

  private static extractBearerToken(header: string | undefined): string {
    if (!header) {
      throw new UnauthorizedError("Falta la cabecera Authorization");
    }

    const [scheme, token, ...rest] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
      throw new UnauthorizedError(
        "El formato esperado es 'Authorization: Bearer <token>'",
      );
    }

    return token;
  }
}
