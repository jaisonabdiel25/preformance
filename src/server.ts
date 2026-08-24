import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { buildContainer } from "./container.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const container = buildContainer(env);
const app = buildApp(container);

// Los roles son una tabla, no un enum, asi que nada garantiza a nivel de tipos que
// los codigos que el codigo da por hechos existan en la BD. Se comprueba ANTES de
// escuchar: mejor no arrancar que servir peticiones denegando permisos en silencio
// porque falta una fila.
try {
  await container.roleService.assertKnownRolesExist();
} catch (error) {
  console.error("[api] catalogo de roles incompleto:", error);
  await container.shutdown();
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  console.log(`[api] escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

let shuttingDown = false;

/**
 * Apagado ordenado: deja de aceptar conexiones nuevas, espera a que terminen las
 * peticiones en vuelo y cierra el pool. Sin esto, un `docker compose down` corta
 * transacciones a medias y deja conexiones colgando en PostgreSQL.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[api] ${signal} recibido, cerrando...`);

  // Si algo se queda enganchado, salir por las malas antes de que el orquestador
  // envie un SIGKILL. `unref` evita que este timer mantenga vivo el proceso.
  const forceExit = setTimeout(() => {
    console.error("[api] cierre forzado tras agotar el tiempo de espera");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      console.error("[api] error cerrando el servidor HTTP:", error);
    }

    try {
      await container.shutdown();
      console.log("[api] conexiones de base de datos cerradas");
    } catch (dbError) {
      console.error("[api] error cerrando las conexiones de base de datos:", dbError);
      process.exit(1);
    }

    process.exit(error ? 1 : 0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Un rechazo sin capturar deja el proceso en estado indefinido: se registra y se
// cierra ordenadamente en vez de seguir sirviendo trafico a ciegas.
process.on("unhandledRejection", (reason) => {
  console.error("[api] promesa rechazada sin manejar:", reason);
  void shutdown("unhandledRejection");
});

process.on("uncaughtException", (error) => {
  console.error("[api] excepcion no capturada:", error);
  void shutdown("uncaughtException");
});
