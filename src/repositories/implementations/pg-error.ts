/**
 * Utilidades para inspeccionar errores de PostgreSQL sin que los codigos SQLSTATE
 * se escapen de la capa de repositorios.
 *
 * Vive dentro de `implementations/` porque es especifico de PostgreSQL: una
 * implementacion de los mismos contratos sobre otro motor no tendria nada que
 * hacer con esto.
 */

/** SQLSTATE 23505: unique_violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Detecta una violacion de unicidad, opcionalmente sobre una restriccion concreta.
 *
 * Comprobar el nombre de la restriccion importa: sin ello, una tabla con dos indices
 * unicos traduciria cualquiera de los dos choques al mismo error de dominio.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== UNIQUE_VIOLATION) return false;

  return constraint === undefined || candidate.constraint === constraint;
}
