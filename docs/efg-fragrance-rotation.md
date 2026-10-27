# Rotación diaria de fragancias

- Calendario de la ciudad: `weather.timezone` de Open-Meteo, no UTC ni la fecha del último fetch.
- El clima limita primero el conjunto: sensación térmica real, humedad/lluvia,
  perfil, ocasión y restricciones estacionales opcionales. La intensidad y
  compatibilidad del catálogo son criterios editoriales, no afirmaciones científicas.
- Rueda determinista por día y contexto. No usa Math.random. Todos los candidatos
  admitidos pueden rotar, no solo los empatados por score.
- Conserva el ID de hoy mientras siga siendo compatible. Un cambio importante
  de clima puede invalidarlo; no mantener una recomendación inadecuada por cumplir el calendario.
- Prefiere referencias no usadas durante siete días; cuando se agotan, usa la
  menos reciente sin repetir la de ayer si existen alternativas.
- Persistencia solo local, hasta 128 entradas y purga por antigüedad al escribir:
  fecha, ID de catálogo y clave opaca de contexto. Sin coordenadas, identidad,
  historial GPS, transmisión al backend o mezcla con la encuesta.
- Sin almacenamiento, sigue funcionando la rueda de calendario, pero no se
  puede conservar memoria de cambios anteriores de contexto/clima.
- Tarjeta nocturna independiente: datos exclusivamente de las horas reales
  disponibles de 20 a 03 para viernes/sábado. No usa condiciones actuales
  para sustituir ese pronóstico. Interior/exterior es parte de su contexto.
- Un temporizador hasta la próxima medianoche local y eventos de primer plano
  actualizan la referencia sin consultas meteorológicas adicionales. Respeta DST.
- Nombres, notas, fuentes, alternativas y explicación salen del mismo objeto
  seleccionado. Sin fotos nuevas ni supuestos de stock. Tip meteorológico intacto.
- Si el catálogo falla o solo admite cero/una referencia, se comunica la limitación;
  nunca elegir una incompatible ni prometer rotación inexistente.

## Catálogo y fuentes

22 referencias. Se sumaron Issey Miyake Sport, Xerjoff Torino21 y Givenchy
L’Interdit EDP con las notas documentadas aportadas por el propietario.
Tres referencias unisex suaves amplían especialmente frío húmedo:

- REPLICA Lazy Sunday Morning EDT:
  https://www.maisonmargiela-fragrances.us/fragrances/replica-eau-de-toilette/replica-lazy-sunday-morning/MM009.html
- REPLICA Bubble Bath EDT:
  https://www.maisonmargiela-fragrances.us/fragrances/replica-eau-de-toilette/replica-bubble-bath/MM004.html
- Diptyque L’Eau Papier EDT (solo notas destacadas, no pirámide):
  https://us.diptyqueparis.com/en-us/products/eau-de-toilette-eau-papier-papier100

Consultadas el 23/10/2026. No confundir las notas oficiales con la clasificación
editorial de comodidad por clima/ocasión. Ninguna imagen comercial fue copiada.
En los 144 segmentos cubiertos por pruebas hay al menos 3 opciones compatibles;
no prometer siete distintas donde solo hay tres.

## Pruebas

- `pnpm --filter @workspace/scripts exec tsx --test src/efg-fragrance-rotation.test.mjs`
- `node scripts/src/efg-fragrance-browser-smoke.mjs` con workflows y Chromium CDP en 9223.
- `node scripts/src/efg-release-browser-smoke.mjs`: navegación y clima real, separada
  del ensayo de reloj/pronóstico sintético del smoke de fragancias. Las fixtures
  solo viven en el navegador de prueba; nunca en la app pública ni en DB.

No hubo cambios de backend, esquema DB, seguridad, proveedores ni publicación.
