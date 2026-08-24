import type { AppPrismaClient } from "../../config/database.js";
import type { Country } from "../../types/user.types.js";
import type { ICountryRepository } from "../interfaces/ICountryRepository.js";

/** Implementacion Prisma de ICountryRepository. */
export class CountryRepository implements ICountryRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async findAll(): Promise<Country[]> {
    return this.prisma.country.findMany({ orderBy: { name: "asc" } });
  }

  async findByCode(code: string): Promise<Country | null> {
    return this.prisma.country.findUnique({ where: { code } });
  }
}
