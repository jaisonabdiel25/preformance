import type { AppPrismaClient } from "../../config/database.js";
import { ConflictError, ValidationError } from "../../errors/app-error.js";
import type { UserCredentialsRow, UserRow } from "../../types/user.types.js";
import type { CreateUserData, IUserRepository } from "../interfaces/IUserRepository.js";
import { isForeignKeyConstraintError, isUniqueConstraintError } from "./prisma-error.js";

/**
 * Se incluye siempre el pais porque `toPublicUser` lo necesita para devolver
 * `{ code, name }`. Es una sola consulta con JOIN, no un viaje extra a la BD.
 */
const WITH_COUNTRY = { country: true } as const;

/**
 * Implementacion Prisma de IUserRepository.
 *
 * Es el unico lugar del proyecto que consulta el modelo `user`. El cliente lleva
 * `omit: { user: { passwordHash: true } }` global, asi que las consultas de aqui
 * devuelven usuarios sin hash salvo que lo pidan explicitamente.
 */
export class UserRepository implements IUserRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async findById(id: string): Promise<UserRow | null> {
    return this.prisma.user.findUnique({ where: { id }, include: WITH_COUNTRY });
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentialsRow | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: WITH_COUNTRY,
      // Unica desactivacion del omit global en todo el proyecto.
      omit: { passwordHash: false },
    });
  }

  async existsByEmail(email: string): Promise<boolean> {
    // `select: { id: true }` en lugar de traer la fila entera: solo interesa la
    // existencia, no los datos.
    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    return found !== null;
  }

  async create(data: CreateUserData): Promise<UserRow> {
    try {
      return await this.prisma.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          name: data.name,
          // `role` no se acepta a proposito: lo pone el @default(USER) del esquema.
          birthDate: data.birthDate ?? null,
          countryCode: data.countryCode ?? null,
        },
        include: WITH_COUNTRY,
      });
    } catch (error) {
      // Red de seguridad ante la carrera entre existsByEmail() y este INSERT: dos
      // registros simultaneos con el mismo email pasan ambos la comprobacion previa
      // y solo la restriccion UNIQUE los separa. Se traduce aqui para que el
      // servicio no tenga que conocer los codigos de error de Prisma.
      if (isUniqueConstraintError(error, "email")) {
        throw new ConflictError("Ya existe una cuenta registrada con ese email");
      }

      // countryCode que no esta en la tabla `countries`. Es un dato invalido del
      // cliente, no un fallo del servidor, asi que sale como 422 sobre el campo.
      if (isForeignKeyConstraintError(error)) {
        throw new ValidationError({
          countryCode: [
            `El pais "${data.countryCode}" no existe. Consulta GET /api/v1/countries.`,
          ],
        });
      }

      throw error;
    }
  }
}
