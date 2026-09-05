import type { Request, Response } from "express";

import { UnauthorizedError } from "../errors/app-error.js";
import type { ITodoService } from "../services/interfaces/ITodoService.js";
import type {
  CreateTodoDto,
  TodoIdParamDto,
  UpdateTodoDto,
} from "../validators/schemas/todo.schemas.js";

/**
 * Capa HTTP de tareas. Traduce peticiones a llamadas de servicio y resultados a
 * codigos de estado; no contiene logica de negocio.
 *
 * Metodos como propiedades flecha para conservar el `this` al pasarlos al router por
 * referencia, y sin try/catch: Express 5 propaga solo los rechazos async.
 *
 * Ningun metodo lee el usuario del cuerpo ni de la URL. Todos pasan por `userIdOf`,
 * que lo saca del token verificado.
 */
export class TodoController {
  constructor(private readonly todoService: ITodoService) {}

  /** GET /api/v1/todos - solo las del usuario autenticado. */
  list = async (req: Request, res: Response): Promise<void> => {
    const todos = await this.todoService.list(TodoController.userIdOf(req));
    res.status(200).json({ todos });
  };

  /** POST /api/v1/todos */
  create = async (req: Request, res: Response): Promise<void> => {
    // El middleware `validate` ya reemplazo req.body por el DTO parseado.
    const todo = await this.todoService.create(
      TodoController.userIdOf(req),
      req.body as CreateTodoDto,
    );
    res.status(201).json({ todo });
  };

  /** PATCH /api/v1/todos/:id */
  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TodoIdParamDto;
    const todo = await this.todoService.update(
      TodoController.userIdOf(req),
      id,
      req.body as UpdateTodoDto,
    );
    res.status(200).json({ todo });
  };

  /** DELETE /api/v1/todos/:id */
  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as TodoIdParamDto;
    await this.todoService.remove(TodoController.userIdOf(req), id);
    res.status(204).send();
  };

  /**
   * El identificador del usuario autenticado.
   *
   * Inalcanzable el lanzamiento mientras el router monte AuthMiddleware; esta aqui
   * para que un despiste al declarar una ruta falle con 401 y no con un TypeError,
   * y sobre todo para que ningun metodo se vea tentado de buscar el usuario en el
   * cuerpo o en la URL cuando el guard no lo haya puesto.
   */
  private static userIdOf(req: Request): string {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    return req.user.id;
  }
}
