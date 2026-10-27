// No user-controlled values belong in this policy.
export function securityHeaders({ development = false, nonce } = {}) {
  const policy = [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}${development ? " 'unsafe-inline'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://tilecache.rainviewer.com",
    `connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.rainviewer.com https://tilecache.rainviewer.com https://tile.openstreetmap.org https://fonts.googleapis.com https://fonts.gstatic.com${development ? " ws://localhost:* ws://127.0.0.1:* wss://*.replit.dev" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${development ? "'self' https://replit.com https://*.replit.com https://*.replit.dev" : "'none'"}`,
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ");
  return {
    "Content-Security-Policy": policy,
    ...(!development ? { "X-Frame-Options": "DENY" } : {}),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), payment=(), geolocation=(self)",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...(!development ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}
