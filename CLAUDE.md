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

`prisma/seed.ts` es solo el orquestador: abre la conexión, encadena los sembradores de `prisma/seeds/` (`roles.ts`, `countries.ts`, `admin.ts`) y la cierra. Cada uno devuelve un resumen y el orquestador lo registra. Añadir un conjunto de datos son dos líneas en `seed.ts` y un archivo en `seeds/`. **El orden importa**: el administrador va después de los roles, porque `users.role_code` es clave foránea de `roles`.

**Nada ejecuta el seed por ti.** En Prisma 7 `prisma db seed` es el único comando que siembra: no lo encadenan ni `migrate deploy`, ni `migrate dev`, ni `migrate reset`. El flag `--skip-seed` que existía en Prisma 6 ya no aparece en `migrate reset --help`, precisamente porque no queda nada que saltarse.

Por eso el script `migrate:reset` llama a `prisma db seed` de forma explícita. Una base migrada pero sin sembrar deja `countries` vacía, y entonces **todo registro con `countryCode` falla con 422** porque la clave foránea no encuentra el país.

Los **roles** son la excepción: `USER` y `ADMIN` los inserta la propia migración `roles_table`, no el seeder, porque un usuario no puede existir sin rol y el esquema nunca debe quedar en un estado donde registrarse sea imposible. El seeder los repite con `upsert` para poder reparar una fila borrada sin un `migrate:reset` destructivo.

## El administrador inicial

`prisma/seeds/admin.ts` crea un usuario con rol ADMIN si `SEED_ADMIN_EMAIL` está en el entorno (con `SEED_ADMIN_PASSWORD` y, opcional, `SEED_ADMIN_NAME`). Es la única vía para tener un ADMIN, porque `/register` no permite autoasignarse rol.

**Esas tres variables no están en `config/env.ts` y no deben estarlo.** La API no las usa, así que la contraseña del administrador no tiene por qué vivir en el entorno de producción: basta con tenerla en el momento de sembrar. El prefijo `SEED_` marca esa frontera. Por lo mismo, el seed no importa `config/env.ts`: exigiría `JWT_ACCESS_SECRET` y compañía para sembrar una base remota desde una máquina de desarrollo.

Se validan con `emailField` y `passwordField`, exportados de `auth.schemas.ts` — las mismas reglas que `/register`, así que una clave que el seed acepta es una que la API aceptaría. Reutilizar `emailField` importa por algo más que la coherencia: normaliza a minúsculas, y `AuthService` busca así al hacer login. Un admin sembrado con mayúsculas sería una cuenta imposible de usar.

Resuelve **dos comprobaciones distintas**, y no conviene confundirlas — son reglas independientes, con motivos distintos:

1. **Por rol**: ¿hay ya un ADMIN? Limita *cuántos administradores* hay. Si existe alguno, el seed no crea un segundo, sea quien sea.
2. **Por email**: ¿existe ya esa cuenta? Limita *cuántas cuentas* hay. Si existe, no se crea otra con el mismo email — chocaría con el `UNIQUE` de `users.email` — y como mucho se promociona.

Las dos se ejecutan **siempre, en paralelo, no en cascada**. Encadenarlas hacía que la primera tapase a la segunda: cuando ya había ADMIN, el seed ni miraba si el email pedido existía, y el mensaje no podía decirlo. Comprobar solo el email fue además el fallo original — bastaba cambiar `SEED_ADMIN_EMAIL` y volver a sembrar para acabar con dos administradores.

| ¿Hay ADMIN? | ¿Existe el email? | Qué hace |
|---|---|---|
| No | No | Crea el usuario con rol ADMIN |
| No | Sí | Lo promociona, **sin tocar su contraseña** |
| Sí, y es ese email | — | Nada: `ya es el ADMIN` |
| Sí, otro | No | Nada: `ya hay un ADMIN (x); y no existe y no se creara` |
| Sí, otro | Sí | Nada: `ya hay un ADMIN (x); y existe y se queda como USER` |
| `SEED_ADMIN_EMAIL` sin definir | — | Nada |

Cambiar `SEED_ADMIN_EMAIL` sobre una base que ya tiene administrador **no lo sustituye**. Los tres mensajes de «ya hay ADMIN» se distinguen a propósito, porque lo que hay que hacer después es distinto en cada uno: una configuración que no surte efecto en silencio es peor que una que falla.

Lo garantiza el seeder, no el esquema: `users` no impide varios ADMIN, así que promocionar a un segundo por otra vía sigue siendo posible a propósito. Si algún día debe ser una invariante de datos, el sitio es un índice único parcial sobre `role_code`, editando a mano el SQL de una migración.

**Nunca reescribe una contraseña.** Rehashear en cada ejecución convertiría un `db:seed` lanzado para corregir un país en un reseteo silencioso de la clave del administrador, también en producción; y como bcrypt genera una sal distinta cada vez, no hay forma de detectar que «no ha cambiado» y saltarse la escritura. **Para rotarla hay que borrar la fila y volver a sembrar.** En cambio, un dato inválido no se omite: falla en voz alta, porque si alguien declaró el admin, un error de configuración es algo que hay que ver.

**`npm run typecheck` no cubre nada bajo `prisma/`**: el `include` del tsconfig es `src/**/*.ts`. El seed se verifica ejecutándolo.

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

## Despliegue

La configuración de Railway vive en `railway.json` (constructor `DOCKERFILE`, healthcheck a `/health` y `preDeployCommand`), no en el panel.

**Las migraciones son un paso de pre-despliegue, no del arranque.** `server.ts` verifica el catálogo de roles antes de `listen` y sale con 1 si falta alguno, así que una base sin migrar deja la API en un ciclo de reinicios. El pre-deploy ejecuta `prisma migrate deploy` sobre la imagen ya construida, antes de levantar el contenedor nuevo.

Eso obliga a dos cosas en el `Dockerfile`, y ambas son fáciles de deshacer sin querer:

1. **`prisma` es dependencia de producción, no de desarrollo.** Devolverla a `devDependencies` deja la etapa `runtime` sin CLI y el pre-deploy se pondría a descargar Prisma de npm en cada despliegue.
2. **`npm rebuild @prisma/engines` tras el `npm ci`.** El `--ignore-scripts` que evita un `prisma generate` prematuro se salta también el `postinstall` que descarga el binario `schema-engine`. Sin recuperarlo como `root`, `migrate deploy` intenta bajarlo en ejecución y falla: el contenedor corre como `node` sobre un `node_modules` de `root`.

El `datasource` de `schema.prisma` no declara `url`, así que la imagen necesita `prisma.config.ts` para conocer la cadena de conexión. Es TypeScript, pero el CLI lo carga con jiti (vía `@prisma/config` → `c12`) sin necesitar `tsx` ni `typescript`.

**El seed sí se lanza a mano, una vez por entorno**, porque `prisma.config.ts` lo ejecuta con `tsx` y esa sí es dependencia de desarrollo: `DATABASE_URL="<url pública>?sslmode=require" npm run db:seed` desde tu máquina.

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

### El módulo de tareas (`todos`)

Primer recurso del proyecto que **pertenece a un usuario**, y por eso el que fija el patrón para los siguientes. Endpoints en `routes/todo.routes.ts`, todos bajo `authMiddleware.handle`: `GET /todos` (las del token), `POST /todos`, `PATCH /todos/:id`, `DELETE /todos/:id`.

**El `userId` no es un parámetro, es una constante del token.** Es la única regla dura del módulo, y se sostiene con tres barreras alineadas, igual que el rol no autoasignable de `/register`:

1. **El esquema Zod.** `createTodoSchema` y `updateTodoSchema` son `z.strictObject` y **no declaran `userId`**: un `{"title":"x","userId":"<ajeno>"}` se corta con 422 antes de llegar al servicio.
2. **El controlador.** `TodoController.userIdOf(req)` lo saca de `req.user.id`, que rellena `AuthMiddleware` tras verificar la firma. No hay otra fuente.
3. **El repositorio.** Ningún método de `ITodoRepository` acepta un `id` sin su `userId` al lado — no existe un `findById(id)` que llamar por descuido. La comprobación de propiedad está en la firma, así que no se puede olvidar.

De ahí sale el **404** (no 403) al tocar una tarea ajena: el `where` lleva siempre `{ id, userId }`, así que una tarea de otro y una inexistente recorren el mismo camino y devuelven lo mismo. El mensaje único `"Tarea no encontrada"` vive en `TodoService`, con el mismo criterio que el 401 genérico del login: distinguir los casos regalaría un oráculo para saber qué identificadores existen. Por la misma razón `DELETE` no es idempotente como `/logout`: aquí callar ocultaría al usuario que su petición no hizo nada.

`updateByIdAndUserId` mete el `userId` en el `where` del propio `UPDATE` (Prisma lo permite junto a la clave única), no en un `SELECT` previo: no hay ventana entre comprobar la propiedad y escribir. `deleteByIdAndUserId` usa `deleteMany` para recibir un contador en vez de una excepción cuando no hay fila.

`title` se valida con `.trim()` **antes** de `.min(1)`, en creación y en actualización, para que `"   "` no pase como título. El mensaje se parametriza (`titleField(mensaje)`): al crear es *"El titulo es obligatorio"*; en el PATCH, donde el campo es opcional, es *"El titulo no puede estar vacio"* — un único mensaje mentiría en uno de los dos. `description` en `updateTodoSchema` es `.nullable()` además de opcional: `undefined` significa "no la toques", `null` significa "bórrala".

Índice de `todos`: uno solo, compuesto `(user_id, created_at)`. Cubre el listado entero —filtrar por usuario y ordenar por fecha descendente— sin ordenación en memoria, y al ser `user_id` el prefijo izquierdo sirve también al borrado en cascada. Un índice suelto sobre `user_id`, como el de `refresh_tokens`, sería redundante encima de este.

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
- Los esquemas usan `z.strictObject` y rechazan campos no declarados. **De esto depende que el rol no sea autoasignable**: ni `role` ni `roleCode` están en `registerSchema`, así que colarlos en el cuerpo da 422 en vez de llegar al servicio. `CreateUserData` tampoco los incluye, y el valor lo fija el `@default("USER")` de la columna escalar. Son tres barreras alineadas: relajar `strictObject` a `z.object` derriba la primera de golpe. Promocionar a ADMIN se hace por el seed, no por la API: ver «El administrador inicial».
- **La misma alineación protege el `userId` de un `todo`**: no está en `createTodoSchema` ni en `updateTodoSchema`, el controlador lo toma de `req.user.id`, y `ITodoRepository` no ofrece ninguna consulta que no lo lleve en la firma. Ver «El módulo de tareas» más arriba.
- `jwt.verify` fija `algorithms: ["HS256"]`; sin eso un atacante puede presentar `alg: "none"` o forzar una confusión de algoritmo.
- `/register` y `/login` comparten un cupo estricto de rate limit; `/refresh` tiene el suyo, más holgado. Unificarlos haría que los logins fallidos consumieran el presupuesto de renovación y echaran de la sesión a usuarios legítimos.

## Añadir un módulo

Para `products`: modelo en `prisma/schema.prisma` + `npm run migrate:dev` → `repositories/interfaces/IProductRepository.ts` → `repositories/implementations/ProductRepository.ts` → `services/interfaces/IProductService.ts` → `services/implementations/ProductService.ts` → `validators/schemas/product.schemas.ts` + `validators/ProductValidator.ts` → `controllers/ProductController.ts` + `routes/product.routes.ts`, y luego cablearlo en `container.ts` y registrarlo en `routes/index.ts`. Esos dos últimos son los únicos archivos existentes que cambian.

El módulo `todos` es el ejemplo completo de esa receta: un recurso con dueño, protegido por `AuthMiddleware`, con validación de parámetros de ruta y un `prisma-error.ts` que gana un helper (`isRecordNotFoundError`, para el `P2025`) en vez de dejar que el código de Prisma se escape del repositorio.

Los DTO de entrada se siguen definiendo con Zod a mano. Un generador tipo `zod-prisma-types` derivaría del esquema los tipos, longitudes y nulabilidad, pero no reglas de negocio como "la contraseña debe llevar una mayúscula" ni el `.strictObject` que rechaza campos no declarados. El esquema Prisma describe la tabla; el esquema Zod describe qué acepta la API. Son cosas distintas y ambas hacen falta.
