-- Migracion editada a mano sobre la que genero `prisma migrate dev --create-only`.
--
-- Dos cambios respecto al SQL generado:
--   1. Se crea y puebla `roles` ANTES de tocar `users`. Prisma lo hacia al reves, lo
--      que funciona con la tabla vacia pero reventaria la clave foranea en cuanto
--      hubiera un solo usuario, porque el default 'USER' no existiria todavia.
--   2. Los roles se insertan aqui y no en el seeder: un usuario no puede existir sin
--      rol, asi que el esquema nunca debe quedar en un estado donde registrarse sea
--      imposible. El seeder los repite con upsert, que es inocuo.

-- CreateTable
CREATE TABLE "roles" (
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("code")
);

-- Datos estructurales: sin estas filas la aplicacion no puede crear usuarios.
INSERT INTO "roles" ("code", "name", "description") VALUES
    ('USER',  'Usuario',       'Acceso a sus propios datos. Rol por defecto al registrarse.'),
    ('ADMIN', 'Administrador', 'Acceso completo, incluida la gestion de otros usuarios.');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role",
ADD COLUMN     "role_code" VARCHAR(20) NOT NULL DEFAULT 'USER';

-- DropEnum
DROP TYPE "user_role";

-- CreateIndex
CREATE INDEX "users_role_code_idx" ON "users"("role_code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
