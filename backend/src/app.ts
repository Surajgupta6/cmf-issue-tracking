import "dotenv/config";
import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";

import { errorHandler } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import userRoutes from "./routes/user.routes.js";
import issueRoutes from "./routes/issue.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import attachmentRoutes from "./routes/attachment.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

const app = express();

/**
 * =========================================================
 * SECURITY MIDDLEWARE (applied first, before any routing)
 * =========================================================
 */

/**
 * Helmet: Sets secure HTTP response headers.
 * Mitigates: XSS, clickjacking, MIME sniffing, and other common web attacks.
 * Key headers set by default:
 *   - Content-Security-Policy
 *   - X-Frame-Options: DENY
 *   - X-Content-Type-Options: nosniff
 *   - Strict-Transport-Security (HTTPS enforcement in production)
 */
app.use(helmet());

/**
 * CORS: Restricts which origins can make cross-origin requests to this API.
 *
 * In development:   allows localhost:5173 (Vite dev server) + localhost:3000
 * In production:    CORS_ORIGIN env variable must be set to the deployed
 *                   frontend domain (e.g. https://cmf-tracker.example.com)
 *
 * Why credentials: true? Required to send cookies (e.g. httpOnly refresh token
 * cookie in a future improvement) from the browser.
 *
 * Security: Without this, any website could make authenticated requests to our
 * API using a logged-in user's credentials.
 */
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

/**
 * =========================================================
 * RATE LIMITING
 * =========================================================
 *
 * Why rate limiting?
 * Without it, auth endpoints are vulnerable to:
 *   - Brute-force password attacks (try millions of passwords)
 *   - Credential stuffing (replay breached username/password lists)
 *   - DoS via resource exhaustion
 *
 * Implementation: In-memory rate limiting per IP.
 * Limitation: Does not work across multiple server instances (each instance
 * has its own counter). For production multi-instance deployments, use
 * Redis as the store (express-rate-limit + rate-limit-redis).
 */

/**
 * Auth rate limiter: Strict limit for authentication endpoints.
 * 15 requests per 15-minute window per IP.
 * Designed to allow normal usage (a few logins per session) while
 * making brute-force attacks impractical.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: {
    status: "error",
    message:
      "Too many requests from this IP. Please wait 15 minutes and try again.",
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
});

/**
 * General API rate limiter: Generous limit for normal API usage.
 * 200 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: {
    status: "error",
    message: "Too many requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * =========================================================
 * LOGGING MIDDLEWARE
 * =========================================================
 */

/**
 * Morgan: HTTP request logger.
 * Development: 'dev' format (colorized, concise — method, path, status, time)
 * Production: 'combined' format (Apache Combined Log Format — includes IP,
 *             user agent, etc. for log aggregation tools like Splunk/Datadog)
 */
app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"),
);

/**
 * =========================================================
 * BODY PARSING
 * =========================================================
 */
app.use(express.json({ limit: "10mb" }));

/**
 * =========================================================
 * ROUTES
 * =========================================================
 */

// Health check — no auth required, no rate limiting
// Used by load balancers, Docker health checks, and monitoring tools
app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "cmf-issue-tracker",
    timestamp: new Date().toISOString(),
  });
});

// Auth routes — apply strict rate limiter
app.use("/api/v1/auth", authLimiter, authRoutes);

// Serve uploaded files statically (development)
// In production: serve files from S3/CDN instead
// process.cwd() resolves to the backend/ directory at runtime
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// All other API routes — apply general rate limiter
app.use("/api/v1/categories", apiLimiter, categoryRoutes);
app.use("/api/v1/users", apiLimiter, userRoutes);
app.use("/api/v1/issues", apiLimiter, issueRoutes);
app.use("/api/v1/issues/:issueId/comments", apiLimiter, commentRoutes);
app.use("/api/v1/issues/:issueId/attachments", apiLimiter, attachmentRoutes);
app.use("/api/v1/dashboard", apiLimiter, dashboardRoutes);

/**
 * =========================================================
 * ERROR HANDLING
 * =========================================================
 *
 * IMPORTANT: The error handler must be registered LAST, after all routes.
 * Express identifies error-handling middleware by its 4-parameter signature.
 * It catches all errors thrown in async route handlers (Express 5 propagates
 * async errors automatically — no need for try/catch in controllers).
 */
app.use(errorHandler);

export default app;