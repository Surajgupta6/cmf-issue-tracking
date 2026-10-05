/**
 * Server entry point.
 *
 * Note: dotenv is loaded in app.ts via `import "dotenv/config"` which runs
 * before anything else. We do not call dotenv.config() here again to avoid
 * double-loading.
 */
import app from "./app.js";
import { startJobs, stopJobs } from "./jobs/index.js";

const PORT = process.env.PORT ?? "5000";
const ENV = process.env.NODE_ENV ?? "development";

const server = app.listen(PORT, () => {
  console.log(`[server] CMF Issue Tracker API running`);
  console.log(`[server] Environment : ${ENV}`);
  console.log(`[server] URL         : http://localhost:${PORT}`);
  console.log(`[server] Health      : http://localhost:${PORT}/api/v1/health`);

  // Start background jobs AFTER the server is listening.
  // This ensures the DB connection is healthy before jobs run.
  startJobs();
});

/**
 * Graceful shutdown handlers.
 *
 * On SIGTERM / SIGINT (e.g. Docker stop, Ctrl+C):
 *   1. Stop all background jobs (prevent new cron ticks)
 *   2. Close the HTTP server (allow in-flight requests to finish)
 *   3. Exit cleanly
 *
 * Order matters: stop jobs BEFORE closing the HTTP server so that any
 * job currently waiting on a DB query doesn't get cut off mid-transaction.
 */
const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — shutting down gracefully`);
  stopJobs();
  server.close(() => {
    console.log("[server] HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

export default server;