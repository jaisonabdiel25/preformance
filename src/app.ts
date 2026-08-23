import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import type { Container } from "./container.js";
import { buildErrorMiddleware } from "./middlewares/ErrorMiddleware.js";
import { notFoundMiddleware } from "./middlewares/NotFoundMiddleware.js";
import { buildHealthRoutes } from "./routes/health.routes.js";
import { buildApiRoutes } from "./routes/index.js";

/**
 * Construye la aplicacion Express a partir de un contenedor ya cableado.
 *
 * Separarlo de `server.ts` (que es quien abre el puerto) permite montar la app en
 * memoria para tests de integracion con supertest, sin escuchar en ningun socket.
 */
export function buildApp(container: Container): Express {
  const { env } = container;
  const app = express();

  // No anunciar la tecnologia del backend.
  app.disable("x-powered-by");

  // Detras del contenedor hay al menos un salto de red: sin esto, express-rate-limit
  // veria la IP del proxy y limitaria a todos los clientes como si fueran uno solo.
  app.set("trust proxy", 1);

  // --- Middlewares globales -------------------------------------------------
  app.use(helmet());
  app.use(cors({ origin: parseCorsOrigin(env.CORS_ORIGIN) }));

  // Limite bajo a proposito: estos endpoints solo reciben objetos JSON pequenos, y
  // un tope alto es una via facil de agotar memoria.
  app.use(express.json({ limit: "10kb" }));

  // --- Rutas ----------------------------------------------------------------
  app.use("/health", buildHealthRoutes(container.healthController));
  app.use("/api/v1", buildApiRoutes(container));

  // --- Cierre de la cadena (el orden importa) -------------------------------
  app.use(notFoundMiddleware);
  app.use(buildErrorMiddleware(env.NODE_ENV === "production"));

  return app;
}

/** "*" abre a cualquier origen; en otro caso se admite una lista separada por comas. */
function parseCorsOrigin(value: string): true | string[] {
  if (value.trim() === "*") return true;

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
