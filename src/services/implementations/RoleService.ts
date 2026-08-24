import { KNOWN_ROLE_CODES } from "../../constants/roles.js";
import type { IRoleRepository } from "../../repositories/interfaces/IRoleRepository.js";
import type { IRoleService } from "../interfaces/IRoleService.js";

/**
 * Guardian de la coherencia entre el codigo y el catalogo de roles.
 *
 * Con un enum, la base de datos garantizaba que los valores existian. Con una tabla
 * esa garantia desaparece: alguien puede borrar la fila ADMIN y la aplicacion
 * seguiria arrancando, negando permisos de administrador sin decir por que.
 * Esta comprobacion convierte ese fallo silencioso en un arranque fallido con un
 * mensaje concreto.
 */
export class RoleService implements IRoleService {
  constructor(private readonly roleRepository: IRoleRepository) {}

  async assertKnownRolesExist(): Promise<void> {
    const existing = new Set(await this.roleRepository.findAllCodes());
    const missing = KNOWN_ROLE_CODES.filter((code) => !existing.has(code));

    if (missing.length > 0) {
      throw new Error(
        `La tabla 'roles' no contiene ${missing.join(", ")}. ` +
          "El codigo depende de esos roles. Aplica las migraciones con " +
          "`npm run migrate:up`, que es donde se insertan.",
      );
    }
  }
}
