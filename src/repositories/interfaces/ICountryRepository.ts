import type { Country } from "../../types/user.types.js";

/**
 * Contrato de la tabla de referencia de paises.
 *
 * Es de solo lectura a proposito: el catalogo se puebla con el seeder
 * (`npm run db:seed`), no por la API. Anadir un pais es un cambio de datos maestros,
 * no una operacion de usuario.
 */
export interface ICountryRepository {
  /** Todos los paises, ordenados por nombre. */
  findAll(): Promise<Country[]>;
  findByCode(code: string): Promise<Country | null>;
}
