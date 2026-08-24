import type { PublicCountry } from "../../types/user.types.js";

/**
 * Contrato del catalogo de paises.
 *
 * Existe para que un cliente pueda poblar un desplegable con los codigos validos
 * antes de enviar un registro: sin esto, `countryCode` seria un campo a ciegas.
 */
export interface ICountryService {
  list(): Promise<PublicCountry[]>;
}
