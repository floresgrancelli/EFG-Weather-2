import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { securityHeaders } from "@workspace/http-security";
import router from "./routes";
import { logger } from "./lib/logger";
import { safeOrigin, TRUSTED_PROXY_RANGES } from "./security/client";

const app: Express = express();
app.disable("x-powered-by");
// Trust only internal/loopback peers, never all proxies or a numeric hop count.
app.set("trust proxy", TRUSTED_PROXY_RANGES);
app.use((_req, res, next) => { res.set(securityHeaders({ development: process.env.NODE_ENV !== "production" })); next(); });

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  if (req.originalUrl.length > 2048) { res.status(414).json({ error: "La consulta es demasiado larga." }); return; }
  const hasBody = req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"] || 0) > 0;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && hasBody && !req.is("application/json")) {
    res.status(415).json({ error: "Enviá la acción como JSON desde EFG Weather." }); return;
  }
  cors({ origin: safeOrigin(req) ? req.get("origin") : false, credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"], allowedHeaders: ["Content-Type"] })(req, res, next);
});
app.use(express.json({ limit: "4kb", strict: true, inflate: false }));

app.use("/api", router);
app.use((_req, res) => { res.status(404).json({ error: "No encontrado." }); });
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { type?: string; status?: number };
  if (res.headersSent) return;
  const status = e.type === "entity.too.large" ? 413 : e.type === "entity.parse.failed" ? 400 : e.type === "encoding.unsupported" ? 415 : 503;
  res.status(status).json({ error: status === 413 ? "El envío es demasiado grande." : status === 400 ? "El JSON enviado no es válido." : status === 415 ? "Enviá JSON sin compresión desde EFG Weather." : "No pudimos procesar la consulta. Reintentá en unos segundos." });
});

export default app;
