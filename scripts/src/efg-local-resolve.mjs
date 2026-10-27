// Node-only test resolver. Vite understands extensionless TypeScript imports.
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.(?:js|mjs|cjs|ts|tsx|json|css|svg)$/.test(specifier)) {
    try { return nextResolve(specifier, context); }
    catch (e) {
      if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
      return nextResolve(`${specifier}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}});
