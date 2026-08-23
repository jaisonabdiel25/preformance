import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error.js";

/**
 * Manejador de errores final. Debe registrarse el ULTIMO, despues de las rutas.
 *
 * Todas las respuestas de error de la API salen de aqui con la misma forma:
 *   { "error": { "code": "...", "message": "...", "details": { campo: [msg] } } }
 */
export function buildErrorMiddleware(isProduction: boolean): ErrorRequestHandler {
  // Express identifica un manejador de errores por su aridad de 4 argumentos:
  // quitar `_next` lo convertiria en un middleware normal que nunca se ejecuta.
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    // Si ya se empezo a escribir la respuesta, no se puede reemplazar la cabecera.
    if (res.headersSent) {
      console.error("[error] fallo con la respuesta ya iniciada:", error);
      return;
    }

    // Errores de dominio: llevan su propio codigo HTTP y un mensaje pensado
    // para el cliente.
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
      return;
    }

    // express.json() lanza un SyntaxError con la propiedad `body` cuando el cuerpo
    // no es JSON parseable.
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "El cuerpo de la peticion no es JSON valido",
        },
      });
      return;
    }

    // Cualquier otra cosa es un fallo no previsto: se registra completo en el
    // servidor y al cliente solo le llega un mensaje generico, para no filtrar
    // rutas de archivos, SQL ni nombres de tablas.
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);

    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Ha ocurrido un error inesperado",
        ...(isProduction
          ? {}
          : { debug: error instanceof Error ? error.message : String(error) }),
      },
    });
  };
}
