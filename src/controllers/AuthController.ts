import type { Request, Response } from "express";

import { UnauthorizedError } from "../errors/app-error.js";
import type { IAuthService } from "../services/interfaces/IAuthService.js";
import type { AuthResult } from "../types/user.types.js";
import type {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from "../validators/schemas/auth.schemas.js";

/**
 * Capa HTTP de autenticacion: traduce peticiones a llamadas de servicio y
 * resultados a codigos de estado. No contiene logica de negocio.
 *
 * Depende de IAuthService, no de la clase: la capa HTTP solo conoce el contrato.
 *
 * Los metodos son propiedades flecha para conservar el `this` al pasarlos al router
 * como referencia (`controller.login`) sin necesidad de `.bind()`.
 *
 * No hay try/catch: Express 5 propaga automaticamente los rechazos de un handler
 * async al middleware de error.
 */
export class AuthController {
  constructor(private readonly authService: IAuthService) {}

  /** POST /api/v1/auth/register */
  register = async (req: Request, res: Response): Promise<void> => {
    // El middleware `validate` ya reemplazo req.body por el DTO parseado.
    const result = await this.authService.register(req.body as RegisterDto);
    res.status(201).json(AuthController.toAuthResponse(result));
  };

  /** POST /api/v1/auth/login */
  login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.authService.login(req.body as LoginDto);
    res.status(200).json(AuthController.toAuthResponse(result));
  };

  /** POST /api/v1/auth/refresh */
  refresh = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as RefreshTokenDto;
    const result = await this.authService.refresh(refreshToken);
    res.status(200).json(AuthController.toAuthResponse(result));
  };

  /** POST /api/v1/auth/logout */
  logout = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as RefreshTokenDto;
    await this.authService.logout(refreshToken);
    res.status(204).send();
  };

  /** GET /api/v1/auth/me (requiere AuthMiddleware) */
  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      // Inalcanzable si la ruta monta AuthMiddleware; esta aqui para que un
      // despiste al declarar la ruta falle con 401 y no con un TypeError.
      throw new UnauthorizedError();
    }

    const user = await this.authService.getProfile(req.user.id);
    res.status(200).json({ user });
  };

  /**
   * Aplana el resultado del servicio a la forma que se publica por HTTP.
   * El contrato de la API vive aqui, no en el servicio.
   */
  private static toAuthResponse(result: AuthResult) {
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
      tokenType: "Bearer",
    };
  }
}
