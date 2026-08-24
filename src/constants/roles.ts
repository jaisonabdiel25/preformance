/**
 * Codigos de rol que el codigo de la aplicacion conoce.
 *
 * Al ser los roles una tabla y no un enum, `user.role.code` es un `string` para
 * TypeScript: una comparacion contra el literal `"ADMNI"` compilaria sin protestar y
 * denegaria el acceso en silencio para siempre. Comparar siempre contra este objeto
 * devuelve esa red de seguridad.
 *
 *   if (user.role.code === ROLE.ADMIN)   // el compilador valida la propiedad
 *   if (user.role.code === "ADMNI")      // esto no lo para nadie
 *
 * `RoleService.assertKnownRolesExist()` comprueba al arrancar que cada uno de estos
 * codigos existe de verdad en la tabla `roles`, de modo que un desajuste entre codigo
 * y datos revienta el arranque en lugar de manifestarse como un permiso denegado
 * inexplicable en produccion.
 */
export const ROLE = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;

/** Union de los codigos conocidos: "USER" | "ADMIN". */
export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

/** Los codigos conocidos como array, para recorrerlos. */
export const KNOWN_ROLE_CODES: readonly RoleCode[] = Object.values(ROLE);
