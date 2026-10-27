import app from "./app";
import { logger } from "./lib/logger";
import { startRetention } from "./security/retention";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
server.headersTimeout = 10000;
server.requestTimeout = 15000;
const stopRetention = startRetention();
process.once("SIGTERM", () => {
  stopRetention();
  server.close(() => { void pool.end().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 10000).unref();
});
