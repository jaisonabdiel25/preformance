import type { AppPrismaClient } from "../../config/database.js";
import type { IRoleRepository } from "../interfaces/IRoleRepository.js";

/** Implementacion Prisma de IRoleRepository. */
export class RoleRepository implements IRoleRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async findAllCodes(): Promise<string[]> {
    const rows = await this.prisma.role.findMany({ select: { code: true } });
    return rows.map((row) => row.code);
  }
}
