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
# necesita el compilador de TypeScript.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ---------------------------------------------------------------------------
# build: compila TypeScript a dist/
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# runtime: imagen final de produccion. Solo dependencias de produccion y JS ya
# compilado; ni TypeScript ni codigo fuente llegan aqui.
# ---------------------------------------------------------------------------
FROM base AS runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Usuario sin privilegios (viene en la imagen oficial de node): si alguien
# consigue ejecucion de codigo, no la consigue como root.
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
