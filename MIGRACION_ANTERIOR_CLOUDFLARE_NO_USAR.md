# EFG Weather: migración Cloudflare + Neon

Fuente: ZIP OpulentHiddenWamp aportado por el propietario 25/10/2026. Código original extraído y filtrado sin claves.

## Estado
- Código React/Vite, API Express, Drizzle/PostgreSQL, documentación y scripts rescatados.
- Copia de UI compilada incluida en paquete PREVIEW aparte; no API funcional sin adaptaciones.
- 17 pruebas locales superadas: current-sky, fragrance rotation y tip rotation (Node 22 con loader solo para pruebas).
- Base Neon `EFG Weather` (id sweet-silence-38636757) ya tiene 4 tablas e índices creados, **sin datos históricos importados**.
- No hay conexión automática con Cloudflare desde ChatGPT. Requiere cuenta/configuración de Cloudflare.

## Riesgos/pasos
1. No publicar en GitHub ningún `.env`, certificado, cadena de conexión, `SESSION_SECRET` o clave de proveedor.
2. Elegir arquitectura Worker que reemplace el Pool de node-postgres, la carga de Express y mantenimiento periódico. Diseñar controles antiabuso distribuidos.
3. Revisar las cookies anónimas: por cambio de dominio no se migran al nuevo origen por sí solas; conservar `SESSION_SECRET` ayuda con firmas pero no transfiere cookies entre dominios.
4. Exportar datos de base Replit mediante herramienta PostgreSQL autenticada y restaurar de manera segura en Neon.
5. Validar endpoints /api, funcionamiento del selector GPS y persistencia de comunidad en entorno de prueba.
6. Revisar licencia comercial del proveedor meteorológico (Open-Meteo) antes de publicar patrocinio.
7. Solo después de pasar pruebas, redirigir a nueva URL.
