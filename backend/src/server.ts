/**
 * Server entry point.
 *
 * Note: dotenv is loaded in app.ts via `import "dotenv/config"` which runs
 * before anything else. We do not call dotenv.config() here again to avoid
 * double-loading.
 */
import app from "./app.js";

const PORT = process.env.PORT ?? "5000";
const ENV = process.env.NODE_ENV ?? "development";

const server = app.listen(PORT, () => {
  console.log(`[server] CMF Issue Tracker API running`);
  console.log(`[server] Environment : ${ENV}`);
  console.log(`[server] URL         : http://localhost:${PORT}`);
  console.log(`[server] Health      : http://localhost:${PORT}/api/v1/health`);
});

/**
 * Graceful shutdown handlers.
 *
 * On SIGTERM / SIGINT (e.g. Docker stop, Ctrl+C), close the HTTP server
 * gracefully before exiting. This allows in-flight requests to complete
 * rather than being abruptly terminated.
 */
const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log("[server] HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default server;