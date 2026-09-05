# Preformance API

API REST construida con **Node.js + Express 5 + TypeScript + Prisma 7 + PostgreSQL**, siguiendo el **patrón repository** con inyección de dependencias por constructor. Incluye autenticación con tokens (access + refresh rotatorio) y, sobre esa base, un primer recurso con dueño: las tareas (`todos`).

---

## Arranque rápido

**Docker sólo aloja PostgreSQL.** La API corre en el host, con hot reload.

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
npm install
docker compose up -d --wait   # levanta la BD y espera a que esté lista
npm run migrate:up            # aplica el esquema (prisma migrate deploy)
npm run db:seed               # puebla la tabla de países (PA, US, CO)
npm run dev                   # API en http://localhost:3000
```

`--wait` bloquea hasta que el healthcheck pasa, así que las migraciones nunca se lanzan contra una base que todavía está arrancando.

Comprobación: `curl http://localhost:3000/health`

Para probar los endpoints, abre [requests.http](requests.http) en VS Code con la extensión **REST Client** — cubre los caminos felices y los de error.

### El puerto de PostgreSQL no es el 5432

El contenedor se publica en **`localhost:5441`**. Si tienes PostgreSQL instalado nativamente en la máquina —o la BD de otro proyecto en Docker— el 5432 ya está cogido y se queda con las conexiones a `localhost`. El síntoma es desconcertante: `password authentication failed` desde el host mientras que `docker compose exec db psql` funciona sin problema, porque el contenedor nunca llega a recibir esa conexión.

Si el 5441 también está ocupado, cambia `DB_PORT` **y** `DATABASE_URL` en tu `.env`. Para ver qué hay ocupado:

```powershell
docker ps --format "{{.Names}}  {{.Ports}}"
Get-NetTCPConnection -LocalPort 5441 -State Listen
```

---

## Arquitectura

El flujo de una petición atraviesa capas con una responsabilidad cada una, y cada capa sólo conoce la interfaz de la siguiente:

```
HTTP
 │
 ├─ middleware  rate limit → validate(Zod) → auth guard
 │
 ├─ controller  traduce req/res ↔ servicio. Sin lógica de negocio.
 │
 ├─ service     casos de uso. No conoce Express ni Prisma.
 │
 ├─ repository  única capa que consulta la base de datos.
 │
 └─ Prisma → PostgreSQL
```

### Estructura

Las dos capas que trabajan contra contratos —servicios y repositorios— separan el **qué** del **cómo** en carpetas hermanas: `interfaces/` declara la operación, `implementations/` la resuelve.

```
prisma/
├── schema.prisma               · FUENTE ÚNICA DE VERDAD del modelo de datos
└── migrations/                 · SQL generado desde el esquema

src/
├── generated/prisma/           · cliente tipado (generado, ignorado por git)
├── controllers/
│   ├── AuthController.ts
│   ├── CountryController.ts
│   ├── HealthController.ts
│   └── TodoController.ts
├── services/
│   ├── interfaces/               · el QUÉ
│   │   ├── IAuthService.ts
│   │   ├── ICountryService.ts
│   │   ├── IHealthService.ts
│   │   ├── IPasswordService.ts
│   │   ├── IRoleService.ts
│   │   ├── ITodoService.ts
│   │   └── ITokenService.ts
│   └── implementations/          · el CÓMO
│       ├── AuthService.ts
│       ├── CountryService.ts
│       ├── HealthService.ts
│       ├── PasswordService.ts    · bcrypt
│       ├── RoleService.ts        · verifica el catálogo de roles al arrancar
│       ├── TodoService.ts
│       └── TokenService.ts       · JWT + token opaco
├── repositories/
│   ├── interfaces/
│   │   ├── ICountryRepository.ts
│   │   ├── IHealthRepository.ts
│   │   ├── IRefreshTokenRepository.ts
│   │   ├── IRoleRepository.ts
│   │   ├── ITodoRepository.ts
│   │   └── IUserRepository.ts
│   └── implementations/          · todo lo específico de Prisma
│       ├── CountryRepository.ts
│       ├── HealthRepository.ts
│       ├── RefreshTokenRepository.ts
│       ├── RoleRepository.ts
│       ├── TodoRepository.ts
│       ├── UserRepository.ts
│       └── prisma-error.ts       · traduce P2002 / P2003 / P2025 a errores de dominio
├── validators/
│   ├── schemas/
│   │   ├── auth.schemas.ts
│   │   └── todo.schemas.ts
│   ├── AuthValidator.ts
│   ├── TodoValidator.ts
│   └── Validator.ts
├── middlewares/
│   ├── AuthMiddleware.ts
│   ├── ErrorMiddleware.ts
│   ├── NotFoundMiddleware.ts
│   └── ValidateMiddleware.ts
├── constants/      · ROLE y los códigos de rol conocidos por el código
├── routes/         · declaración de rutas y su cadena de middlewares
├── errors/         · jerarquía AppError y su traducción a códigos HTTP
├── dtos/           · proyecciones de salida (toPublicUser, toPublicTodo)
├── config/         · entorno validado con Zod, y cliente Prisma sobre un pool de pg
├── types/          · tipos de fila (derivados de Prisma) y augmentación de Express
├── container.ts    · composition root
├── app.ts          · construcción de la app Express
└── server.ts       · arranque y apagado ordenado
```

La división no es decorativa: **`implementations/` es la única carpeta que se tira a la basura al cambiar de tecnología**. Cambiar de motor de datos significa escribir un `repositories/implementations/` nuevo; cambiar bcrypt por argon2, una clase nueva en `services/implementations/`. `interfaces/` y todo lo que la consume se quedan intactos.

**Convención de nombres**: el archivo se llama igual que la clase que exporta (`AuthService.ts` → `class AuthService`) y su contrato lleva el prefijo `I` (`IAuthService.ts` → `interface IAuthService`). Los módulos que no exportan una clase única conservan kebab-case: `app-error.ts` agrupa las siete clases de error, `prisma-error.ts` y `user.dto.ts` exportan funciones, `auth.schemas.ts` exporta esquemas Zod.

### Una sola definición del modelo de datos

`prisma/schema.prisma` es la fuente de la que salen las migraciones SQL, el cliente tipado y los tipos de fila. `types/user.types.ts` ya no los declara a mano, los **deriva**:

```ts
export type UserRow            = Omit<User, "passwordHash">;  // lo normal
export type UserCredentialsRow = User;                        // solo para login
```

Añadir una columna al esquema y regenerar actualiza el tipo solo, así que tabla y tipo no pueden desincronizarse.

### Inyección de dependencias

[src/container.ts](src/container.ts) es el **composition root**: el único archivo del proyecto donde se ejecuta `new`, y el único punto donde interfaz e implementación se encuentran. En el resto del código las clases sólo se conocen por su contrato.

```ts
const { prisma, pool } = createDatabase(env);
const userRepository   = new UserRepository(prisma);
const authService      = new AuthService(userRepository, refreshTokenRepository, passwordService, tokenService);
const authController   = new AuthController(authService);
```

Cada capa declara sus dependencias como **interfaces**, nunca como clases concretas:

| Clase | Depende de |
|---|---|
| `AuthController` | `IAuthService` |
| `AuthService` | `IUserRepository`, `IRefreshTokenRepository`, `IPasswordService`, `ITokenService` |
| `AuthMiddleware` | `ITokenService` |
| `TodoController` | `ITodoService` |
| `TodoService` | `ITodoRepository` |
| `CountryController` | `ICountryService` |
| `HealthController` | `IHealthService` |

Esto es lo que hace la lógica de negocio verificable de forma aislada: `AuthService` no conoce Prisma, ni bcrypt, ni JWT, así que un test puede inyectar dobles instantáneos en lugar de levantar una base de datos y ejecutar bcrypt real (~200 ms por hash con coste 12).

### Añadir un módulo nuevo

Para `products`, por ejemplo:

1. `prisma/schema.prisma` — el modelo `Product`, y después `npm run migrate:dev`.
2. `repositories/interfaces/IProductRepository.ts` — el contrato de persistencia.
3. `repositories/implementations/ProductRepository.ts` — las consultas Prisma.
4. `services/interfaces/IProductService.ts` — el contrato de negocio.
5. `services/implementations/ProductService.ts` — la lógica.
6. `validators/schemas/product.schemas.ts` + `validators/ProductValidator.ts`.
7. `controllers/ProductController.ts` y `routes/product.routes.ts`.
8. Cablearlo en [src/container.ts](src/container.ts) y registrarlo en [src/routes/index.ts](src/routes/index.ts).

Ningún archivo existente cambia salvo esos dos últimos (y `prisma-error.ts` si el módulo necesita traducir un código de Prisma nuevo, como hizo `todos` con el `P2025`). El módulo `todos` —un recurso con dueño, protegido por `AuthMiddleware`— es el ejemplo completo de esta receta.

---

## Endpoints

Base: `/api/v1`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/health` | — | Estado de la API y de PostgreSQL (503 si la BD no responde) |
| `POST` | `/api/v1/auth/register` | — | Registro. `201` con usuario y par de tokens |
| `POST` | `/api/v1/auth/login` | — | Login. `200` con usuario y par de tokens |
| `POST` | `/api/v1/auth/refresh` | — | Canjea el refresh token por un par nuevo (lo rota) |
| `POST` | `/api/v1/auth/logout` | — | Revoca el refresh token. `204` |
| `GET` | `/api/v1/auth/me` | Bearer | Perfil del usuario autenticado |
| `GET` | `/api/v1/countries` | — | Catálogo de países. Público: el formulario de registro lo necesita antes de que exista ningún usuario |
| `GET` | `/api/v1/todos` | Bearer | Tareas del usuario autenticado. `200` con `{ todos: [...] }` |
| `POST` | `/api/v1/todos` | Bearer | Crea una tarea. `201` con `{ todo }` |
| `PATCH` | `/api/v1/todos/:id` | Bearer | Actualiza parcialmente una tarea propia. `200` con `{ todo }` |
| `DELETE` | `/api/v1/todos/:id` | Bearer | Elimina una tarea propia. `204` |

### Formato de respuesta

Éxito en registro y login:

```json
{
  "user": {
    "id": "uuid",
    "email": "ana@example.com",
    "name": "Ana Torres",
    "role": { "code": "USER", "name": "Usuario" },
    "birthDate": "1990-05-14T00:00:00.000Z",
    "country": { "code": "PA", "name": "Panama" },
    "createdAt": "..."
  },
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

`birthDate` y `country` son `null` mientras el usuario no los facilite. En `/register` ambos son **opcionales**; `role` **no se acepta** en el cuerpo.

### Campos del registro

| Campo | Obligatorio | Reglas |
|---|---|---|
| `email` | Sí | Formato válido, normalizado a minúsculas, máx. 255 |
| `password` | Sí | 8–72, con minúscula, mayúscula y dígito |
| `name` | Sí | 2–100, recortado |
| `birthDate` | No | `YYYY-MM-DD`, en el pasado, entre 18 y 120 años |
| `countryCode` | No | ISO 3166-1 alpha-2 (`PA`, `US`, `CO`), normalizado a mayúsculas, debe existir en `countries` |
| `role` | — | **Rechazado**. Lo fija el servidor con `USER` |

### Roles

`roles` es una tabla, no un enum, para poder añadir roles sin migración y describirlos desde la base de datos. Vienen `USER` y `ADMIN`, **insertados por la propia migración**: un usuario no puede existir sin rol, así que el esquema nunca queda en un estado donde registrarse sea imposible. El seeder los repite con `upsert`, lo que permite reparar una fila borrada sin recurrir a `migrate:reset`.

El precio de la tabla es que `user.role.code` es un `string` para TypeScript: una comparación contra `"ADMNI"` compilaría y denegaría el acceso en silencio. Dos defensas contra eso:

1. **Compara siempre contra `ROLE`** de [src/constants/roles.ts](src/constants/roles.ts), nunca contra literales:
   ```ts
   if (user.role.code === ROLE.ADMIN)   // el compilador valida la propiedad
   ```
2. **El arranque verifica el catálogo.** `RoleService.assertKnownRolesExist()` corre antes de escuchar y aborta el proceso si falta algún código de `ROLE` en la tabla. Un desajuste entre código y datos revienta el arranque con un mensaje concreto en lugar de manifestarse como un permiso denegado inexplicable.

Para tener un ADMIN se usa el seed: define `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` en el `.env` y lanza `npm run db:seed`. **Crea como mucho uno**: si ya existe cualquier usuario ADMIN no hace nada, ni siquiera al cambiar `SEED_ADMIN_EMAIL`. Y si no hay ninguno pero el email ya está registrado, lo promociona sin tocar su contraseña. No hay guard `requireRole` todavía.

### Tareas

El primer recurso que **pertenece a un usuario**. Todos los endpoints exigen `Bearer`, y el dueño de cada tarea sale del token, nunca de la URL ni del cuerpo:

- **`GET /api/v1/todos`** devuelve sólo las tareas del usuario autenticado, de la más reciente a la más antigua. No hay `/todos/user/:id`: no existe forma de pedir las de otro.
- **`POST`** acepta `title` (obligatorio, 1–200 tras recortar) y `description` (opcional, máx. 2000). `userId` y `completed` **se rechazan** en el cuerpo — el primero lo pone el token, el segundo nace en `false`.
- **`PATCH`** es parcial: manda sólo los campos que cambian, y al menos uno. `title` vacío se rechaza también aquí; `description: null` la borra, omitirla la deja intacta.
- **`DELETE`** responde `204`, o `404` si la tarea no existe **o es de otro usuario** — no se distinguen los dos casos a propósito.

Que el `userId` no sea manipulable se apoya en tres barreras alineadas: `strictObject` no lo declara en el esquema, el controlador lo toma de `req.user`, y el repositorio no ofrece ninguna consulta sin él. Tocar una tarea ajena da `404`, no `403`: la respuesta no confirma que ese identificador exista.

Todos los errores salen con la misma forma:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son validos",
    "details": { "password": ["La contrasena debe incluir al menos un numero"] }
  }
}
```

| Código HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `INVALID_JSON` | El cuerpo no es JSON parseable |
| 401 | `UNAUTHORIZED` | Credenciales inválidas, token ausente, caducado o manipulado |
| 404 | `NOT_FOUND` | Ruta o recurso inexistente |
| 409 | `CONFLICT` | Email ya registrado |
| 412 | `PRECONDITION_FAILED` | Falla una precondición del cliente (`If-Match`): el recurso cambió desde que lo leyó |
| 422 | `VALIDATION_ERROR` | Falla el esquema Zod (incluye `details` por campo) |
| 429 | `TOO_MANY_REQUESTS` | Se agotó el cupo del rate limiter |
| 500 | `INTERNAL_SERVER_ERROR` | Fallo no previsto (sin detalles en producción) |

---

## Decisiones de seguridad

Vale la pena conocer las que no son obvias al leer el código:

- **Contraseñas**: bcrypt con coste 12 (`$2b$12$`). Nunca se almacena ni se registra la contraseña en claro.
- **`omit` global sobre `passwordHash`**: Prisma devuelve el modelo completo por defecto, así que el cliente lleva configurado que el hash no salga de la base de datos. Sólo lo desactiva `UserRepository.findCredentialsByEmail` — se llama así, y no `findByEmail`, para que ese único camino salte a la vista al auditar el código. Encima, `toPublicUser()` construye la respuesta campo a campo, así que un campo nuevo del modelo tampoco se filtra solo.
- **Access token vs refresh token**: el access token es un JWT corto (15 min) y autocontenido — no se puede revocar, sólo caducar. El refresh token es una cadena **opaca** aleatoria de 384 bits cuyo **SHA-256** es lo único que se guarda: quien lea la tabla no obtiene ningún token utilizable.
- **Rotación de refresh tokens**: cada `/refresh` revoca el token entregado y emite uno nuevo. Un token robado sirve una sola vez, y el robo se hace visible porque quien llegue segundo recibe un 401.
- **Enumeración de usuarios**: login con email inexistente y login con contraseña incorrecta devuelven el mismo `401` y el mismo mensaje. Además, cuando el email no existe se ejecuta un `bcrypt.compare` contra un hash ficticio para que ambos caminos tarden lo mismo — sin eso, el tiempo de respuesta delataría qué cuentas existen.
- **`strictObject` en los esquemas**: rechaza campos no declarados, de modo que un `{"role": "admin"}` colado en el registro se corta en la validación en lugar de confiar en que ninguna capa posterior lo lea.
- **Verificación de JWT con `algorithms: ["HS256"]`**: sin restringir el algoritmo, un atacante puede presentar un token con `alg: "none"` o provocar una confusión de algoritmo.
- **Dos rate limiters con cupos independientes**: `/register` y `/login` comparten un cupo estricto (10 / 15 min); `/refresh` tiene el suyo, más holgado (60 / 15 min). Compartir uno solo haría que los intentos de login fallidos consumieran el presupuesto de renovación y echaran de la sesión a usuarios legítimos.
- **Secretos fuera de la imagen**: `.env` está en `.dockerignore`, así que nunca se hornea en una capa al construir la imagen de producción; las variables se inyectan en tiempo de ejecución.
- **Imagen de producción sin privilegios**: la etapa `runtime` del [Dockerfile](Dockerfile) corre como usuario `node`, sólo con dependencias de producción y JavaScript ya compilado.

> El `.env` incluido trae un `JWT_ACCESS_SECRET` generado al crear el proyecto. Genera uno nuevo antes de usar esto fuera de tu máquina:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente (tsx watch) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta la build de producción |
| `npm run typecheck` | Comprueba tipos sin emitir |
| `npm run migrate:dev` | Tras editar `schema.prisma`: crea la migración, la aplica y regenera el cliente |
| `npm run migrate:up` | Aplica las migraciones pendientes (`prisma migrate deploy`, para producción) |
| `npm run migrate:create` | Genera la migración **sin aplicarla**, para editar el SQL a mano antes (índices parciales, triggers y demás que el esquema no sabe expresar) |
| `npm run migrate:status` | Qué migraciones están aplicadas |
| `npm run migrate:reset` | **Destructivo**: borra la BD, reaplica el historial y vuelve a sembrar |
| `npm run generate` | Regenera el cliente sin tocar la base de datos |
| `npm run db:seed` | Puebla los datos maestros (países) y, si `SEED_ADMIN_EMAIL` está definido, crea el administrador. Idempotente |
| `npm run db:studio` | Abre Prisma Studio, un GUI para inspeccionar los datos |

> **No hay migraciones `down`.** Prisma no las soporta: en desarrollo se deshace con `migrate:reset`, y en producción revertir significa escribir una migración nueva que deshaga la anterior.

> **El seed no se ejecuta solo.** En Prisma 7, `prisma db seed` es el único comando que siembra: ningún comando de migración lo encadena, `migrate reset` incluido. Por eso `migrate:reset` lo invoca de forma explícita en el `package.json`. Tras aplicar migraciones sobre una base nueva con `migrate:up`, lanza `npm run db:seed` tú.

---

## Convenciones del código

- **ESM nativo**: los imports relativos llevan extensión `.js` aunque el fuente sea `.ts`. Es el comportamiento de `module: "nodenext"`, no una errata.
- **Sin `try/catch` en los controladores**: Express 5 propaga solo los rechazos de handlers `async` al middleware de error.
- **Métodos de controlador como propiedades flecha**: conserva el `this` al pasarlos al router por referencia, sin `.bind()`.
- **Los tipos de fila se derivan, no se escriben**: `UserRow` sale del cliente que Prisma genera desde el esquema. Si tocas `schema.prisma`, ejecuta `npm run generate` o nada compilará contra el modelo nuevo.
- **Los repositorios reciben `AppPrismaClient`, no `PrismaClient`**: el `omit` global estrecha los tipos de retorno del cliente, así que el tipo se deriva en `config/database.ts` con `ReturnType<typeof instantiatePrisma>`.
- **El archivo se llama como la clase, y su contrato lleva prefijo `I`**: `AuthService.ts` / `IAuthService.ts`. Los tipos que forman parte del contrato viven junto a la interfaz (`AccessTokenPayload` en `ITokenService.ts`); los que son detalle de implementación, junto a la clase (`TokenServiceConfig` en `TokenService.ts`).

---

## Notas de desarrollo

- **Inspeccionar datos**: `npm run db:studio` abre Prisma Studio en el navegador. Es lo más cómodo y no requiere instalar nada.
- **Conectarse con otro cliente** (DBeaver, psql, la extensión de VS Code): `localhost:5441`, usuario / contraseña / BD `preformance`. Todo configurable en `.env`.
- **Una consulta rápida sin cliente**: `docker compose exec db psql -U preformance -d preformance -c "SELECT email, name FROM users;"`
- **Parar la base de datos** conservando los datos: `docker compose down`. El volumen `preformance_pgdata` sobrevive.
- **Empezar de cero**, borrando también los datos: `docker compose down -v`.

---

## Despliegue

El [Dockerfile](Dockerfile) **no interviene en el arranque local** — existe sólo para empaquetar la API de cara a producción:

```bash
docker build --target runtime -t preformance-api:prod .
docker run --rm -p 3000:3000 --env-file .env preformance-api:prod
```

Multi-stage: `deps` → `build` (genera el cliente Prisma y compila con `tsc`) → `runtime`. La imagen final lleva únicamente `dist/` y las dependencias de producción, y corre como usuario `node`.

Detalle de Prisma que conviene conocer: el cliente se genera dentro de `src/generated/prisma`, así que `tsc` lo compila a `dist/` con el resto del código. Por eso el runtime no necesita *generar* nada. Sí lleva la CLI de Prisma —`prisma` es dependencia de producción, no de desarrollo— porque las migraciones se aplican desde esta misma imagen como paso de despliegue.

Los `npm ci` usan `--ignore-scripts` para que el `postinstall` no intente generar antes de que exista el esquema. Eso se salta también el `postinstall` de `@prisma/engines`, que es quien descarga el binario `schema-engine`; el runtime lo recupera con un `npm rebuild @prisma/engines` explícito, todavía como `root`. Sin ese paso, `prisma migrate deploy` intentaría descargarlo en tiempo de ejecución y fallaría, porque el contenedor corre como `node` y `node_modules` pertenece a `root`.

La etapa `runtime` instala `openssl`: la imagen slim no lo trae y Prisma lo necesita para detectar la versión de libssl y elegir el binario correcto del motor de migraciones.

Si lo pruebas en local contra la BD del compose, `DATABASE_URL` debe apuntar a `host.docker.internal:5441` en lugar de `localhost:5441`: dentro del contenedor, `localhost` es el propio contenedor. En el despliegue real apuntará a tu base de datos gestionada. Y recuerda ejecutar `npm run migrate:up` (`prisma migrate deploy`) como paso de despliegue, antes de arrancar la nueva versión: el contenedor **no** aplica migraciones al arrancar.

### Railway

[`railway.json`](railway.json) lleva la configuración del despliegue en el repo en vez de en el panel: constructor `DOCKERFILE`, healthcheck contra `/health` y, sobre todo, el **pre-deploy**.

Ese `preDeployCommand` no es opcional. `server.ts` verifica el catálogo de roles antes de escuchar y hace `process.exit(1)` si falta alguno, así que una base sin migrar deja la API en un ciclo de reinicios. El pre-deploy corre `prisma migrate deploy` sobre la imagen ya construida, antes de levantar el contenedor nuevo y sin cortar el tráfico al viejo; si falla, el despliegue se aborta y la versión anterior sigue sirviendo.

Variables a configurar en el servicio (el resto tiene valores por defecto en `config/env.ts`, y `PORT` lo inyecta Railway):

```
DATABASE_URL      = ${{Postgres.DATABASE_URL}}   # referencia al servicio, no pegar a mano
JWT_ACCESS_SECRET = <32+ caracteres>
CORS_ORIGIN       = https://tu-front.com         # no dejar en "*"
```

**El seed hay que lanzarlo a mano, una vez.** No es una limitación de la imagen: en Prisma 7 el seed nunca es automático. Y desde el contenedor tampoco puede correr, porque `prisma.config.ts` lo ejecuta con `tsx`, que es dependencia de desarrollo. Desde tu máquina, contra la URL pública:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>?sslmode=require" npm run db:seed
```

Es idempotente (`upsert`), así que repetirlo no rompe nada. Sin él, `countries` queda vacía y **todo registro con `countryCode` responde 422** por la clave foránea. Los roles no dependen del seed: los inserta su propia migración.

Dos avisos. El `postgres.railway.internal` de la red privada sólo resuelve por IPv6: si al arrancar ves `ENOTFOUND`, prueba con `DATABASE_PUBLIC_URL` y `?sslmode=require` para aislar el problema. Y `DB_POOL_MAX` vale 10 por defecto, que se multiplica por réplica; con dos o más, bájalo.

---

## Fuera de alcance en esta entrega

Tests automatizados (la DI por constructor deja el terreno preparado para Vitest + Supertest con repositorios simulados), logger estructurado (`pino`), verificación de email, recuperación de contraseña y roles/permisos.
