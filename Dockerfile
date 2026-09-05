# syntax=docker/dockerfile:1
#
# ESTE ARCHIVO NO INTERVIENE EN EL ARRANQUE LOCAL.
#
# En desarrollo solo PostgreSQL corre en Docker (ver docker-compose.yml) y la API se
# ejecuta en el host con `npm run dev`. Este Dockerfile existe para empaquetar la API
# de cara a un despliegue:
#
#   docker build --target runtime -t preformance-api:prod .
#   docker run --rm -p 3000:3000 --env-file .env preformance-api:prod
#
# (Para probarlo en local, DATABASE_URL debe apuntar a host.docker.internal en lugar
# de localhost, porque dentro del contenedor localhost es el propio contenedor.)

# Imagen Debian slim en lugar de alpine: musl da problemas con algunos binarios de
# npm y el ahorro de tamano no compensa la clase de fallos que introduce.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# ---------------------------------------------------------------------------
# deps: todas las dependencias, incluidas las de desarrollo, porque `build`
# necesita el compilador de TypeScript y la CLI de Prisma.
#
# `--ignore-scripts` evita que el postinstall lance `prisma generate` antes de
# haber copiado el esquema; se genera explicitamente en la etapa `build`.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

# ---------------------------------------------------------------------------
# build: genera el cliente de Prisma y compila TypeScript a dist/
#
# El cliente se emite a src/generated/prisma (ver el bloque `generator` del
# esquema), asi que forma parte del arbol de fuentes y tsc lo compila a dist/
# junto con el resto. Por eso el runtime no necesita ni la CLI de Prisma ni
# copiar node_modules/.prisma: el cliente ya viaja dentro de dist/.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# runtime: imagen final de produccion. Solo dependencias de produccion y JS ya
# compilado; ni TypeScript ni codigo fuente llegan aqui.
# ---------------------------------------------------------------------------
FROM base AS runtime

# OpenSSL no viene en la imagen slim y Prisma lo necesita para detectar la version de
# libssl y elegir el binario correcto del motor de migraciones. Sin el avisa de que no
# puede detectarla y cae a un binario por defecto que puede no funcionar.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# --ignore-scripts otra vez: el postinstall lanza `prisma generate` y a esta altura el
# esquema todavia no se ha copiado. Tampoco haria falta, porque el cliente ya viaja
# compilado dentro de dist/.
#
# Pero saltarse TODOS los scripts se salta tambien el postinstall de @prisma/engines,
# que es quien descarga el binario schema-engine. Sin el, `prisma migrate deploy` trata
# de bajarlo en tiempo de ejecucion y falla: el contenedor corre como `node` y
# node_modules pertenece a root. El `npm rebuild` lo trae aqui, todavia como root.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild @prisma/engines && npm cache clean --force

COPY --from=build /app/dist ./dist

# Las migraciones NO se aplican al arrancar el contenedor: son un paso de despliegue
# aparte que corre sobre esta misma imagen (`npx prisma migrate deploy`; en Railway,
# el preDeployCommand de railway.json). Por eso `prisma` es dependencia de produccion
# y no de desarrollo.
#
# Hacen falta los dos COPY: el `datasource` del esquema no declara `url`, asi que la
# cadena de conexion solo existe en prisma.config.ts. Es TypeScript, pero el CLI lo
# carga con jiti (via @prisma/config -> c12) sin necesitar tsx.
COPY prisma ./prisma
COPY prisma.config.ts ./

# Usuario sin privilegios (viene en la imagen oficial de node): si alguien
# consigue ejecucion de codigo, no la consigue como root.
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
