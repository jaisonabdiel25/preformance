import type { z } from "zod";

import { ValidationError, type ErrorDetails } from "../errors/app-error.js";

/**
 * Envoltorio reutilizable sobre un esquema Zod.
 *
 * Aporta dos cosas sobre llamar a `schema.parse()` directamente:
 *  - traduce el ZodError a ValidationError, de modo que el middleware de error no
 *    necesita conocer Zod;
 *  - normaliza los issues a un mapa campo -> mensajes, que es el formato que espera
 *    un formulario en el cliente.
 */
export class Validator<TSchema extends z.ZodType> {
  constructor(private readonly schema: TSchema) {}

  /** Devuelve el dato ya parseado y transformado, o lanza ValidationError (422). */
  validate(data: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(data);

    if (!result.success) {
      throw new ValidationError(Validator.formatIssues(result.error));
    }

    return result.data;
  }

  /** Comprobacion booleana, para cuando no interesa el detalle del fallo. */
  isValid(data: unknown): boolean {
    return this.schema.safeParse(data).success;
  }

  private static formatIssues(error: z.ZodError): ErrorDetails {
    const details: ErrorDetails = {};

    for (const issue of error.issues) {
      // Un issue sin ruta apunta al objeto completo (por ejemplo, un campo
      // desconocido rechazado por strictObject).
      const field = issue.path.length > 0 ? issue.path.join(".") : "_";
      (details[field] ??= []).push(issue.message);
    }

    return details;
  }
}
