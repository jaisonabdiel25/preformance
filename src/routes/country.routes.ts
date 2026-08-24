import { Router } from "express";

import type { CountryController } from "../controllers/CountryController.js";

/**
 * Rutas de /api/v1/countries.
 *
 * Publica y sin autenticacion: el formulario de registro necesita la lista de
 * paises antes de que exista ningun usuario. Es un catalogo de datos maestros, no
 * informacion sensible.
 */
export function buildCountryRoutes(countryController: CountryController): Router {
  const router = Router();

  router.get("/", countryController.list);

  return router;
}
