#!/bin/sh
# Aplica las migraciones pendientes y arranca. `migrate deploy` sólo aplica las
# que faltan y no toca nada si la base ya está al día, así que es seguro en cada
# despliegue y en cada reinicio del contenedor.
set -e

echo '{"event":"migrating"}'
node node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma

exec node dist/index.js
