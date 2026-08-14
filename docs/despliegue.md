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

### Variables de entorno

Ninguna es obligatoria: los valores por defecto de la imagen ya sirven.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `PORT` | `3000` | Puerto de escucha. Si se cambia, cambiar también el de *Domains*. |
| `WEB_DIST` | `/app/web` | Web compilada dentro de la imagen. No tocar. |
| `DATA_DIR` | `/data` | Datos persistentes. Sólo se usa a partir de la fase de cuentas. |
| `NODE_ENV` | `production` | — |

### Volumen

Todavía no hace falta: sin cuentas no se guarda nada en el servidor. Cuando
lleguen, en *Advanced → Volumes* se añade un **Volume Mount** montado en `/data`,
que es donde irán las ilustraciones que sube la gente.

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
docker build -t magic .
docker run --rm -p 3100:3000 magic

curl -sf localhost:3100/v1/health                                  # {"status":"ok"}
curl -sI localhost:3100/decks                                      # 200 text/html (fallback del SPA)
curl -sI localhost:3100/card-assets/m15/regular/m15FrameW.png       # 200 + immutable
curl -sI localhost:3100/card-index.json                            # 200 + ETag
```

Y abrir `http://localhost:3100`, crear un mazo, hacer un proxy y generar el PDF.
Es la única forma de saber que los marcos y el índice se sirven bien desde la
imagen: un `pnpm dev` los sirve por otro camino y no prueba lo mismo.

## Tamaño y tiempos

La imagen ocupa unos **378 MB**, de los que 63 son los marcos y 7 el índice de
cartas. Una compilación en frío tarda unos minutos, casi todo descargando los
assets; con la caché de capas de Docker, los cambios de código sólo repiten el
paso de compilar.
