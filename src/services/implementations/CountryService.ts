import type { ICountryRepository } from "../../repositories/interfaces/ICountryRepository.js";
import type { PublicCountry } from "../../types/user.types.js";
import type { ICountryService } from "../interfaces/ICountryService.js";

/** Catalogo de paises que se publica en GET /api/v1/countries. */
export class CountryService implements ICountryService {
  constructor(private readonly countryRepository: ICountryRepository) {}

  async list(): Promise<PublicCountry[]> {
    const countries = await this.countryRepository.findAll();

    // Se proyecta campo a campo igual que toPublicUser: si manana la tabla gana una
    // columna interna, no se filtra sola por la respuesta.
    return countries.map((country) => ({ code: country.code, name: country.name }));
  }
}
