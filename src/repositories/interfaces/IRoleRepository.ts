/**
 * Contrato del catalogo de roles.
 *
 * Es de solo lectura: los roles se crean en una migracion, no por la API. Son datos
 * estructurales de los que depende poder registrar usuarios.
 */
export interface IRoleRepository {
  /** Codigos de todos los roles existentes. Lo consume la comprobacion de arranque. */
  findAllCodes(): Promise<string[]>;
}
