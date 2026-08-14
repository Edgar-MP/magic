# Despliegue en el VPS con Dokploy

La imagen es autocontenida: dentro van la web compilada, los marcos, las
tipografías, los símbolos y el índice de cartas. No hay que preparar volúmenes ni
bajar assets en el arranque.

Un solo contenedor sirve todo desde el mismo origen, así que no hay CORS que
configurar y las cookies de sesión funcionarán solas cuando se añadan las cuentas.

## Configuración en Dokploy

Crear una **Application** (no un Compose) y rellenar:

| Sitio | Campo | Valor |
| --- | --- | --- |
| General | Build Type | `Dockerfile` |
| General | Dockerfile Path | `./Dockerfile` |
| General | Docker Context Path | `.` |
| Domains | Container Port | `3000` |
| Domains | HTTPS | activado, certificado `letsencrypt` |
| Swarm Settings | Health Check Test | `["CMD-SHELL","node -e \"fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]` |

El puerto de la sección *Domains* sólo le dice a Traefik a dónde enrutar; no
expone nada a internet por su cuenta.

### Base de datos

Crear un **Postgres** desde *Databases* en Dokploy y copiar su *Internal
Connection URL* a la variable `DATABASE_URL` de la aplicación. Las migraciones se
aplican solas al arrancar el contenedor (`prisma migrate deploy`), así que no hay
que ejecutar nada a mano ni en el primer despliegue ni en los siguientes.

### Volumen

En *Advanced → Volumes*, un **Volume Mount** montado en `/data`. Ahí van las
ilustraciones que sube la gente; sin él se perderían en cada despliegue.

### Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | **Sí** | La *Internal Connection URL* del Postgres de Dokploy. |
| `AUTH_SECRET` | **Sí** | Firma las cookies de sesión. Mínimo 32 caracteres: `openssl rand -base64 32`. Si cambia, se cierran todas las sesiones. |
| `PUBLIC_URL` | No | La URL pública. Sin ella funciona igual (se deduce de cada petición) pero sale un aviso al arrancar. |
| `PORT` | No | `3000` por defecto. Si se cambia, cambiar también el de *Domains*. |
| `MAX_ART_BYTES` | No | Tamaño máximo por imagen. 10 MB por defecto. |
| `MAX_ART_BYTES_PER_USER` | No | Espacio máximo por usuario. 200 MB por defecto. |
| `WEB_DIST` / `DATA_DIR` | No | Rutas dentro de la imagen. No tocar. |

El servidor se niega a arrancar en producción sin `AUTH_SECRET`, y sale con
error si no puede conectar con la base de datos. Es a propósito: mejor que el
despliegue falle claro y a la primera que descubrirlo cuando alguien intente
entrar.

### El registro está abierto

Cualquiera con la URL puede crearse una cuenta y subir imágenes. Por eso hay
cuotas: 10 MB por imagen y 200 MB por usuario, ajustables con las variables de
arriba. Para cerrarlo del todo, lo más rápido es no publicar el dominio o poner
autenticación básica en Traefik desde Dokploy.

## La compilación necesita internet

El `Dockerfile` baja, en tiempo de compilación:

- los marcos y tipografías desde GitHub (`pnpm assets`, unos 63 MB),
- los símbolos de maná desde Scryfall,
- el índice de cartas desde el bulk data de Scryfall (`pnpm cards:index`).

Si alguna de las dos está caída, la compilación falla. Es el precio de que la
imagen no dependa de nada en ejecución.

**El índice de cartas se congela en la imagen.** Cuando salga una expansión
nueva, las cartas nuevas no aparecerán en el autocompletado hasta que se vuelva a
desplegar (el buscador seguirá encontrándolas contra la API de Scryfall al pulsar
Enter). Un *Redeploy* en Dokploy lo regenera.

## Probar la imagen en local antes de subirla

```bash
docker compose up -d          # Postgres de desarrollo, en el 5463
docker build -t magic .
docker run --rm --network host \
  -e PORT=3100 \
  -e DATABASE_URL="postgresql://magic:magic@localhost:5463/magic" \
  -e AUTH_SECRET="cualquier-cosa-de-mas-de-32-caracteres-aqui" \
  magic

curl -sf localhost:3100/v1/health                                  # {"status":"ok"}
curl -sI localhost:3100/decks                                      # 200 text/html (fallback del SPA)
curl -sI localhost:3100/card-assets/m15/regular/m15FrameW.png       # 200 + immutable
curl -sI localhost:3100/card-index.json                            # 200 + ETag
```

Y abrir `http://localhost:3100`, crear un mazo, hacer un proxy y generar el PDF.
Es la única forma de saber que los marcos y el índice se sirven bien desde la
imagen: un `pnpm dev` los sirve por otro camino y no prueba lo mismo.

## Tamaño y tiempos

La imagen ocupa unos **640 MB**: 63 son los marcos, 7 el índice de cartas y casi
200 los motores de Prisma, que hacen falta para aplicar las migraciones al
arrancar. Una compilación en frío tarda unos minutos, casi todo descargando los
assets; con la caché de capas de Docker, los cambios de código sólo repiten el
paso de compilar.

## Copias de seguridad

Hay dos cosas que guardar y ninguna está en el código:

- **Postgres**: mazos, colección, proxies y cuentas. Dokploy hace copias de sus
  bases de datos desde su propia interfaz.
- **El volumen `/data`**: las ilustraciones. Sin él, los proxies sincronizados
  aparecen sin imagen.
