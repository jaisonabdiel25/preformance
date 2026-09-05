import type { PrismaClient } from "../../src/generated/prisma/client.js";

/** ISO 3166-1 alpha-2. Anadir un pais aqui y volver a ejecutar el seed. */
const COUNTRIES = [
  { code: "PA", name: "Panama" },
  { code: "US", name: "Estados Unidos" },
  { code: "CO", name: "Colombia" },
] as const;

/** Deja el catalogo al dia y devuelve cuantos paises hay en la tabla. */
export async function seedCountries(prisma: PrismaClient): Promise<number> {
  for (const country of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: country.code },
      // `update` con el nombre: si se corrige una errata en la lista de arriba,
      // volver a sembrar la propaga en lugar de ignorarla.
      update: { name: country.name },
      create: country,
    });
  }

  return prisma.country.count();
}
