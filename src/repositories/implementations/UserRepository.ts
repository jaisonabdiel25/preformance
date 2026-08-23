import { ConflictError } from "../../errors/app-error.js";
import type { AppPrismaClient } from "../../config/database.js";
import type { UserCredentialsRow, UserRow } from "../../types/user.types.js";
import type { CreateUserData, IUserRepository } from "../interfaces/IUserRepository.js";
import { isUniqueConstraintError } from "./prisma-error.js";

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
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentialsRow | null> {
    return this.prisma.user.findUnique({
      where: { email },
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
        },
      });
    } catch (error) {
      // Red de seguridad ante la carrera entre existsByEmail() y este INSERT: dos
      // registros simultaneos con el mismo email pasan ambos la comprobacion previa
      // y solo la restriccion UNIQUE los separa. Se traduce aqui para que el
      // servicio no tenga que conocer los codigos de error de Prisma.
      if (isUniqueConstraintError(error, "email")) {
        throw new ConflictError("Ya existe una cuenta registrada con ese email");
      }

      throw error;
    }
  }
}
