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
