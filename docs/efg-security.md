# Seguridad de EFG Weather

## Alcance y estado

Endurecimiento preparado en desarrollo el 22 de octubre de 2026. No se publicó ni republicó desde Agent. La app pública conserva la versión anterior hasta que el propietario coordine la actualización.

Clima y tips continúan sin cuenta obligatoria. Reportes y encuesta siguen siendo voluntarios y anónimos. Participar no habilita a editar la aplicación. No hay panel ni rutas administrativas nuevas: sponsors, catálogo, configuración y sorteos se editan exclusivamente en Replit, por personas autorizadas.

## Controles implementados

- Cookies anónimas firmadas con HMAC y secreto de backend; HttpOnly, SameSite Strict y Secure obligatorio en producción. Una visita de lectura migra la cookie anterior sin cambiar la propiedad de las participaciones. No equivalen a cuentas verificadas ni impiden por sí solas todos los bots.
- Orígenes de escritura explícitos; no se deriva confianza de Host ni X-Forwarded-Host. El dominio público actualmente autorizado está en la configuración de seguridad del backend. Un dominio nuevo requiere revisión en Replit.
- Trust proxy limitado a loopback y redes privadas; nunca `true` ni número fijo de saltos. Se utiliza el primer salto no confiable desde la derecha. Pruebas de cabeceras falsas y normalización IPv4/IPv6; la topología exacta del proxy de producción debe corroborarse cuando se republica. No se registra la IP cruda.
- Identificadores de red HMAC con rotación diaria; IPv6 agrupada por /64. No se agregan a los reportes ni se usan para publicidad o seguimiento.
- Límites por navegador/acción compartidos en PostgreSQL: 6 reportes/h, 20 confirmaciones/h, 8 elecciones/h, 20 borrados/h por recurso y 30 lecturas/min. Límites de red diez veces mayores. Protección adicional por proceso: 120 consultas/min por red, 600/min globales, emisión limitada de cookies y 8 operaciones comunitarias simultáneas. Respuestas 429 con Retry-After.
- Máximo 4 KiB de JSON sin compresión, URI de 2 KiB, esquemas estrictos, saneamiento de texto y longitudes tras normalización. Confirmar y borrar sin cuerpo sigue funcionando. SQL parametrizado y errores sin detalles internos.
- Reportes: coordenadas aproximadas en grilla de 0,02 grados, sin identidad pública, duplicados cercanos del mismo fenómeno bloqueados temporalmente, confirmaciones idempotentes, sin auto-confirmación. Siempre “Comunidad, no verificado”, nunca alerta oficial.
- Lecturas geográficas y por antigüedad; páginas de hasta 50 reportes, 30 por defecto, cursor validado y límites de concurrencia/consulta. Índices de apoyo en el esquema de desarrollo.
- Vencidos invisibles inmediatamente. Limpieza por lotes al iniciar y cada 5 minutos, con exclusión mutua PostgreSQL, mientras el proceso está activo. Borra reportes vencidos y sus confirmaciones, límites vencidos y encuestas anteriores a 90 días. Autoscale puede dormir: no es un cron externo ni garantiza borrado físico a una hora exacta.
- CSP compartida para HTML y API; scripts sin unsafe-inline en producción, nonce, frame-ancestors none y X-Frame-Options DENY. Desarrollo permite únicamente los marcos necesarios del editor. Fuentes, Open-Meteo, RainViewer y OpenStreetMap autorizados expresamente; geolocalización propia sigue permitida.
- Servidor web de producción mínimo sobre el artifact existente: no sirve archivos ocultos, código fuente ni sourcemaps; caché de assets con hash y sin caché de HTML/API privados. No se creó un servicio externo.
- Se retiró fast-glob y su dependencia braces sin versión parcheada, usando glob nativo de Node 24. Parser de selectores corregido 7.1.7 con override acotado. Se comprobó la versión realmente cargada, además del lockfile.

## Verificación reproducible

No ejecutar escrituras de prueba contra producción.

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
PORT=19470 BASE_PATH=/ pnpm --filter @workspace/efg-weather run build
pnpm --filter @workspace/api-server run build
node --test scripts/src/efg-weather.test.mjs
pnpm --filter @workspace/scripts exec tsx --test src/efg-security.test.mjs
node scripts/src/efg-community-smoke.mjs
```

La prueba comunitaria utiliza solo desarrollo y elimina los registros técnicos que crea. Las pruebas de seguridad validan firma/migración, origen, proxy, límites, expiración, cabeceras y archivos de producción.

Para probar el build real con CSP en Chromium, usar el servidor temporal `scripts/src/efg-production-browser-server.mjs` y `EFG_TEST_URL=http://localhost:9315/ node scripts/src/efg-browser-smoke.mjs` con CDP 9223. No es un workflow ni una ruta administrativa. Detener ambos procesos al terminar. El origen local agregado existe únicamente en ese proceso de prueba.

## Lo que requiere revisión del propietario

- Revisar colaboradores, invitaciones y roles de edición en Replit; visibilidad del proyecto/fuente y configuración de despliegue son controles diferentes. Visitar la app no concede edición, pero no se auditaron permisos de cuenta desde este código.
- Confirmar dominio y cadena de proxy al republicar; verificar entonces las cabeceras y cookies en la URL pública. Las verificaciones locales no prueban que la versión pública anterior ya tenga estos cambios.
- Revisar Usage, límites de escalado y alertas de gasto del Autoscale existente. Los límites de aplicación reducen abuso, no son un límite duro de facturación ni sustituyen protección perimetral contra ataques distribuidos. El servidor web utiliza cómputo del mismo despliegue; no se activó un plan o proveedor pago adicional.
- Revalidar derechos comerciales de Open-Meteo/RainViewer antes de un lanzamiento con publicidad. Endurecer seguridad no habilita licencias comerciales.

No hay garantía de “cero vulnerabilidades”. Los resultados de escáneres son una comprobación puntual; no cubren permisos externos, toda la infraestructura o ataques desconocidos.
