# Preformance API

API REST de autenticación construida con **Node.js + Express 5 + TypeScript + Prisma 7 + PostgreSQL**, siguiendo el **patrón repository** con inyección de dependencias por constructor.

---

## Arranque rápido

**Docker sólo aloja PostgreSQL.** La API corre en el host, con hot reload.

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
npm install
docker compose up -d --wait   # levanta la BD y espera a que esté lista
npm run migrate:up            # aplica el esquema (prisma migrate deploy)
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
│   └── HealthController.ts
├── services/
│   ├── interfaces/               · el QUÉ
│   │   ├── IAuthService.ts
│   │   ├── IHealthService.ts
│   │   ├── IPasswordService.ts
│   │   └── ITokenService.ts
│   └── implementations/          · el CÓMO
│       ├── AuthService.ts
│       ├── HealthService.ts
│       ├── PasswordService.ts    · bcrypt
│       └── TokenService.ts       · JWT + token opaco
├── repositories/
│   ├── interfaces/
│   │   ├── IHealthRepository.ts
│   │   ├── IRefreshTokenRepository.ts
│   │   └── IUserRepository.ts
│   └── implementations/          · todo lo específico de Prisma
│       ├── HealthRepository.ts
│       ├── RefreshTokenRepository.ts
│       ├── UserRepository.ts
│       └── prisma-error.ts       · traduce P2002 a ConflictError
├── validators/
│   ├── schemas/auth.schemas.ts
│   ├── AuthValidator.ts
│   └── Validator.ts
├── middlewares/
│   ├── AuthMiddleware.ts
│   ├── ErrorMiddleware.ts
│   ├── NotFoundMiddleware.ts
│   └── ValidateMiddleware.ts
├── routes/         · declaración de rutas y su cadena de middlewares
├── errors/         · jerarquía AppError y su traducción a códigos HTTP
├── dtos/           · proyecciones de salida (toPublicUser)
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
| `HealthController` | `IHealthService` |
| `HealthService` | `IHealthRepository` |

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

Ningún archivo existente cambia salvo esos dos últimos.

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

### Formato de respuesta

Éxito en registro y login:

```json
{
  "user": { "id": "uuid", "email": "ana@example.com", "name": "Ana Torres", "createdAt": "..." },
  "accessToken": "eyJ...",
  "refreshToken": "a1b2c3...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

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
| `npm run migrate:reset` | **Destructivo**: borra la BD y reaplica el historial |
| `npm run generate` | Regenera el cliente sin tocar la base de datos |
| `npm run db:studio` | Abre Prisma Studio, un GUI para inspeccionar los datos |

> **No hay migraciones `down`.** Prisma no las soporta: en desarrollo se deshace con `migrate:reset`, y en producción revertir significa escribir una migración nueva que deshaga la anterior.

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

Detalle de Prisma que conviene conocer: el cliente se genera dentro de `src/generated/prisma`, así que `tsc` lo compila a `dist/` con el resto del código. Por eso el runtime no necesita la CLI de Prisma ni copiar `node_modules/.prisma`. Los `npm ci` usan `--ignore-scripts` para que el `postinstall` no intente generar antes de que exista el esquema.

Al arrancar verás un aviso de Prisma sobre no detectar la versión de OpenSSL. Es inocuo aquí: con el driver adapter de `pg`, las conexiones las hace `pg`, no el motor Rust.

Si lo pruebas en local contra la BD del compose, `DATABASE_URL` debe apuntar a `host.docker.internal:5441` en lugar de `localhost:5441`: dentro del contenedor, `localhost` es el propio contenedor. En el despliegue real apuntará a tu base de datos gestionada. Y recuerda ejecutar `npm run migrate:up` (`prisma migrate deploy`) como paso de despliegue, antes de arrancar la nueva versión: el contenedor **no** aplica migraciones al arrancar.

---

## Fuera de alcance en esta entrega

Tests automatizados (la DI por constructor deja el terreno preparado para Vitest + Supertest con repositorios simulados), logger estructurado (`pino`), verificación de email, recuperación de contraseña y roles/permisos.
