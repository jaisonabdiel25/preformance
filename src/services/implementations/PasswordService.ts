import bcrypt from "bcryptjs";

import type { IPasswordService } from "../interfaces/IPasswordService.js";

/**
 * Implementacion bcrypt de IPasswordService.
 *
 * Se usa `bcryptjs` (implementacion en JS puro) en lugar del binding nativo `bcrypt`
 * para que el proyecto compile igual en Windows y dentro del contenedor Linux sin
 * necesitar toolchain de compilacion. Cambiar a `argon2` o `bcrypt` solo requiere
 * escribir otra clase en esta carpeta que cumpla la misma interfaz.
 */
export class PasswordService implements IPasswordService {
  /**
   * Hash de una contrasena ficticia, calculado una sola vez al arrancar.
   * Sirve para que un login contra un email inexistente cueste lo mismo que uno
   * contra un email real (ver `fakeCompare`).
   */
  private readonly dummyHash: string;

  constructor(private readonly rounds: number) {
    this.dummyHash = bcrypt.hashSync("contrasena-que-nunca-coincide", rounds);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Quema el mismo tiempo de CPU que un `compare` real.
   *
   * Sin esto, un login con email inexistente responde en microsegundos y uno con
   * email real tarda ~200 ms, lo que permite enumerar que cuentas existen midiendo
   * el tiempo de respuesta.
   */
  async fakeCompare(plain: string): Promise<void> {
    await bcrypt.compare(plain, this.dummyHash);
  }
}
