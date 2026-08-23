import type { UserRow } from "../../types/user.types.js";

export interface CreateUserData {
  /** Ya normalizado (trim + minusculas) por AuthService. */
  email: string;
  passwordHash: string;
  name: string;
}

/**
 * Contrato de persistencia de usuarios.
 *
 * AuthService depende de esta interfaz, nunca de `UserRepository`. Eso permite
 * sustituir PostgreSQL por otro motor —o por un doble en tests— sin tocar el
 * servicio.
 */
export interface IUserRepository {
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  existsByEmail(email: string): Promise<boolean>;
  /** Lanza ConflictError si el email ya esta registrado. */
  create(data: CreateUserData): Promise<UserRow>;
}
