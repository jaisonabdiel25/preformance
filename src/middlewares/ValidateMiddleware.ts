import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";

import type { Validator } from "../validators/Validator.js";

export type ValidationSource = "body" | "params" | "query";

/**
 * Fabrica de middlewares de validacion.
 *
 * Sustituye la seccion validada de la peticion por el dato ya parseado, de forma que
 * el controlador recibe valores normalizados (email en minusculas, campos recortados)
 * y con los tipos que declara el esquema, no cadenas crudas.
 *
 *   router.post("/login", validate(authValidator.login), controller.login);
 */
export function validate<TSchema extends z.ZodType>(
  validator: Validator<TSchema>,
  source: ValidationSource = "body",
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = validator.validate(req[source]);

      if (source === "query") {
        // En Express 5 `req.query` es un getter sin setter (se parsea de forma
        // perezosa), asi que una asignacion directa lanza TypeError.
        Object.defineProperty(req, "query", {
          value: parsed,
          writable: true,
          configurable: true,
        });
      } else if (source === "params") {
        req.params = parsed as Request["params"];
      } else {
        req.body = parsed;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
