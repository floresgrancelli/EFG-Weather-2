# Ubicación y refresco — fase de prueba

- Radar oculto: no se monta el módulo ni se ofrecen visores externos. No borrar
  Leaflet: Comunidad conserva su mapa básico. SMN Alertas permanece separado.
- POST /api/geolocation/reverse solo sirve al botón voluntario de EFG Weather.
  No es un buscador genérico, autocomplete, seguimiento ni geocodificación masiva.
- Consentimiento separado, coordenadas redondeadas a tres decimales (~100 m),
  nunca identidad, dirección ni ubicación precisa en logs, DB o historial.
- Georef v2.0 aporta jurisdicción; se aceptan municipio y gobierno_local para
  tolerar cambios de versión. No garantiza localidad. Nominatim puede aportar
  ciudad/town/village/suburb; las etiquetas se muestran como aproximadas.
- Nominatim público: https://operations.osmfoundation.org/policies/nominatim/
  Solo acciones explícitas; UA identificado, atribución ODbL, caché RAM limitada
  a 128 zonas / 10 min. No se consulta en refrescos automáticos. La preferencia
  manual cancela e invalida respuestas pendientes. La caché no es un historial
  personal y no se vincula al navegador ni se persiste en PostgreSQL.
- Límite GLOBAL con advisory lock PostgreSQL y ventana compartida >=1100 ms,
  sin consultas concurrentes; máximo 500 solicitudes OSM/día en toda la app.
  No se llama a OSM si falta conexión/permiso de cuota DB. Sin nuevas tablas
  ni migración: usa el almacenamiento de contadores existente. Al agotarse o
  fallar, conserva jurisdicción confirmada o “Ubicación actual”, no inventa.
- Geocodificador y UA residen en backend: se puede desactivar/sustituir allí
  sin actualizar el cliente instalado. No es apto para tráfico masivo; no hay
  SLA ni contratación de proveedor. Revisar política y capacidad antes de
  promoción pública. No se realizó publicación desde Agent.
- Tiempo: consulta al entrar/cambiar coordenadas; refresco visible cada 20 min
  y al regresar si venció ese intervalo; nunca en segundo plano ni offline.
  Fallos automáticos respetan el mismo intervalo. Mantiene el último dato en
  memoria con hora original y aviso de fallo/obsolescencia. Sin caché del clima
  en service worker. Cambiar solo la etiqueta GPS no mueve ni reconsulta el punto.
- La API gratuita Open-Meteo con publicidad sigue PENDIENTE de licencia comercial.
  No se habilitaron pagos, notificaciones, modelos extra ni sorteos.

## Verificación y límites

Build web/API y typecheck aprobados; 38 pruebas de lógica y 9 de seguridad.
El smoke de scripts/src/efg-release-browser-smoke.mjs prueba clima real,
Caseros real por la nueva API, cambio manual durante respuesta inversa pendiente,
rechazo/ausencia de GPS, refresco visible, temas y tamaños de 360 a 1440 px.
Las coordenadas del dispositivo son emuladas, no una certificación de hardware.

El harness local de producción confirmó manifest y service worker activado.
La reapertura completamente offline NO quedó certificada: la automatización CDP
presentó errores de contexto y timeout. No tomarlo como un resultado aprobado ni
como prueba concluyente de un defecto del usuario. Falta probar ese flujo y la
instalación real en Safari/iPhone y Chrome/Android antes de cerrar la beta.
