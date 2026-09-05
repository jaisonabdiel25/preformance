import type { AppPrismaClient } from "../../config/database.js";
import type { TodoRow } from "../../types/todo.types.js";
import type {
  CreateTodoData,
  ITodoRepository,
  UpdateTodoData,
} from "../interfaces/ITodoRepository.js";
import { isRecordNotFoundError } from "./prisma-error.js";

/**
 * Implementacion Prisma de ITodoRepository.
 *
 * Unico lugar del proyecto que consulta el modelo `todo`. En las cuatro consultas el
 * `userId` forma parte del `where`, nunca de un filtro posterior en memoria: la base
 * de datos no llega a devolver filas ajenas.
 */
export class TodoRepository implements ITodoRepository {
  constructor(private readonly prisma: AppPrismaClient) {}

  async findAllByUserId(userId: string): Promise<TodoRow[]> {
    // El indice (user_id, created_at) cubre este where + orderBy entero.
    return this.prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(data: CreateTodoData): Promise<TodoRow> {
    return this.prisma.todo.create({
      data: {
        userId: data.userId,
        title: data.title,
        description: data.description ?? null,
        // `completed` no se acepta al crear: lo pone el @default(false) del esquema.
      },
    });
  }

  async updateByIdAndUserId(
    id: string,
    userId: string,
    data: UpdateTodoData,
  ): Promise<TodoRow | null> {
    try {
      // `userId` acompana a la clave unica dentro del where. Es lo que convierte la
      // comprobacion de propiedad en parte de la propia sentencia UPDATE, en vez de
      // un SELECT previo que dejaria una ventana entre comprobar y escribir.
      return await this.prisma.todo.update({ where: { id, userId }, data });
    } catch (error) {
      // Ni existe ni es suya: el servicio lo traduce a un 404 en ambos casos.
      if (isRecordNotFoundError(error)) return null;
      throw error;
    }
  }

  async deleteByIdAndUserId(id: string, userId: string): Promise<boolean> {
    // deleteMany y no delete: devuelve un contador en lugar de lanzar cuando no
    // encuentra nada, asi que aqui no hace falta capturar. El id es unico, de modo
    // que el "many" nunca borra mas de una fila.
    const { count } = await this.prisma.todo.deleteMany({ where: { id, userId } });

    return count > 0;
  }
}
