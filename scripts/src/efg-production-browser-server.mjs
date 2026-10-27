// Test harness only. Not a workflow, artifact service, deployment or admin API.
// Serves the real production build/CSP and the real API locally, then is stopped.
import { createRequire } from "node:module";
import app from "../../artifacts/api-server/src/app.ts";
import { PUBLIC_ORIGINS } from "../../artifacts/api-server/src/security/client.ts";
import { createWebApp } from "../../artifacts/efg-weather/server.mjs";

const require = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const express = require("express");
const harness = express();
const web = await createWebApp();
// Local test origin ONLY in this separate test process; never used by services.
PUBLIC_ORIGINS.add("http://localhost:9315");
harness.use((req, res, next) => req.path.startsWith("/api/") ? app(req, res, next) : web(req, res, next));
harness.listen(9315, "127.0.0.1", () => console.log("Production CSP test harness ready on 127.0.0.1:9315"));
