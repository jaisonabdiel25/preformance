import { z } from "zod";

/**
 * Esquemas Zod puros, sin dependencias de Express. Se mantienen separados de las
 * clases validadoras para poder reutilizarlos desde un job, un seed o un test sin
 * arrastrar la capa HTTP.
 */

/**
 * El `.trim().toLowerCase()` va ANTES del `.pipe(z.email())` a proposito: los checks
 * de una cadena Zod se aplican en el orden en que se encadenan, asi que normalizar
 * despues de validar dejaria pasar "  Ana@Mail.com  " sin limpiar.
 */
const emailField = z
  .string({ message: "El email es obligatorio" })
  .trim()
  .toLowerCase()
  .max(255, "El email no puede superar los 255 caracteres")
  .pipe(z.email("El email no tiene un formato valido"));

/**
 * El tope de 72 no es arbitrario: bcrypt solo considera los primeros 72 bytes de la
 * contrasena y trunca el resto en silencio. Mejor rechazarla que aceptar una clave
 * larga cuya cola es decorativa.
 */
const passwordField = z
  .string({ message: "La contrasena es obligatoria" })
  .min(8, "La contrasena debe tener al menos 8 caracteres")
  .max(72, "La contrasena no puede superar los 72 caracteres")
  .regex(/[a-z]/, "La contrasena debe incluir al menos una letra minuscula")
  .regex(/[A-Z]/, "La contrasena debe incluir al menos una letra mayuscula")
  .regex(/\d/, "La contrasena debe incluir al menos un numero");

/**
 * `strictObject` rechaza cualquier campo no declarado. Sin esto, un cliente podria
 * colar `{"role": "admin"}` y confiar en que ninguna capa posterior lo lea.
 */
export const registerSchema = z.strictObject({
  email: emailField,
  password: passwordField,
  name: z
    .string({ message: "El nombre es obligatorio" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar los 100 caracteres"),
});

/**
 * El login NO aplica las reglas de robustez: solo exige que la contrasena venga.
 * Validarla aqui filtraria la politica de contrasenas y, sobre todo, dejaria fuera
 * a usuarios registrados antes de un endurecimiento de las reglas.
 */
export const loginSchema = z.strictObject({
  email: emailField,
  password: z
    .string({ message: "La contrasena es obligatoria" })
    .min(1, "La contrasena es obligatoria"),
});

export const refreshTokenSchema = z.strictObject({
  refreshToken: z
    .string({ message: "El refresh token es obligatorio" })
    .min(1, "El refresh token es obligatorio"),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
