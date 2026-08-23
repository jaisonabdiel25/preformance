/**
 * Estos son `type` y no `interface` a proposito: `pool.query<T>()` exige que T sea
 * asignable a `QueryResultRow` (un tipo con index signature). Los alias de tipo
 * obtienen index signature implicita, las interfaces no, asi que con `interface`
 * el generico de `pg` no compila.
 */

/** Fila cruda de la tabla `users`, en snake_case tal cual la devuelve PostgreSQL. */
export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};

/** Fila cruda de la tabla `refresh_tokens`. */
export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

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
