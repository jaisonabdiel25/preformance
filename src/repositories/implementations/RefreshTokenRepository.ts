import type { Pool } from "pg";

import type { RefreshTokenRow } from "../../types/user.types.js";
import type {
  CreateRefreshTokenData,
  IRefreshTokenRepository,
} from "../interfaces/IRefreshTokenRepository.js";

const COLUMNS = "id, user_id, token_hash, expires_at, revoked_at, created_at";

/** Implementacion PostgreSQL de IRefreshTokenRepository. */
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: CreateRefreshTokenData): Promise<RefreshTokenRow> {
    const { rows } = await this.pool.query<RefreshTokenRow>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [data.userId, data.tokenHash, data.expiresAt],
    );

    const created = rows[0];
    if (!created) {
      throw new Error("El INSERT de refresh token no devolvio ninguna fila");
    }

    return created;
  }

  async findActiveByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    // La caducidad se evalua con el reloj de PostgreSQL, no con el de Node: asi no
    // depende de que ambos relojes esten sincronizados.
    const { rows } = await this.pool.query<RefreshTokenRow>(
      `SELECT ${COLUMNS}
         FROM refresh_tokens
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()`,
      [tokenHash],
    );

    return rows[0] ?? null;
  }

  async revokeById(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens
          SET revoked_at = now()
        WHERE id = $1
          AND revoked_at IS NULL`,
      [id],
    );
  }

}
