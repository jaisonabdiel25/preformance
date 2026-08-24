/**
 * Contrato de la comprobacion de integridad de roles.
 *
 * Existe por lo que se pierde al pasar de enum a tabla: ya no hay nada que garantice
 * que los codigos que el codigo da por hechos existan realmente en la BD.
 */
export interface IRoleService {
  /**
   * Verifica que todos los codigos de `ROLE` existen en la tabla `roles`.
   * Lanza si falta alguno. Se llama al arrancar, antes de aceptar trafico.
   */
  assertKnownRolesExist(): Promise<void>;
}
