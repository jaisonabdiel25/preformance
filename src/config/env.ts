// Carga el .env del host. dotenv NO pisa variables ya presentes en process.env, asi
// que dentro de Docker mandan las que inyecta docker-compose (y el .env ni siquiera
// llega a la imagen: esta en .dockerignore).
import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET debe tener al menos 32 caracteres"),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default("15m"),
  JWT_ISSUER: z.string().min(1).default("preformance-api"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(7),

  // Por debajo de 10 el hash deja de ser defensa real; por encima de 15 el login
  // se vuelve inusable. bcrypt duplica el coste con cada incremento.
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  CORS_ORIGIN: z.string().min(1).default("*"),

  // Cupo estricto para /register y /login, que son los objetivos de fuerza bruta.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  // Cupo aparte y mas holgado para /refresh: lo invoca cada cliente autenticado de
  // forma periodica, y varias pestanas o dispositivos tras la misma IP publica
  // agotarian el limite de login sin que haya ningun abuso.
  REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida la configuracion de entorno. Se ejecuta al importar el modulo para que un
 * despliegue mal configurado falle al arrancar, con un mensaje concreto, en vez de
 * romperse a mitad de una peticion.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Configuracion de entorno invalida:\n${detalle}\n\n` +
        "Revisa tu archivo .env (puedes partir de .env.example).",
    );
  }

  return result.data;
}

export const env: Env = loadEnv();
