import { z } from "zod";

import { ROLE } from "../../src/constants/roles.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { PasswordService } from "../../src/services/implementations/PasswordService.js";
import {
  emailField,
  passwordField,
} from "../../src/validators/schemas/auth.schemas.js";

/**
 * Configuracion del administrador inicial, leida del entorno.
 *
 * Se valida con los MISMOS campos que /register (`emailField`, `passwordField`), asi
 * que una clave que el seed acepta es exactamente una que la API aceptaria. El email
 * llega ademas normalizado a minusculas, que es como `AuthService` lo busca al hacer
 * login: sembrarlo con mayusculas crearia una cuenta imposible de usar.
 *
 * No se importa `config/env.ts` a proposito. Ese modulo exige JWT_ACCESS_SECRET y
 * compania, que el seed no usa y que no tienen por que estar presentes cuando se
 * siembra una base remota desde una maquina de desarrollo. Por la misma razon estas
 * variables llevan prefijo SEED_: no son configuracion de la API y no aparecen en
 * `config/env.ts`.
 */
const adminEnvSchema = z.object({
  SEED_ADMIN_EMAIL: emailField,
  SEED_ADMIN_PASSWORD: passwordField,
  SEED_ADMIN_NAME: z
    .string()
    .trim()
    .min(2, "SEED_ADMIN_NAME debe tener al menos 2 caracteres")
    .max(100, "SEED_ADMIN_NAME no puede superar los 100 caracteres")
    .default("Administrador"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
});

/**
 * Crea el administrador inicial, si esta declarado en el entorno y no hay ninguno ya.
 *
 * Debe correr DESPUES de `seedRoles`: `users.role_code` es clave foranea de `roles`.
 *
 * Resuelve DOS comprobaciones distintas, que conviene no confundir:
 *
 *  1. **Por rol**: ¿hay ya un ADMIN? Si lo hay, el seed no crea un segundo, sea quien
 *     sea y aunque SEED_ADMIN_EMAIL apunte a otra direccion. Cambiar esa variable y
 *     volver a sembrar NO sustituye al administrador que existe; el mensaje lo dice
 *     con nombre y apellidos, porque una configuracion que no surte efecto en silencio
 *     es peor que una que falla.
 *  2. **Por email**: ¿existe ya esa cuenta? Si existe, no se crea una segunda con el
 *     mismo email (chocaria con el UNIQUE de `users.email`): como mucho se promociona.
 *
 * Ambas se ejecutan siempre, no en cascada, para que el mensaje diga cual de las dos
 * paro el seed. Son reglas independientes: la primera limita cuantos administradores
 * hay, la segunda cuantas cuentas.
 *
 * La regla del administrador unico la garantiza este seed, no el esquema: `users` no
 * impide que existan varios ADMIN, asi que promocionar a un segundo por otra via sigue
 * siendo posible a proposito.
 *
 * Cuando todavia no hay ningun administrador:
 *
 *  - Si el email no existe, crea el usuario con rol ADMIN.
 *  - Si el email ya existe como USER, lo promociona sin tocar su contrasena. Es la
 *    via para ascender una cuenta ya registrada sin abrir Prisma Studio ni usar SQL.
 *
 * Nunca reescribe una contrasena. Rehashear en cada ejecucion convertiria un `db:seed`
 * lanzado para corregir un pais en un reseteo silencioso de la clave del administrador,
 * incluso en produccion; y como bcrypt genera una sal distinta cada vez, tampoco hay
 * forma de detectar que "no ha cambiado" y saltarse la escritura. Para rotarla: borra
 * la fila y vuelve a sembrar.
 *
 * Devuelve una linea describiendo lo que hizo, para que el orquestador la registre.
 */
export async function seedAdmin(prisma: PrismaClient): Promise<string> {
  if (!process.env["SEED_ADMIN_EMAIL"]?.trim()) {
    return "omitido (SEED_ADMIN_EMAIL sin definir)";
  }

  const result = adminEnvSchema.safeParse(process.env);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n");

    // Se falla en vez de omitir: si alguien se molesto en declarar el admin, un dato
    // invalido es un error que hay que ver, no algo que saltarse en silencio.
    throw new Error(`Configuracion de SEED_ADMIN invalida:\n${detalle}`);
  }

  const {
    SEED_ADMIN_EMAIL: email,
    SEED_ADMIN_PASSWORD: password,
    SEED_ADMIN_NAME: name,
    BCRYPT_ROUNDS: rounds,
  } = result.data;

  // Son DOS comprobaciones independientes, con motivos distintos, y se resuelven las
  // dos antes de decidir nada:
  //
  //   1. ¿Hay ya un ADMIN? Mira el ROL, no el email. Es la regla "como mucho uno":
  //      da igual quien sea, el seed no crea un segundo.
  //   2. ¿Existe ya esa cuenta? Mira el EMAIL. Es la regla "no duplicar un usuario":
  //      como mucho se promociona la que hay, nunca se crea otra igual.
  //
  // Encadenarlas (comprobar el email solo cuando no habia ADMIN) hacia que la primera
  // tapase a la segunda y el mensaje no dijese si el email pedido existia o no.
  const [currentAdmin, existingUser] = await Promise.all([
    // `orderBy` para que, con varios ADMIN puestos a mano por fuera, el mensaje sea
    // estable entre ejecuciones en vez de depender del orden que devuelva Postgres.
    prisma.user.findFirst({
      where: { roleCode: ROLE.ADMIN },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { email },
      select: { roleCode: true },
    }),
  ]);

  // Comprobacion 1: ya hay administrador. No se toca nada, pero el mensaje distingue
  // los tres casos porque lo que hay que hacer despues es distinto en cada uno.
  if (currentAdmin) {
    if (currentAdmin.email === email) {
      return `${email} ya es el ADMIN (contrasena intacta)`;
    }

    return existingUser
      ? `omitido: ya hay un ADMIN (${currentAdmin.email}); ${email} existe y se queda como ${existingUser.roleCode}`
      : `omitido: ya hay un ADMIN (${currentAdmin.email}); ${email} no existe y no se creara`;
  }

  // Comprobacion 2: no hay administrador, pero la cuenta ya esta registrada. Se
  // promociona en lugar de crear una segunda con el mismo email, que ademas chocaria
  // contra el UNIQUE de `users.email`.
  if (existingUser) {
    await prisma.user.update({ where: { email }, data: { roleCode: ROLE.ADMIN } });

    return `${email} ya existia como ${existingUser.roleCode}: promovido a ADMIN (contrasena intacta)`;
  }

  // Ninguna de las dos aplica: no hay ADMIN y el email esta libre.
  // El PasswordService se instancia aqui dentro y no arriba: su constructor calcula un
  // hash ficticio, y no tiene sentido pagarlo en los caminos que no crean a nadie.
  const passwordHash = await new PasswordService(rounds).hash(password);

  await prisma.user.create({
    data: { email, passwordHash, name, roleCode: ROLE.ADMIN },
  });

  return `${email} creado`;
}
