import { z } from "zod";

/**
 * Esquemas Zod del modulo de tareas. Puros, sin dependencias de Express.
 */

/**
 * Titulo no vacio, con el mensaje que corresponda al contexto.
 *
 * El `.trim()` va ANTES del `.min(1)` a proposito: los checks de una cadena Zod se
 * aplican en el orden en que se encadenan, asi que validar primero dejaria pasar un
 * titulo de solo espacios —`"   "` tiene longitud 3— y guardaria una tarea que en
 * pantalla se ve en blanco.
 *
 * El mensaje se parametriza porque la misma regla dice cosas distintas segun el
 * endpoint: al crear, el titulo falta; al actualizar es opcional, y el error solo
 * aparece si lo mandas vacio a proposito. Un unico "es obligatorio" mentiria en PATCH.
 */
function titleField(emptyMessage: string) {
  return z
    .string({ message: emptyMessage })
    .trim()
    .min(1, emptyMessage)
    .max(200, "El titulo no puede superar los 200 caracteres");
}

const descriptionField = z
  .string({ message: "La descripcion debe ser texto" })
  .trim()
  .max(2000, "La descripcion no puede superar los 2000 caracteres");

/**
 * `strictObject` rechaza cualquier campo no declarado, y `userId` NO esta declarado.
 * Esa es la primera de las tres barreras que impiden crear una tarea a nombre de
 * otro: un `{"title":"x","userId":"<ajeno>"}` se corta con 422 sin llegar al servicio.
 * Las otras dos son que el controlador saca el userId de `req.user` y que el
 * repositorio no ofrece ninguna consulta sin userId.
 *
 * `completed` tampoco esta: una tarea nace pendiente por el @default(false) de la
 * columna. Para marcarla se usa PATCH.
 */
export const createTodoSchema = z.strictObject({
  title: titleField("El titulo es obligatorio"),
  description: descriptionField.optional(),
});

/**
 * Actualizacion parcial: los tres campos son opcionales, pero el `.refine()` exige
 * que venga al menos uno. Sin el, un `PATCH {}` respondia 200 sin haber cambiado
 * nada, que es una mentira educada.
 *
 * `description` es nullable ademas de opcional para poder distinguir "no la toques"
 * (ausente) de "borrala" (null).
 */
export const updateTodoSchema = z
  .strictObject({
    // Opcional, pero si viene NO puede estar vacio: enviar `""` es un intento de
    // dejar la tarea sin titulo, no de dejarla como estaba. Para eso se omite el campo.
    title: titleField("El titulo no puede estar vacio").optional(),
    description: descriptionField.nullable().optional(),
    completed: z.boolean({ message: "El campo completed debe ser true o false" }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debes enviar al menos un campo para actualizar",
  });

/**
 * Valida el `:id` de la ruta. No es decorativo: sin esto un `/todos/abc` llega tal
 * cual a PostgreSQL, que rechaza el UUID malformado, y el cliente recibe un 500
 * opaco en vez de un 422 que nombra el campo.
 */
export const todoIdParamSchema = z.strictObject({
  id: z.uuid("El identificador de la tarea debe ser un UUID"),
});

export type CreateTodoDto = z.infer<typeof createTodoSchema>;
export type UpdateTodoDto = z.infer<typeof updateTodoSchema>;
export type TodoIdParamDto = z.infer<typeof todoIdParamSchema>;
