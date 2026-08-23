-- Up Migration

CREATE TABLE refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- SHA-256 en hexadecimal (64 caracteres) del token opaco. El valor en claro
  -- solo existe en la respuesta HTTP: si alguien lee esta tabla no puede
  -- reconstruir ningun token utilizable.
  token_hash VARCHAR(64) NOT NULL,

  expires_at TIMESTAMPTZ NOT NULL,
  -- NULL mientras el token sigue vivo. Lo rellenan la rotacion (/refresh) y /logout.
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

-- Para revocar de golpe todas las sesiones de un usuario.
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

-- Soporta la limpieza periodica de tokens caducados sin recorrer la tabla entera.
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;

-- Down Migration

DROP TABLE IF EXISTS refresh_tokens;
