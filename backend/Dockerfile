# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install production + dev dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Copy only package files first (layer cache: npm install only re-runs on
# package.json / lock file changes — not on source code changes)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — compile TypeScript → JavaScript
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (must run before tsc)
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — lean production image
#
# Only copies:
#   - Compiled JS (dist/)
#   - Prisma schema + generated client (needed at runtime)
#   - Production node_modules (no devDependencies)
#   - package.json (for npm start)
#
# Does NOT copy:
#   - TypeScript source
#   - node_modules/.cache
#   - Test files
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output and Prisma artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

# Create uploads directory (volume mount in docker-compose overrides this)
RUN mkdir -p uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

# Health check — Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/v1/health || exit 1

# Run migrations then start server
# Using shell form so environment variables are expanded at runtime
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
