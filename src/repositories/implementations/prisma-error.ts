import { Prisma } from "../../generated/prisma/client.js";

/**
 * Utilidades para inspeccionar errores de Prisma sin que sus codigos se escapen de
 * la capa de repositorios.
 *
 * Vive dentro de `implementations/` porque es un detalle de la implementacion: los
 * servicios trabajan con errores de dominio (`ConflictError`), no con codigos `P2xxx`.
 */

/** P2002: fallo de restriccion unica. */
const UNIQUE_CONSTRAINT_FAILED = "P2002";

/** P2003: fallo de clave foranea (se referencia una fila que no existe). */
const FOREIGN_KEY_CONSTRAINT_FAILED = "P2003";

/**
 * Detecta una violacion de unicidad, opcionalmente sobre un campo concreto.
 *
 * Comprobar el campo importa: sin ello, una tabla con dos indices unicos traduciria
 * cualquiera de los dos choques al mismo error de dominio.
 *
 * Prisma expone los campos implicados en `meta.target`, que en PostgreSQL llega como
 * un array de nombres de columna.
 */
export function isUniqueConstraintError(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== UNIQUE_CONSTRAINT_FAILED) return false;
  if (field === undefined) return true;

  const target = error.meta?.["target"];
  return Array.isArray(target) && target.includes(field);
}

/**
 * Detecta que se ha intentado referenciar una fila inexistente.
 *
 * Ocurre, por ejemplo, al registrar un usuario con un `countryCode` que no esta en
 * la tabla `countries`. Se traduce a un error de validacion para que el cliente
 * reciba un 422 explicando el campo, en vez de un 500 opaco.
 */
export function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === FOREIGN_KEY_CONSTRAINT_FAILED
  );
}
