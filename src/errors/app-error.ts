/** Mapa campo -> lista de mensajes. Lo produce el validador y viaja en la respuesta 422. */
export type ErrorDetails = Record<string, string[]>;

/**
 * Error de dominio con una traduccion HTTP conocida.
 *
 * El middleware de error usa `instanceof AppError` para decidir que puede enviarse
 * al cliente: cualquier otra excepcion se considera un fallo no previsto y se
 * responde con un 500 generico, sin filtrar detalles internos.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 422 - la peticion esta bien formada pero los datos no pasan las reglas de negocio. */
export class ValidationError extends AppError {
  constructor(details: ErrorDetails, message = "Los datos enviados no son validos") {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

/** 401 - credenciales ausentes, invalidas o caducadas. */
export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/** 403 - autenticado, pero sin permiso sobre el recurso. */
export class ForbiddenError extends AppError {
  constructor(message = "No tienes permiso para realizar esta accion") {
    super(message, 403, "FORBIDDEN");
  }
}

/** 404 - el recurso solicitado no existe. */
export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
  }
}

/** 409 - la operacion choca con el estado actual (por ejemplo, un email ya registrado). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/**
 * 412 - una precondicion enviada por el cliente no se cumple contra el estado actual.
 *
 * Es el codigo del control de concurrencia optimista: el cliente dice "actualiza
 * esto SOLO SI sigue en la version que yo lei" mediante `If-Match` / `If-Unmodified-Since`,
 * y el servidor responde 412 cuando ya no es asi. Evita la actualizacion perdida:
 * dos usuarios editan el mismo recurso y el segundo pisa los cambios del primero
 * sin enterarse.
 *
 *   const etag = req.header("if-match");
 *   if (etag && etag !== `"${product.updated_at.toISOString()}"`) {
 *     throw new PreconditionFailedError(
 *       "El recurso ha cambiado desde que lo cargaste. Recargalo y vuelve a intentarlo.",
 *     );
 *   }
 *
 * No confundir con sus vecinos:
 *  - 409 CONFLICT: la operacion choca con el estado y el cliente no impuso ninguna
 *    condicion (registrar un email que ya existe).
 *  - 428 PRECONDITION REQUIRED: el cliente NO mando la precondicion y el servidor
 *    la exige.
 *  - 422 VALIDATION_ERROR: los datos del cuerpo no pasan las reglas.
 */
export class PreconditionFailedError extends AppError {
  constructor(
    message = "No se cumple una precondicion de la peticion",
    details?: ErrorDetails,
  ) {
    super(message, 412, "PRECONDITION_FAILED", details);
  }
}

/** 503 - una dependencia externa (la base de datos) no responde. */
export class ServiceUnavailableError extends AppError {
  constructor(message = "Servicio no disponible") {
    super(message, 503, "SERVICE_UNAVAILABLE");
  }
}
