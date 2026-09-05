import type { PublicTodo } from "../../types/todo.types.js";
import type { CreateTodoDto, UpdateTodoDto } from "../../validators/schemas/todo.schemas.js";

/**
 * Contrato de los casos de uso de tareas.
 *
 * El `userId` va SIEMPRE primero en la firma, antes que el identificador del recurso.
 * Es una convencion con intencion: al leer la llamada se ve el ambito antes que la
 * tarea, y una firma sin userId se nota a simple vista.
 */
export interface ITodoService {
  /** Las tareas del usuario, de la mas reciente a la mas antigua. */
  list(userId: string): Promise<PublicTodo[]>;

  create(userId: string, dto: CreateTodoDto): Promise<PublicTodo>;

  /** Lanza NotFoundError si la tarea no existe o es de otro usuario. */
  update(userId: string, id: string, dto: UpdateTodoDto): Promise<PublicTodo>;

  /** Lanza NotFoundError si la tarea no existe o es de otro usuario. */
  remove(userId: string, id: string): Promise<void>;
}
