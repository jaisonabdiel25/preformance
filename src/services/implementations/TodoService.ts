import { toPublicTodo } from "../../dtos/todo.dto.js";
import { NotFoundError } from "../../errors/app-error.js";
import type { ITodoRepository } from "../../repositories/interfaces/ITodoRepository.js";
import type { PublicTodo } from "../../types/todo.types.js";
import type { CreateTodoDto, UpdateTodoDto } from "../../validators/schemas/todo.schemas.js";
import type { ITodoService } from "../interfaces/ITodoService.js";

/**
 * Mensaje unico para toda tarea inalcanzable.
 *
 * Vale tanto para "ese identificador no existe" como para "existe pero es de otro
 * usuario", y esa ambiguedad es el objetivo: distinguirlos convertiria el endpoint en
 * un oraculo para averiguar que identificadores son reales. Mismo criterio que el 401
 * generico del login.
 */
const TODO_NOT_FOUND = "Tarea no encontrada";

/**
 * Casos de uso de tareas.
 *
 * Depende de ITodoRepository, no de Prisma, y no conoce Express: no recibe `req` ni
 * `res` ni decide codigos HTTP. El `userId` le llega ya resuelto desde el controlador.
 */
export class TodoService implements ITodoService {
  constructor(private readonly todoRepository: ITodoRepository) {}

  async list(userId: string): Promise<PublicTodo[]> {
    const todos = await this.todoRepository.findAllByUserId(userId);

    return todos.map(toPublicTodo);
  }

  async create(userId: string, dto: CreateTodoDto): Promise<PublicTodo> {
    const todo = await this.todoRepository.create({
      userId,
      title: dto.title,
      description: dto.description,
    });

    return toPublicTodo(todo);
  }

  async update(userId: string, id: string, dto: UpdateTodoDto): Promise<PublicTodo> {
    const todo = await this.todoRepository.updateByIdAndUserId(id, userId, dto);

    if (!todo) {
      throw new NotFoundError(TODO_NOT_FOUND);
    }

    return toPublicTodo(todo);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.todoRepository.deleteByIdAndUserId(id, userId);

    // Se responde 404 en vez de tratar el borrado como idempotente: aqui, a diferencia
    // de /logout, callar ocultaria al usuario que su peticion no ha hecho nada.
    if (!deleted) {
      throw new NotFoundError(TODO_NOT_FOUND);
    }
  }
}
