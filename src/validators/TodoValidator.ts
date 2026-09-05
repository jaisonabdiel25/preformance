import {
  createTodoSchema,
  todoIdParamSchema,
  updateTodoSchema,
} from "./schemas/todo.schemas.js";
import { Validator } from "./Validator.js";

/**
 * Validadores del modulo de tareas, agrupados para que las rutas reciban un unico
 * objeto por inyeccion en vez de importar cada esquema suelto.
 */
export class TodoValidator {
  readonly create = new Validator(createTodoSchema);
  readonly update = new Validator(updateTodoSchema);
  /** Se monta con `validate(validator.idParam, "params")`. */
  readonly idParam = new Validator(todoIdParamSchema);
}
