import type { Pool } from "pg";

import { ConflictError } from "../../errors/app-error.js";
import type { UserRow } from "../../types/user.types.js";
import type { CreateUserData, IUserRepository } from "../interfaces/IUserRepository.js";
import { isUniqueViolation } from "./pg-error.js";

/** Columnas explicitas en vez de `SELECT *`: un ALTER TABLE futuro no cambia la forma de UserRow. */
const COLUMNS = "id, email, password_hash, name, created_at, updated_at";

/**
 * Implementacion PostgreSQL de IUserRepository.
 *
 * Es el unico lugar del proyecto con SQL de usuarios. Todas las consultas van
 * parametrizadas ($1, $2...), nunca por interpolacion de cadenas.
 */
export class UserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE email = $1`,
      [email],
    );

    return rows[0] ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "SELECT 1 FROM users WHERE email = $1",
      [email],
    );

    return (rowCount ?? 0) > 0;
  }

  async create(data: CreateUserData): Promise<UserRow> {
    try {
      const { rows } = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING ${COLUMNS}`,
        [data.email, data.passwordHash, data.name],
      );

      const created = rows[0];
      if (!created) {
        throw new Error("El INSERT de usuario no devolvio ninguna fila");
      }

      return created;
    } catch (error) {
      // Red de seguridad ante la carrera entre existsByEmail() y este INSERT: dos
      // registros simultaneos con el mismo email pasan ambos la comprobacion previa
      // y solo la restriccion UNIQUE los separa. Se traduce aqui para que el
      // servicio no tenga que conocer codigos SQLSTATE.
      if (isUniqueViolation(error, "users_email_key")) {
        throw new ConflictError("Ya existe una cuenta registrada con ese email");
      }

      throw error;
    }
  }
}
