// Render entry: one public origin for the app and all /api endpoints.
// Keeps original Replit app separate; never connects to it or triggers its deployments.
import express from "express";
import { createWebApp } from "./server.mjs";
import { app as api, startRetention, pool } from "../api-server/dist/render-entry.mjs";

const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (!process.env.PUBLIC_ORIGIN) throw new Error("PUBLIC_ORIGIN required");
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET required (32+ characters)");

const web = await createWebApp();
const host = express();
host.disable("x-powered-by");
// Pass the original URL untouched so the API's own /api routing, origin and
// anti-abuse middleware continue to work exactly as before.
host.use((req, res, next) => (req.path === "/api" || req.path.startsWith("/api/"))
  ? api(req, res, next) : web(req, res, next));
const server = host.listen(port, "0.0.0.0", () => console.log(`EFG Weather 2.0 listening on ${port}`));
server.headersTimeout = 10000;
server.requestTimeout = 15000;
const stopRetention = startRetention();
process.once("SIGTERM", () => {
  stopRetention();
  server.close(() => { void pool.end().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 10000).unref();
});
