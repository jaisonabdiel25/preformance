import type { AppPrismaClient } from "../../config/database.js";
import type { RefreshTokenRow } from "../../types/user.types.js";
import type {
  CreateRefreshTokenData,
  IRefreshTokenRepository,
} from "../interfaces/IRefreshTokenRepository.js";

/** Implementacion Prisma de IRefreshTokenRepository. */
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async create(data: CreateRefreshTokenData): Promise<RefreshTokenRow> {
    return this.prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findActiveByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    // `findFirst` y no `findUnique` porque, ademas del hash, se filtra por estado:
    // findUnique solo admite campos unicos en el `where`.
    //
    // OJO: con SQL crudo la caducidad se comparaba contra `now()` de PostgreSQL.
    // Aqui el `new Date()` se evalua en Node y viaja como parametro, asi que un
    // desfase de reloj entre la API y la BD desplaza la frontera de expiracion.
    // Con ambos en la misma maquina es irrelevante; en despliegues separados,
    // sincroniza los relojes por NTP.
    return this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async revokeById(id: string): Promise<void> {
    // updateMany en lugar de update: `update` lanza P2025 si no encuentra la fila,
    // y aqui revocar algo ya revocado debe ser una operacion silenciosa.
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
