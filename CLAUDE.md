# CLAUDE.md

Este archivo orienta a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

## Comandos

```bash
docker compose up -d --wait   # arranca PostgreSQL (en Docker solo está la BD)
npm run migrate:up            # aplica las migraciones pendientes (prisma migrate deploy)
npm run dev                   # API en http://localhost:3000, hot reload con tsx

npm run typecheck             # tsc --noEmit
npm run build                 # compila a dist/
npm start                     # ejecuta la build compilada

npm run migrate:dev           # tras editar schema.prisma: crea migración, la aplica y regenera
npm run generate              # regenera el cliente sin tocar la BD
npm run migrate:status        # qué migraciones están aplicadas
npm run migrate:reset         # DESTRUCTIVO: borra la BD y reaplica todo
npm run db:seed               # datos maestros (países). Idempotente, con upsert
npm run db:studio             # GUI para inspeccionar datos
```

**El seed no lo ejecutan las migraciones.** En Prisma 7 hay que lanzarlo aparte; el único comando que lo encadena es `migrate:reset`. Una base migrada pero sin sembrar deja `countries` vacía, y entonces **todo registro con `countryCode` falla con 422** porque la clave foránea no encuentra el país.

Los **roles** son la excepción: `USER` y `ADMIN` los inserta la propia migración `roles_table`, no el seeder, porque un usuario no puede existir sin rol y el esquema nunca debe quedar en un estado donde registrarse sea imposible. El seeder los repite con `upsert` para poder reparar una fila borrada sin un `migrate:reset` destructivo.

## Roles: tabla, no enum

`roles` es una tabla para poder añadir roles sin migración y describirlos desde la BD. A cambio, `user.role.code` es un `string` para TypeScript: `=== "ADMNI"` compilaría y denegaría el acceso en silencio. Dos defensas, y hay que respetarlas:

1. **Nunca compares contra literales.** Usa `ROLE.ADMIN` de `constants/roles.ts`, donde el compilador valida la propiedad.
2. **El arranque verifica el catálogo.** `RoleService.assertKnownRolesExist()` corre en `server.ts` antes de `listen` y aborta el proceso si falta algún código de `ROLE`. Añadir un rol al código sin sembrarlo hace que la API no arranque, que es exactamente lo que se busca.

Al añadir un rol hay que tocar tres sitios: `ROLE` en `constants/roles.ts`, la lista del seeder, y una migración que lo inserte.

**Tras cambiar `prisma/schema.prisma` hay que ejecutar `npm run migrate:dev`** (o al menos `npm run generate`), o el cliente en `src/generated/prisma` se queda viejo y nada compila contra el esquema nuevo. El `postinstall` ejecuta `prisma generate`, así que un clon recién instalado ya arranca.

**No hay migraciones `down`.** Prisma no las soporta: para deshacer en desarrollo se usa `migrate:reset`, que borra la base y reaplica el historial. En producción, revertir significa escribir una migración nueva que deshaga la anterior.

**No hay framework de tests configurado.** La verificación es manual: `requests.http` (extensión REST Client de VS Code) cubre el camino feliz y los de error de cada endpoint. Si añades un runner, la inyección por constructor permite probar los servicios con dobles: sin base de datos y sin bcrypt.

## Trampas del entorno

- **PostgreSQL se publica en el puerto 5441 del host, no en el 5432.** Esta máquina tiene un PostgreSQL 15 instalado nativamente en el 5432, más los contenedores de otros proyectos ocupando del 5433 al 5440. Conectar a `localhost:5432` llega a la instancia *nativa* y falla con `password authentication failed`, mientras que `docker compose exec db psql` funciona sin problema: el contenedor nunca recibe esa conexión. `DB_PORT` y `DATABASE_URL` del `.env` deben ir sincronizados.
- La API **no** corre en Docker. `docker-compose.yml` tiene un único servicio `db`. El `Dockerfile` sirve solo para empaquetar la imagen de producción (`docker build --target runtime`); no interviene en el arranque local.
- `.env` está en `.dockerignore`, así que nunca llega a una capa de la imagen. `config/env.ts` importa `dotenv/config` y valida cada variable con Zod al cargar el módulo, de modo que un entorno mal configurado falla al arrancar con un mensaje concreto en vez de reventar a mitad de una petición.

## Arquitectura

Flujo de una petición; cada capa conoce solo la interfaz de la siguiente:

```
rate limit → validate(Zod) → auth guard → controller → service → repository → Prisma → PostgreSQL
```

### El esquema de datos manda

`prisma/schema.prisma` es la **fuente única de verdad**. De ahí salen tres cosas, y ninguna se escribe a mano:

1. Las migraciones SQL de `prisma/migrations/`.
2. El cliente tipado en `src/generated/prisma/` (ignorado por git; lo reconstruye `prisma generate`).
3. Los tipos de fila: `types/user.types.ts` ya no los declara, los **deriva** del cliente (`UserRow = Omit<User, "passwordHash">`).

Por eso añadir una columna no puede desincronizar el tipo de la tabla: el tipo no existe hasta que se regenera desde el esquema.

**`src/container.ts` es el composition root**: el único archivo del proyecto que llama a `new` y el único punto donde una interfaz se encuentra con su implementación. Todo lo demás depende de contratos (`IAuthService`, `ITokenService`, `IUserRepository`…). Esto sostiene el diseño: renombrar o mover una clase de implementación toca exactamente un consumidor.

Servicios y repositorios separan el *qué* del *cómo* en carpetas hermanas:

- `interfaces/` — el contrato, junto con los tipos que forman parte de él (`AccessTokenPayload` vive en `ITokenService.ts`).
- `implementations/` — la clase concreta y sus tipos de detalle (`TokenServiceConfig` vive en `TokenService.ts`).

`implementations/` es la carpeta que se tira a la basura al cambiar de tecnología: todo lo específico de Prisma está bajo `repositories/implementations/` (incluido `prisma-error.ts`, que traduce el código `P2002` a `ConflictError` para que los servicios nunca vean errores de Prisma); bcrypt existe solo en `PasswordService.ts` y JWT solo en `TokenService.ts`.

Con Prisma los repositorios son finos —`findById` es un `findUnique`—, y eso es esperable: `PrismaClient` ya *es* una capa de acceso a datos. La interfaz sigue ganándose el sitio porque los servicios dependen de `IUserRepository`, no del cliente, así que se pueden probar con dobles y los tipos de Prisma no se filtran hacia arriba.

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

Índices de `refresh_tokens`: el único de `token_hash` (que es el que resuelve `findActiveByHash`) y uno sobre `user_id` para el borrado en cascada. El índice parcial que existía antes desapareció al pasar a Prisma, que no sabe expresarlos en el esquema — no se echa en falta porque su consumidor tampoco existe ya. Si algún día hace falta uno parcial, se añade editando a mano el SQL de una migración generada.

## Convenciones

- **ESM con `module: "nodenext"`**: los imports relativos llevan extensión `.js` aunque el fuente sea `.ts`. No es una errata. Aplica también al cliente generado: `../generated/prisma/client.js`, nunca `../generated/prisma`.
- **Express 5**: los rechazos de handlers async se propagan solos al middleware de error. Los controladores no llevan `try/catch` y no existe ningún `asyncHandler`.
- **Los métodos de los controladores son propiedades flecha**, para que `this` sobreviva al pasarlos al router por referencia sin `.bind()`.
- **Los repositorios reciben `AppPrismaClient`, no `PrismaClient`**. El `omit` global estrecha los tipos de retorno del cliente, así que `PrismaClient` a secas no describe la instancia real. El tipo se deriva en `config/database.ts` con `ReturnType<typeof instantiatePrisma>`.
- **Prisma 7 exige un driver adapter**: `new PrismaClient()` sin argumentos lanza, y `datasourceUrl` ya no existe. Se usa `@prisma/adapter-pg` sobre un `pg.Pool` propio, lo que permite seguir controlando `max` y los timeouts desde el entorno.
- **Nomenclatura de archivos**: el archivo se llama como la clase que exporta (`AuthService.ts`) y su contrato lleva prefijo `I` (`IAuthService.ts`). Los módulos que no exportan una sola clase se quedan en kebab-case: `app-error.ts` (siete clases de error), `prisma-error.ts`, `user.dto.ts`, `auth.schemas.ts` y los archivos de rutas.
- **Las consultas viven solo en las implementaciones de repositorio.** Ningún servicio ni controlador toca `prisma`. Si algún día hace falta SQL crudo, va por `$queryRaw` **dentro de un repositorio**, nunca fuera.

## Invariantes de seguridad que conviene preservar

Son deliberadas y fáciles de romper sin querer:

- **`omit` global sobre `passwordHash`** en `config/database.ts`: Prisma devuelve el modelo completo por defecto, así que sin esto el hash viajaría en cada consulta. El único sitio que lo desactiva es `UserRepository.findCredentialsByEmail`, que se llama así —y no `findByEmail`— precisamente para que sea visible en cualquier auditoría. Su tipo de retorno es `UserCredentialsRow`, que no debe salir de `AuthService`.
- `toPublicUser()` construye la respuesta campo a campo, de modo que un campo nuevo del modelo no puede escaparse solo. Además acepta `UserRow`, que ya no tiene `passwordHash`, así que el hash ni siquiera es visible desde ahí.
- El login devuelve un único 401 genérico tanto para "email desconocido" como para "contraseña incorrecta", **y además** ejecuta `passwordService.fakeCompare` en la rama del email desconocido para que el tiempo de respuesta no revele qué cuentas existen.
- Los esquemas usan `z.strictObject` y rechazan campos no declarados. **De esto depende que el rol no sea autoasignable**: ni `role` ni `roleCode` están en `registerSchema`, así que colarlos en el cuerpo da 422 en vez de llegar al servicio. `CreateUserData` tampoco los incluye, y el valor lo fija el `@default("USER")` de la columna escalar. Son tres barreras alineadas: relajar `strictObject` a `z.object` derriba la primera de golpe. Promocionar a ADMIN es hoy una operación manual (Prisma Studio o SQL).
- `jwt.verify` fija `algorithms: ["HS256"]`; sin eso un atacante puede presentar `alg: "none"` o forzar una confusión de algoritmo.
- `/register` y `/login` comparten un cupo estricto de rate limit; `/refresh` tiene el suyo, más holgado. Unificarlos haría que los logins fallidos consumieran el presupuesto de renovación y echaran de la sesión a usuarios legítimos.

## Añadir un módulo

Para `products`: modelo en `prisma/schema.prisma` + `npm run migrate:dev` → `repositories/interfaces/IProductRepository.ts` → `repositories/implementations/ProductRepository.ts` → `services/interfaces/IProductService.ts` → `services/implementations/ProductService.ts` → `validators/schemas/product.schemas.ts` + `validators/ProductValidator.ts` → `controllers/ProductController.ts` + `routes/product.routes.ts`, y luego cablearlo en `container.ts` y registrarlo en `routes/index.ts`. Esos dos últimos son los únicos archivos existentes que cambian.

Los DTO de entrada se siguen definiendo con Zod a mano. Un generador tipo `zod-prisma-types` derivaría del esquema los tipos, longitudes y nulabilidad, pero no reglas de negocio como "la contraseña debe llevar una mayúscula" ni el `.strictObject` que rechaza campos no declarados. El esquema Prisma describe la tabla; el esquema Zod describe qué acepta la API. Son cosas distintas y ambas hacen falta.
