import type { RefreshToken, User } from "../generated/prisma/client.js";

/**
 * Los tipos de fila ya NO se escriben a mano: se derivan del cliente que Prisma
 * genera desde `prisma/schema.prisma`. Anadir una columna en el esquema los actualiza
 * solo, asi que no pueden desincronizarse de la tabla.
 */

/**
 * Un usuario tal y como sale de la base de datos en el caso normal: SIN el hash de
 * la contrasena, porque el cliente lleva `omit: { user: { passwordHash: true } }`
 * configurado globalmente en `config/database.ts`.
 */
export type UserRow = Omit<User, "passwordHash">;

/**
 * Usuario CON el hash de la contrasena. Solo lo produce
 * `IUserRepository.findCredentialsByEmail`, que desactiva el omit a proposito.
 * Este tipo no debe salir nunca de AuthService.
 */
export type UserCredentialsRow = User;

/** Fila de `refresh_tokens`. */
export type RefreshTokenRow = RefreshToken;

/** Proyeccion segura de un usuario: es lo unico que puede cruzar la frontera HTTP. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Segundos de vida restantes del access token, para que el cliente sepa cuando renovar. */
  expiresIn: number;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}
