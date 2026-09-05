import { z } from "zod";

/**
 * Esquemas Zod puros, sin dependencias de Express. Se mantienen separados de las
 * clases validadoras para poder reutilizarlos desde un job, un seed o un test sin
 * arrastrar la capa HTTP.
 *
 * `emailField` y `passwordField` se exportan por eso mismo: `prisma/seed.ts` valida
 * con ellos las credenciales del administrador inicial, de modo que una clave que el
 * seed acepta es exactamente una que /register aceptaria. El email ademas llega ya
 * normalizado a minusculas, que es como AuthService lo busca al hacer login.
 */

/**
 * El `.trim().toLowerCase()` va ANTES del `.pipe(z.email())` a proposito: los checks
 * de una cadena Zod se aplican en el orden en que se encadenan, asi que normalizar
 * despues de validar dejaria pasar "  Ana@Mail.com  " sin limpiar.
 */
export const emailField = z
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
export const passwordField = z
  .string({ message: "La contrasena es obligatoria" })
  .min(8, "La contrasena debe tener al menos 8 caracteres")
  .max(72, "La contrasena no puede superar los 72 caracteres")
  .regex(/[a-z]/, "La contrasena debe incluir al menos una letra minuscula")
  .regex(/[A-Z]/, "La contrasena debe incluir al menos una letra mayuscula")
  .regex(/\d/, "La contrasena debe incluir al menos un numero");

const MIN_AGE_YEARS = 18;
const MAX_AGE_YEARS = 120;

/** Edad cumplida a dia de hoy, contando el mes y el dia, no solo el ano. */
function yearsSince(date: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();

  const monthDiff = today.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < date.getUTCDate())) {
    age -= 1;
  }

  return age;
}

/**
 * Fecha de nacimiento en formato ISO `YYYY-MM-DD`.
 *
 * `z.iso.date()` rechaza tanto formatos raros como fechas que no existen
 * (`1990-02-30`). Despues se transforma a Date en UTC: sin la Z, `new Date()`
 * interpretaria la cadena en la zona local y en husos negativos la fecha
 * retrocederia un dia.
 */
const birthDateField = z
  .iso.date("La fecha de nacimiento debe tener el formato YYYY-MM-DD")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => date.getTime() <= Date.now(), {
    message: "La fecha de nacimiento no puede estar en el futuro",
  })
  .refine((date) => yearsSince(date) >= MIN_AGE_YEARS, {
    message: `Debes tener al menos ${MIN_AGE_YEARS} anos`,
  })
  .refine((date) => yearsSince(date) <= MAX_AGE_YEARS, {
    message: "La fecha de nacimiento no es plausible",
  });

/**
 * Codigo ISO 3166-1 alpha-2. Se normaliza a mayusculas antes de validar, igual que
 * el email a minusculas, para que "pa" y "PA" sean el mismo pais.
 *
 * Que el codigo EXISTA lo garantiza la clave foranea contra `countries`; aqui solo
 * se comprueba la forma. Consulta GET /api/v1/countries para la lista valida.
 */
const countryCodeField = z
  .string({ message: "El pais debe ser un codigo ISO de 2 letras" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "El pais debe ser un codigo ISO 3166-1 alpha-2, como PA o CO");

/**
 * `strictObject` rechaza cualquier campo no declarado. Eso es lo que impide que un
 * cliente se autoasigne un rol: `role` NO esta aqui, asi que un `{"role": "ADMIN"}`
 * en el cuerpo se corta con un 422 en lugar de llegar al servicio.
 */
export const registerSchema = z.strictObject({
  email: emailField,
  password: passwordField,
  name: z
    .string({ message: "El nombre es obligatorio" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar los 100 caracteres"),

  // Opcionales: se pueden completar despues. `.optional()` acepta que el campo
  // falte; enviarlo con un valor invalido sigue dando 422.
  birthDate: birthDateField.optional(),
  countryCode: countryCodeField.optional(),
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
