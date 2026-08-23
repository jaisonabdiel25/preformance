import type { AuthResult, PublicUser } from "../../types/user.types.js";
import type { LoginDto, RegisterDto } from "../../validators/schemas/auth.schemas.js";

/**
 * Contrato de los casos de uso de autenticacion.
 *
 * AuthController depende de esta interfaz, no de la clase: la capa HTTP solo conoce
 * que operaciones existen y que devuelven, nunca como se resuelven.
 */
export interface IAuthService {
  /** Alta de usuario. Lanza ConflictError si el email ya existe. */
  register(dto: RegisterDto): Promise<AuthResult>;

  /** Lanza UnauthorizedError con un mensaje generico ante cualquier fallo. */
  login(dto: LoginDto): Promise<AuthResult>;

  /** Canjea el refresh token por un par nuevo y revoca el entregado (rotacion). */
  refresh(refreshToken: string): Promise<AuthResult>;

  /** Idempotente: no falla si el token es desconocido o ya estaba revocado. */
  logout(refreshToken: string): Promise<void>;

  getProfile(userId: string): Promise<PublicUser>;
}
