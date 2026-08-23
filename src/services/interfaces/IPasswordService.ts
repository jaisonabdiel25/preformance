/**
 * Contrato de hasheo y verificacion de contrasenas.
 *
 * Al depender AuthService de esta interfaz y no de la clase concreta, un test puede
 * inyectar un doble instantaneo en lugar de ejecutar bcrypt real, que cuesta unos
 * 200 ms por hash con coste 12.
 */
export interface IPasswordService {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
  /**
   * Consume el mismo tiempo de CPU que un `compare` real sin comparar nada util.
   * Sirve para que un login contra un email inexistente tarde lo mismo que uno
   * contra un email real.
   */
  fakeCompare(plain: string): Promise<void>;
}
