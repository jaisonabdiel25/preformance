import { Router } from "express";

import type { TodoController } from "../controllers/TodoController.js";
import type { AuthMiddleware } from "../middlewares/AuthMiddleware.js";
import { validate } from "../middlewares/ValidateMiddleware.js";
import type { TodoValidator } from "../validators/TodoValidator.js";

export interface TodoRoutesDeps {
  todoController: TodoController;
  todoValidator: TodoValidator;
  authMiddleware: AuthMiddleware;
}

/**
 * Rutas de /api/v1/todos.
 *
 * Todas privadas: una tarea pertenece a alguien y no hay lectura anonima que tenga
 * sentido, al reves que el catalogo de paises.
 *
 * Sin rate limiter propio. Los dos cupos que existen protegen credenciales; meter
 * aqui operaciones rutinarias de un usuario ya autenticado gastaria un presupuesto
 * que se mantiene separado a proposito.
 */
export function buildTodoRoutes(deps: TodoRoutesDeps): Router {
  const { todoController, todoValidator, authMiddleware } = deps;
  const router = Router();

  // El guard se monta UNA vez para todo el router, en vez de repetirlo ruta a ruta:
  // asi una ruta que se anada manana no puede quedarse publica por olvido.
  router.use(authMiddleware.handle);

  router.get("/", todoController.list);

  router.post("/", validate(todoValidator.create), todoController.create);

  // El validador del parametro va antes que el del cuerpo: si el id no es un UUID, la
  // peticion no llega siquiera a parsear el body.
  router.patch(
    "/:id",
    validate(todoValidator.idParam, "params"),
    validate(todoValidator.update),
    todoController.update,
  );

  router.delete(
    "/:id",
    validate(todoValidator.idParam, "params"),
    todoController.remove,
  );

  return router;
}
