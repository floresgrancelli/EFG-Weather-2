# EFG Weather 2.0 — Render + Neon

## Estado

Base de migración **preparada, NO desplegada ni validada en Render**. Partimos del código de EFG Weather que el titular descargó de Replit. La web pública original en Replit permanece intacta. La carpeta original de código, imágenes y tests se conserva; no hay datos secretos en este paquete.

## Objetivo

Un servicio web en Render Free expone `/` (React/Vite) y `/api/*` (Express) bajo **el mismo dominio**, conservando la CSP con nonce, cookies HttpOnly, protección de origen y los controles antiabuso.

La carpeta `artifacts/mockup-sandbox` se conserva solo para referencia, no forma parte de la aplicación de producción.

## Qué falta para publicar

1. Crear un **nuevo repositorio GitHub** del propietario, p. ej. `EFG-Weather-2`, e importar allí estos archivos. No introducir .env, credenciales ni copias de la base original.
2. Desde la misma cuenta Render que aloja Nutrition y Cognitivo, desplegar `render.yaml` (Blueprint). Revisar **plan Free** antes de confirmar. En una cuenta existente, evitar vincular accidentalmente servicios ya publicados.
3. En el paso inicial, configurar `DATABASE_URL` con la cadena HTTPS/PG segura del proyecto Neon **EFG Weather**, nunca en GitHub. La base preparada contiene las cuatro tablas según el esquema, pero no incorpora los datos previos de Replit.
4. Configurar `PUBLIC_ORIGIN` como la URL **https://...onrender.com** que Render asignó al nuevo servicio, **sin barra final**. El nombre exacto depende de disponibilidad.
5. `SESSION_SECRET` se genera en Render durante el despliegue. Conservá el mismo secreto en futuros despliegues para no invalidar la identidad anónima del navegador.
6. Comprobar `/api/healthz`, carga de pronóstico, perfiles de perfumes, Tip del día, alertas, GPS y luego funciones anónimas de Comunidad, incluyendo escribir, editar y borrar. No probar contra la app de Replit.
7. Confirmar términos/licencia de Open-Meteo si la app lleva patrocinio y la disponibilidad/legalidad de integración de radares antes de exponer funciones nuevas.

## Respaldo y evolución

`render.yaml` declara **un solo web service Free**, sin base Render paga. PostgreSQL se aloja por separado en Neon Free. La modalidad Free tiene suspensión por inactividad y límites de uso: no se garantiza disponibilidad continua ni capacidad ilimitada. No se contratará un plan sin permiso expreso.

Los cambios futuros se realizan en este nuevo repositorio y se prueban antes de pasarlos a producción. El despliegue automático queda **desactivado** hasta terminar la validación de la nueva instalación. Al aprobar una versión, el titular inicia el despliegue manualmente desde Render.

## Implementación técnica

- `artifacts/api-server/build.mjs`: genera `render-entry.mjs` para exportar la API y la limpieza.
- `artifacts/efg-weather/fullstack.mjs`: único proceso y puerto, separa `/api` del sitio React.
- `artifacts/api-server/src/security/client.ts`: permite un origen HTTPS explícito **solo** desde la variable segura `PUBLIC_ORIGIN`. Nunca confiar en `Host`/`X-Forwarded-Host`.
- `BASE_PATH=/` y `PORT=3000` se utilizan solo durante la compilación Vite. Se usa `--prod=false` al instalar para conservar las dependencias de compilación incluso con `NODE_ENV=production`.

**Pendiente:** instalar dependencias y verificar una compilación completa en un entorno con acceso a npm y conexión Neon. Ningún test de integración contra la nueva web ha sido ejecutado aún.

## Actualización EFG Weather 2.0 del 27/10/2026

- Catálogo: **138 fragancias** (76 masculinas, 55 femeninas y 7 sin preferencia).
- La colección masculina utiliza como base el **Atlas Olfativo EFG 2026 (57 fichas)** recuperado de Drive, con notas destacadas adaptadas a un catálogo público; la selección se complementa con diseñadores conocidos y marcas árabes. **Xerjoff es la única marca de nicho admitida.** No se incluyen Diptyque, Jo Malone, Maison Margiela REPLICA, Thomas Kosmala o Jo Milano.
- Las fichas añadidas fuera del Atlas se identifican como **selección editorial con notas orientativas**, NO pirámides oficiales verificadas; antes de agregar enlaces/fotos oficiales debe verificarse cada fuente.
- Rotación: se conservan hasta 30 días de registros anónimos locales (solo fecha, identificador de fragancia y contexto no identificable). Ningún perfume usado en los 15 días anteriores puede volver a recomendarse en otro perfil, clima, ocasión o contexto. Si la lista fuera insuficiente no se inventa una sugerencia. Una misma fecha mantiene la sugerencia guardada mientras continúe siendo compatible con el pronóstico.
- Tip: nueva introducción rotativa de 21 días, distinta cada día en condiciones idénticas. El consejo completo sigue basado en datos meteorológicos actuales (UV, lluvia, viento, humedad y sensación térmica), sin inventar información; termina en «¡Perfúmese mucho!».
- **Pruebas:** 49/49 pruebas unitarias de lógica de recomendaciones, radar, ubicación, Tip y representación del cielo superadas en Node 22 (`node --experimental-strip-types --import ./scripts/src/efg-local-resolve.mjs --test scripts/src/efg-fragrance-rotation.test.mjs scripts/src/efg-tip-rotation.test.mjs scripts/src/efg-current-sky.test.mjs scripts/src/efg-location.test.mjs scripts/src/efg-radar.test.mjs scripts/src/efg-release-improvements.test.mjs`). No equivalen a compilar la interfaz completa ni probar la base Neon y Render.

### Bloqueos para publicar una web patrocinada gratuitamente

**Licencia de datos meteorológicos.** Según https://open-meteo.com/en/terms, `api.open-meteo.com` gratuito es solo para uso **no comercial**, y Open-Meteo incluye las aplicaciones con publicidad o actividades promocionales entre los usos comerciales. Como EFG Weather incluye el patrocinio de Farmacia Palopoli, no debe lanzarse públicamente usando su endpoint gratuito hasta sustituirlo por un proveedor que permita expresamente el uso comercial, contratar la licencia pertinente o contar con autorización explícita del proveedor. No contratar servicios sin el permiso del titular.

**Publicación.** Se requiere un repositorio GitHub de titularidad del usuario para conectar Render (se sugiere `EFG-Weather-2`). No se ha creado este repositorio ni desplegado Render. La app existente en Replit sigue intacta. Verificar el workspace del usuario de Render y no modificar Nutrition/Cognitivo. Instalar desde GitHub con `render.yaml`, plan free explícito, y configurar `DATABASE_URL`, `PUBLIC_ORIGIN`, `SESSION_SECRET` con los mecanismos seguros de Render; jamás en GitHub ni en mensajes.

**Base de datos.** Las cuatro tablas de Neon EFG Weather están creadas, pero la base está vacía. Debe comprobarse el esquema y decidir si corresponde importar contenido de Comunidad de Replit. No asumir que los datos previos fueron trasladados.

**Límite Render Free.** El servicio se suspende tras un periodo de inactividad y puede tardar en reactivarse, y las horas gratuitas, el tráfico y las compilaciones comparten límites por workspace. Véase https://render.com/docs/free.

**Alternativa sin licencia comercial paga (pendiente de implementación y validación):** MET Norway `Locationforecast/2.0` ofrece pronósticos mundiales de hasta nueve días y permite usos comerciales, incluidos ingresos publicitarios, siempre con atribución y cumplimiento de sus condiciones. Véanse https://api.met.no/ y https://docs.api.met.no/doc/FAQ.html. Requiere identificar el cliente mediante User-Agent válido, cachear según las cabeceras del proveedor y adaptar los datos sin inventar sensación térmica, UV o intervalos horarios que el servicio no entregue. El código actual todavía consulta Open-Meteo; no tratar esta alternativa como integrada.
