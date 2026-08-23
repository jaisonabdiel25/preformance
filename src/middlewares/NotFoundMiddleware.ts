import type { NextFunction, Request, RequestHandler, Response } from "express";

import { NotFoundError } from "../errors/app-error.js";

/**
 * Captura las rutas no registradas y las convierte en un NotFoundError, para que un
 * 404 salga con el mismo formato JSON que el resto de errores en lugar del HTML por
 * defecto de Express. Se monta despues de las rutas y antes del error handler.
 */
export const notFoundMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new NotFoundError(`La ruta ${req.method} ${req.originalUrl} no existe`));
};
