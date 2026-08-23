import { toPublicUser } from "../../dtos/user.dto.js";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../errors/app-error.js";
import type { IRefreshTokenRepository } from "../../repositories/interfaces/IRefreshTokenRepository.js";
import type { IUserRepository } from "../../repositories/interfaces/IUserRepository.js";
import type { AuthResult, PublicUser, TokenPair, UserRow } from "../../types/user.types.js";
import type { LoginDto, RegisterDto } from "../../validators/schemas/auth.schemas.js";
import type { IAuthService } from "../interfaces/IAuthService.js";
import type { IPasswordService } from "../interfaces/IPasswordService.js";
import type { ITokenService } from "../interfaces/ITokenService.js";

/**
 * Mensaje unico para todo fallo de login.
 *
 * Distinguir "ese email no existe" de "contrasena incorrecta" le regala a un
 * atacante un oraculo para enumerar cuentas registradas.
 */
const INVALID_CREDENTIALS = "Email o contrasena incorrectos";
const INVALID_REFRESH_TOKEN = "El refresh token no es valido, ha caducado o ya fue usado";

/**
 * Implementacion de los casos de uso de autenticacion.
 *
 * Todas sus dependencias entran por constructor tipadas como INTERFACES, nunca como
 * clases concretas: no conoce PostgreSQL, ni bcrypt, ni JWT. Tampoco conoce Express
 * —no recibe `req` ni `res`, ni decide codigos HTTP—, asi que es ejecutable desde un
 * test, un script o una cola sin montar un servidor.
 */
export class AuthService implements IAuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly passwordService: IPasswordService,
    private readonly tokenService: ITokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = AuthService.normalizeEmail(dto.email);

    // Comprobacion amable para devolver un 409 claro. La garantia real es la
    // restriccion UNIQUE, que UserRepository.create traduce si hay carrera.
    if (await this.userRepository.existsByEmail(email)) {
      throw new ConflictError("Ya existe una cuenta registrada con ese email");
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.userRepository.create({
      email,
      passwordHash,
      name: dto.name.trim(),
    });

    return {
      user: toPublicUser(user),
      tokens: await this.issueTokens(user),
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = AuthService.normalizeEmail(dto.email);
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      // Se gasta el mismo tiempo que costaria verificar una contrasena real antes
      // de fallar, para que el email inexistente no se delate por ser mas rapido.
      await this.passwordService.fakeCompare(dto.password);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const passwordMatches = await this.passwordService.compare(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    return {
      user: toPublicUser(user),
      tokens: await this.issueTokens(user),
    };
  }

  /**
   * Canjea un refresh token por un par nuevo, rotandolo.
   *
   * El token entregado queda revocado en el mismo flujo, asi que reutilizarlo
   * despues falla. Eso convierte un token robado en algo de un solo uso y hace
   * visible el robo: la victima o el atacante, quien llegue segundo, recibe un 401.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findActiveByHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedError(INVALID_REFRESH_TOKEN);
    }

    const user = await this.userRepository.findById(stored.user_id);
    if (!user) {
      // El ON DELETE CASCADE deberia impedirlo; si ocurre, se trata como token invalido.
      throw new UnauthorizedError(INVALID_REFRESH_TOKEN);
    }

    await this.refreshTokenRepository.revokeById(stored.id);

    return {
      user: toPublicUser(user),
      tokens: await this.issueTokens(user),
    };
  }

  /**
   * Cierra la sesion asociada a ese refresh token.
   *
   * Es idempotente y no falla con un token desconocido: responder distinto seria
   * confirmar si el token existia. El access token en curso sigue siendo valido
   * hasta que caduque, que es el precio de que sea autocontenido.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepository.findActiveByHash(tokenHash);

    if (stored) {
      await this.refreshTokenRepository.revokeById(stored.id);
    }
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      // Token con firma valida pero cuyo usuario ya no existe (cuenta eliminada).
      throw new NotFoundError("Usuario no encontrado");
    }

    return toPublicUser(user);
  }

  /** Emite el access token y persiste el hash del refresh token asociado. */
  private async issueTokens(user: UserRow): Promise<TokenPair> {
    const access = this.tokenService.issueAccessToken({ id: user.id, email: user.email });
    const refreshToken = this.tokenService.generateRefreshToken();

    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: this.tokenService.hashRefreshToken(refreshToken),
      expiresAt: this.tokenService.refreshTokenExpiryDate(),
    });

    return {
      accessToken: access.token,
      refreshToken,
      expiresIn: access.expiresInSeconds,
    };
  }

  /**
   * Los esquemas Zod ya normalizan el email, pero el servicio no puede darlo por
   * hecho: tambien se le llama desde seeds y tests que no pasan por HTTP.
   */
  private static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
