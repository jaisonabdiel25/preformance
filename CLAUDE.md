# CLAUDE.md

Este archivo orienta a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

## Comandos

```bash
docker compose up -d --wait   # arranca PostgreSQL (en Docker solo está la BD)
npm run migrate:up            # aplica las migraciones pendientes
npm run dev                   # API en http://localhost:3000, hot reload con tsx

npm run typecheck             # tsc --noEmit
npm run build                 # compila a dist/
npm start                     # ejecuta la build compilada

npm run migrate:down                    # revierte la última migración
npm run migrate:create -- <nombre>      # nueva migración SQL vacía
```

**No hay framework de tests configurado.** La verificación es manual: `requests.http` (extensión REST Client de VS Code) cubre el camino feliz y los de error de cada endpoint. Si añades un runner, la inyección por constructor permite probar los servicios con dobles: sin base de datos y sin bcrypt.

## Trampas del entorno

- **PostgreSQL se publica en el puerto 5441 del host, no en el 5432.** Esta máquina tiene un PostgreSQL 15 instalado nativamente en el 5432, más los contenedores de otros proyectos ocupando del 5433 al 5440. Conectar a `localhost:5432` llega a la instancia *nativa* y falla con `password authentication failed`, mientras que `docker compose exec db psql` funciona sin problema: el contenedor nunca recibe esa conexión. `DB_PORT` y `DATABASE_URL` del `.env` deben ir sincronizados.
- La API **no** corre en Docker. `docker-compose.yml` tiene un único servicio `db`. El `Dockerfile` sirve solo para empaquetar la imagen de producción (`docker build --target runtime`); no interviene en el arranque local.
- `.env` está en `.dockerignore`, así que nunca llega a una capa de la imagen. `config/env.ts` importa `dotenv/config` y valida cada variable con Zod al cargar el módulo, de modo que un entorno mal configurado falla al arrancar con un mensaje concreto en vez de reventar a mitad de una petición.

## Arquitectura

Flujo de una petición; cada capa conoce solo la interfaz de la siguiente:

```
rate limit → validate(Zod) → auth guard → controller → service → repository → PostgreSQL
```

**`src/container.ts` es el composition root**: el único archivo del proyecto que llama a `new` y el único punto donde una interfaz se encuentra con su implementación. Todo lo demás depende de contratos (`IAuthService`, `ITokenService`, `IUserRepository`…). Esto sostiene el diseño: renombrar o mover una clase de implementación toca exactamente un consumidor.

Servicios y repositorios separan el *qué* del *cómo* en carpetas hermanas:

- `interfaces/` — el contrato, junto con los tipos que forman parte de él (`AccessTokenPayload` vive en `ITokenService.ts`).
- `implementations/` — la clase concreta y sus tipos de detalle (`TokenServiceConfig` vive en `TokenService.ts`).

`implementations/` es la carpeta que se tira a la basura al cambiar de tecnología: todo lo específico de PostgreSQL está bajo `repositories/implementations/` (incluido `pg-error.ts`, que traduce códigos SQLSTATE a errores de dominio para que los servicios nunca los vean); bcrypt existe solo en `PasswordService.ts` y JWT solo en `TokenService.ts`.

Los controladores dependen de las interfaces de servicio y son quienes sostienen el contrato HTTP: códigos de estado y forma de la respuesta (`AuthController.toAuthResponse` aplana el resultado del servicio). Los servicios jamás ven `req` ni `res`.

### Validación

Tres piezas, para que los esquemas sigan siendo utilizables fuera de HTTP:

1. `validators/schemas/*.schemas.ts` — objetos Zod puros. Los tipos DTO se derivan con `z.infer`.
2. `validators/Validator.ts` — envuelve un esquema; convierte `ZodError` en `ValidationError` con un mapa `campo → mensajes[]`.
3. `validators/AuthValidator.ts` — agrupa los validadores de un módulo para que las rutas reciban un único objeto inyectado.

`middlewares/ValidateMiddleware.ts` es la fábrica que enchufa esto a una ruta y **sustituye `req.body` por el valor ya parseado**, de forma que el controlador recibe datos normalizados y tipados.

### Errores

Toda respuesta de error tiene la misma forma: `{ error: { code, message, details? } }`.

`ErrorMiddleware` despacha cualquier subclase de `AppError` por su propio `statusCode`, así que añadir un tipo de error nuevo no requiere tocar el middleware. Todo lo que *no* sea `AppError` se trata como fallo imprevisto: se registra entero en el servidor y al cliente le llega un 500 genérico. Lanzar un `Error` pelado, por tanto, no filtra nada pero tampoco le dice nada al cliente; usa (o añade) una subclase de `AppError` en `errors/app-error.ts`.

### Modelo de autenticación

Dos credenciales con papeles distintos — se entiende leyendo `AuthService.refresh` junto a `TokenService`:

- **Access token**: JWT firmado de vida corta (15 min), autocontenido, verificable sin tocar la BD y por eso mismo *imposible de revocar*. El TTL corto es el techo del daño.
- **Refresh token**: cadena aleatoria opaca; en `refresh_tokens` solo se persiste su SHA-256. Al estar en la BD se puede revocar al instante.

`/refresh` **rota**: revoca el token presentado y emite un par nuevo, de modo que reutilizarlo falla. El cliente debe guardar los dos tokens nuevos.

Ambas interfaces se mantienen ajustadas a lo que los endpoints realmente llaman. Los métodos sin consumidor se eliminaron a propósito en lugar de dejarlos como superficie especulativa; devuélvelos junto con la funcionalidad que los necesite (la detección de reuso de refresh tokens querría un "revocar todas las sesiones de este usuario"; un job de limpieza querría un "borrar caducados").

Nota: el índice parcial `refresh_tokens_expires_at_idx` se creó para dar soporte a una consulta de limpieza que ya no existe, así que ahora mismo no lo consume nadie — `findActiveByHash` se resuelve por el índice único de `token_hash`.

## Convenciones

- **ESM con `module: "nodenext"`**: los imports relativos llevan extensión `.js` aunque el fuente sea `.ts`. No es una errata.
- **Express 5**: los rechazos de handlers async se propagan solos al middleware de error. Los controladores no llevan `try/catch` y no existe ningún `asyncHandler`.
- **Los métodos de los controladores son propiedades flecha**, para que `this` sobreviva al pasarlos al router por referencia sin `.bind()`.
- **Los tipos de fila son `type`, no `interface`**: `pool.query<T>()` exige que `T` sea asignable a `QueryResultRow`, y solo los alias de tipo obtienen index signature implícita.
- **Nomenclatura de archivos**: el archivo se llama como la clase que exporta (`AuthService.ts`) y su contrato lleva prefijo `I` (`IAuthService.ts`). Los módulos que no exportan una sola clase se quedan en kebab-case: `app-error.ts` (siete clases de error), `pg-error.ts`, `user.dto.ts`, `auth.schemas.ts` y los archivos de rutas.
- **Las migraciones son SQL plano** con secciones `-- Up Migration` / `-- Down Migration`, evitando la fricción de ts-node bajo ESM. Ambas direcciones deben funcionar: se espera que `migrate:down` deje el esquema limpio.
- **Todo el SQL va parametrizado** y confinado a las implementaciones de repositorio. Los repositorios seleccionan columnas explícitas en vez de `SELECT *`, para que un futuro `ALTER TABLE` no altere la forma de un tipo de fila.

## Invariantes de seguridad que conviene preservar

Son deliberadas y fáciles de romper sin querer:

- `toPublicUser()` construye la respuesta campo a campo, de modo que `password_hash` no puede escaparse a través de una columna nueva.
- El login devuelve un único 401 genérico tanto para "email desconocido" como para "contraseña incorrecta", **y además** ejecuta `passwordService.fakeCompare` en la rama del email desconocido para que el tiempo de respuesta no revele qué cuentas existen.
- Los esquemas usan `z.strictObject` y rechazan campos no declarados (un `role: "admin"` colado se corta en la validación).
- `jwt.verify` fija `algorithms: ["HS256"]`; sin eso un atacante puede presentar `alg: "none"` o forzar una confusión de algoritmo.
- `/register` y `/login` comparten un cupo estricto de rate limit; `/refresh` tiene el suyo, más holgado. Unificarlos haría que los logins fallidos consumieran el presupuesto de renovación y echaran de la sesión a usuarios legítimos.

## Añadir un módulo

Para `products`: migración → `repositories/interfaces/IProductRepository.ts` → `repositories/implementations/ProductRepository.ts` → `services/interfaces/IProductService.ts` → `services/implementations/ProductService.ts` → `validators/schemas/product.schemas.ts` + `validators/ProductValidator.ts` → `controllers/ProductController.ts` + `routes/product.routes.ts`, y luego cablearlo en `container.ts` y registrarlo en `routes/index.ts`. Esos dos últimos son los únicos archivos existentes que cambian.
