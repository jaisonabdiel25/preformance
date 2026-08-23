import type { RefreshTokenRow } from "../../types/user.types.js";

export interface CreateRefreshTokenData {
  userId: string;
  /** SHA-256 del token. El valor en claro nunca llega al repositorio. */
  tokenHash: string;
  expiresAt: Date;
}

/** Contrato de persistencia de refresh tokens. */
export interface IRefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<RefreshTokenRow>;
  /** Solo devuelve tokens sin revocar y sin caducar; en cualquier otro caso, null. */
  findActiveByHash(tokenHash: string): Promise<RefreshTokenRow | null>;
  revokeById(id: string): Promise<void>;
}
