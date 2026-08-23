export interface AccessTokenPayload {
  /** Id del usuario (claim estandar `sub`). */
  sub: string;
  email: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

/**
 * Contrato de emision y verificacion de credenciales.
 *
 * Describe dos tipos de token con roles distintos:
 *  - access token: firmado, corto y autocontenido;
 *  - refresh token: cadena opaca cuyo hash se persiste, y por tanto revocable.
 *
 * La interfaz no menciona JWT ni SHA-256: son decisiones de la implementacion, y
 * cambiarlas no debe obligar a tocar AuthService ni AuthMiddleware.
 */
export interface ITokenService {
  issueAccessToken(user: { id: string; email: string }): IssuedAccessToken;
  /** Devuelve el payload verificado o lanza UnauthorizedError. */
  verifyAccessToken(token: string): AccessTokenPayload;
  generateRefreshToken(): string;
  hashRefreshToken(token: string): string;
  refreshTokenExpiryDate(from?: Date): Date;
}
