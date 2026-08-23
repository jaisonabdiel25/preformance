import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from "./schemas/auth.schemas.js";
import { Validator } from "./Validator.js";

/**
 * Validadores del modulo de autenticacion.
 *
 * Se agrupan en una clase para que las rutas reciban un unico objeto por inyeccion
 * (`validator.register`, `validator.login`...) en vez de importar cada esquema
 * suelto, y para poder sustituirla entera en un test.
 */
export class AuthValidator {
  readonly register = new Validator(registerSchema);
  readonly login = new Validator(loginSchema);
  readonly refreshToken = new Validator(refreshTokenSchema);
}
