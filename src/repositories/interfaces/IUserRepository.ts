import type { UserCredentialsRow, UserRow } from "../../types/user.types.js";

export interface CreateUserData {
  /** Ya normalizado (trim + minusculas) por AuthService. */
  email: string;
  passwordHash: string;
  name: string;
  /** Opcional: se puede completar despues del alta. */
  birthDate?: Date | undefined;
  /**
   * Codigo ISO 3166-1 alpha-2 en mayusculas. Debe existir en `countries`; si no,
   * la implementacion lanza ValidationError sobre este campo.
   *
   * `role` NO esta aqui a proposito: lo fija el @default(USER) del esquema, de modo
   * que ningun camino de creacion de usuarios puede asignar un rol.
   */
  countryCode?: string | undefined;
}

/**
 * Contrato de persistencia de usuarios.
 *
 * AuthService depende de esta interfaz, nunca de `UserRepository`. Eso permite
 * sustituir Prisma por otra cosa —o por un doble en tests— sin tocar el servicio.
 */
export interface IUserRepository {
  /** Sin el hash de la contrasena. */
  findById(id: string): Promise<UserRow | null>;

  /**
   * Devuelve el usuario INCLUYENDO su `passwordHash`, desactivando el omit global.
   *
   * Se llama asi, y no `findByEmail`, para que quede a la vista de cualquiera que
   * lea o audite el codigo: es el unico camino por el que el hash sale de la base de
   * datos, y existe solo para que AuthService.login pueda compararlo.
   */
  findCredentialsByEmail(email: string): Promise<UserCredentialsRow | null>;

  existsByEmail(email: string): Promise<boolean>;

  /** Lanza ConflictError si el email ya esta registrado. */
  create(data: CreateUserData): Promise<UserRow>;
}
