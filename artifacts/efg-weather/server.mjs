import express from "express";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "@workspace/http-security";

export async function createWebApp() {
  const app = express();
  const directory = fileURLToPath(new URL("./dist/public/", import.meta.url));
  const html = await readFile(new URL("./dist/public/index.html", import.meta.url), "utf8");
  app.disable("x-powered-by");
  app.use((_req, res, next) => { res.set(securityHeaders()); next(); });
  // Never expose workspace files, source maps, APIs or hidden files from this server.
  app.use((req, res, next) => {
    if (/(?:^|\/)\.|\.map$|^\/(?:api|src|@fs|@vite)(?:\/|$)/i.test(req.path)) {
      res.status(404).end(); return;
    }
    next();
  });
  app.get(["/", "/index.html"], (_req, res) => {
    const nonce = randomBytes(24).toString("base64");
    res.set(securityHeaders({ nonce }));
    res.set("Cache-Control", "no-store");
    res.type("html").send(html.replace(/<script\b/gi, `<script nonce="${nonce}"`));
  });
  app.use(express.static(directory, {
    index: false, dotfiles: "deny", fallthrough: true,
    setHeaders(res, path) {
      res.setHeader("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300");
      if (path.endsWith("/sw.js")) res.setHeader("Cache-Control", "no-cache");
    },
  }));
  app.use((_req, res) => { res.status(404).json({ error: "No encontrado." }); });
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1) throw new Error("PORT es obligatorio.");
  const app = await createWebApp();
  const server = app.listen(port, "0.0.0.0");
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
}
