# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: deps
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — build Next.js with standalone output
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env: API calls from the browser go to the public URL.
# NEXT_PUBLIC_* variables are baked into the JS bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — production image using Next.js standalone output
#
# next/standalone includes a minimal server (server.js) with only the
# packages actually used — no need to copy all of node_modules.
# Final image is ~80-120MB vs ~600MB without standalone mode.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Security: non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only what Next.js standalone output needs
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
