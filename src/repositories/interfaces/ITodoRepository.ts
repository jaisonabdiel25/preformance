import type { TodoRow } from "../../types/todo.types.js";

export interface CreateTodoData {
  /**
   * Sale de `req.user.id`, nunca del cuerpo de la peticion: `createTodoSchema` no
   * declara este campo y `strictObject` rechaza los que no declara, asi que un
   * cliente no puede crear tareas a nombre de otro.
   */
  userId: string;
  title: string;
  description?: string | undefined;
}

/**
 * Todos los campos son opcionales —es una actualizacion parcial (PATCH)—, pero el
 * esquema exige que venga al menos uno.
 *
 * `description` admite `null` ademas de `undefined`, y la diferencia importa:
 * `undefined` significa "no toques la descripcion" y `null` significa "borrala".
 */
export interface UpdateTodoData {
  title?: string | undefined;
  description?: string | null | undefined;
  completed?: boolean | undefined;
}

/**
 * Contrato de persistencia de tareas.
 *
 * Toda operacion lleva el `userId` en la firma, y eso es deliberado: no existe un
 * `findById(id)` ni un `deleteById(id)` que alguien pueda llamar por descuido desde
 * el servicio y acabar leyendo o borrando la tarea de otro. La comprobacion de
 * propiedad no se puede olvidar porque no hay forma de expresar una consulta sin ella.
 *
 * De ahi tambien el 404 uniforme: como el `where` siempre lleva `{ id, userId }`, una
 * tarea ajena y una inexistente devuelven exactamente lo mismo, y la respuesta no
 * confirma si ese identificador existe de verdad.
 */
export interface ITodoRepository {
  /** Las tareas del usuario, de la mas reciente a la mas antigua. */
  findAllByUserId(userId: string): Promise<TodoRow[]>;

  create(data: CreateTodoData): Promise<TodoRow>;

  /** null si la tarea no existe O si es de otro usuario. El llamante no los distingue. */
  updateByIdAndUserId(
    id: string,
    userId: string,
    data: UpdateTodoData,
  ): Promise<TodoRow | null>;

  /** false si la tarea no existe o es de otro usuario. */
  deleteByIdAndUserId(id: string, userId: string): Promise<boolean>;
}
