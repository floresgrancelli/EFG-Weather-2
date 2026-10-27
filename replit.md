# EFG Weather

Aplicación meteorológica en español argentino con clima real de Open-Meteo y recomendaciones cotidianas.

## Seguridad y operación

- Consulta pública y participación voluntaria anónima: no son permisos de edición. No crear administración web ni endpoints para cambiar sponsors, catálogo, configuración o sorteos. Esas ediciones quedan en Replit con controles de acceso del propietario.
- El artifact web de producción ahora ejecuta `artifacts/efg-weather/server.mjs` sobre el servicio existente para entregar CSP y anti-clickjacking también en la portada. Desarrollo sigue con Vite y permite el iframe de Preview. No republicar desde Agent sin autorización explícita.
- Política, límites, retención y verificación: `docs/efg-security.md`.
- Verificación visual de Inicio: `node --test scripts/src/efg-current-sky.test.mjs`; `node scripts/src/efg-home-visual-smoke.mjs` con Chromium CDP 9223 y Preview activo. El segundo contrasta el círculo con Open-Meteo real, revisa logo/enlaces y navegación, y prueba variantes de iconos en un panel temporal identificado; no publica reportes ni respuestas de encuesta.
- Ubicación: precisa solo en memoria y consultas a Open-Meteo sin caché; mapas/comunidad reciben zona aproximada para GPS. No se usa geocodificación inversa externa. Los centros públicos de ciudades conservan sus coordenadas originales. El modo manual y el campo seleccionado en Agro persisten; GPS no los reemplaza. Reconsulta de ubicación automática al abrir con permiso concedido y tras 15 minutos fuera de primer plano, nunca seguimiento continuo.
- Pruebas de ubicación: `node --test scripts/src/efg-location.test.mjs`; `node scripts/src/efg-geolocation-smoke.mjs` con Chromium CDP 9223 y Preview. Permisos, posiciones públicas de prueba y reloj se emulan solo en el navegador de prueba; Open-Meteo sigue siendo real. No escribe comunidad ni publica.

## Run & Operate

- `pnpm --filter @workspace/efg-weather run dev` — frontend principal; iniciar mediante el workflow administrado `artifacts/efg-weather: web`, que configura puerto y ruta `/`.
- `artifacts/efg-weather` es la aplicación web principal registrada. `artifacts/mockup-sandbox` conserva la versión previa de Canvas; no usarla como destino de cambios de producto.
- El frontend consulta Open-Meteo directamente, sin claves, y radar histórico RainViewer solo para evaluación interna no comercial. El proxy compartido enruta `/api` al backend, sin proxy adicional de Vite.
- `/api/community` guarda reportes y elecciones voluntarias de perfumes en PostgreSQL. Una cookie HttpOnly anónima permite corregir/eliminar datos propios; no equivale a autenticación ni usuarios verificados. Los límites temporales usan hash HMAC de red, nunca IP cruda.
- El catálogo editorial está en `artifacts/efg-weather/public/fragrances.json`. No atribuir pirámides exactas cuando solo existen notas destacadas. Club, push y alertas oficiales integradas siguen pendientes. No incorporar administración web en esta etapa.
- PWA: manifest e íconos propios, service worker de estructura estática solo en compilaciones de producción. Nunca cachea APIs, pronósticos, encuestas ni mapas. En Preview de desarrollo no se promete funcionamiento offline.

- `pnpm --filter @workspace/api-server run dev` — backend; usar su workflow administrado con `PORT` asignado.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Pruebas: `node --test scripts/src/efg-weather.test.mjs`; `node scripts/src/efg-community-smoke.mjs` sobre backend local activo (limpia registros técnicos); `node scripts/src/efg-browser-smoke.mjs` con Chromium remoto en puerto 9223.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
