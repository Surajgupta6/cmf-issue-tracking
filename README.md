# CMF Issue Tracker

> A **production-grade**, full-stack issue & ticket management platform built as a resume-worthy, interview-ready engineering project.

[![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-green?style=flat-square&logo=node.js)](./backend)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2016-black?style=flat-square&logo=next.js)](./frontend)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Prisma-blue?style=flat-square&logo=postgresql)](./backend/prisma)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

---

## 🏗️ Architecture Overview

```
cmf-issue-tracker/
├── backend/          # REST API — Node.js + Express + TypeScript + Prisma
│   ├── src/
│   │   ├── controllers/    # Thin HTTP handlers
│   │   ├── services/       # Business logic + Prisma transactions
│   │   ├── routes/         # Express routers
│   │   ├── middleware/      # Auth, RBAC, error handling
│   │   ├── jobs/           # Background cron workers (SLA breach detection)
│   │   └── utils/          # State machine, SLA policy, AppError
│   └── prisma/             # Schema + migrations
└── frontend/         # Next.js 16 App Router — TypeScript + TanStack Query
    ├── app/                # Pages (dashboard, issues, users, auth)
    ├── components/         # Sidebar, NotificationBell, StatusBadge, etc.
    └── lib/                # Axios interceptors, Auth context, API services
```

## ✨ Feature Set

### Authentication & Security
- **JWT + Refresh Token rotation** — Access tokens (15min) + persistent refresh tokens stored as hashed values in the DB
- **Role-Based Access Control (RBAC)** — 4 roles: `ADMIN`, `MANAGER`, `AGENT`, `CUSTOMER`
- **Security hardening** — Helmet, CORS, rate limiting (15 req/15min on auth), bcrypt password hashing
- **Token refresh queue** — 10 concurrent 401s trigger exactly 1 refresh call (not 10) via a queue pattern in the Axios interceptor

### Issue Lifecycle (State Machine)
- **Finite State Machine** — Strict transition validation: `OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`
- **SLA tracking** — Deadlines calculated from priority (CRITICAL: 4h response / 24h resolution; LOW: 48h / 14d)
- **Full audit history** — Every field change recorded in `IssueHistory` with actor, timestamp, old/new value
- **Assignment flow** — Managers assign agents; agents can only transition issues assigned to them

### Notifications (Event-Driven)
- **Atomic notifications** — Created in the same Prisma transaction as the triggering event; if issue creation fails, no notifications fire
- **4 event types** — `ISSUE_CREATED`, `ISSUE_ASSIGNED`, `ISSUE_STATUS_CHANGED`, `COMMENT_ADDED`
- **Actor exclusion** — You're never notified about your own actions
- **Frontend bell** — 30-second polling, unread badge, lazy list load, mark-read/mark-all-read

### SLA Breach Detection (Background Job)
- **Cron job every 5 minutes** — Scans all active issues for overdue SLA deadlines
- **Idempotent** — `NOT alreadyBreached` guard means 100 runs = same result as 1 (no duplicate notifications)
- **Resilient** — `Promise.allSettled` isolates per-issue failures; one bad issue doesn't abort the whole batch
- **Admin trigger** — `POST /api/v1/admin/sla-scan` for on-demand execution without waiting for the cron
- **Graceful shutdown** — Jobs stop before HTTP server closes (in-flight transactions complete cleanly)

### Analytics Dashboard
- Summary KPIs: total issues, open, resolved, SLA breach count
- Issues by status, by priority, by category (bar charts — Recharts)
- Agent performance table: assigned, resolved, avg resolution time
- SLA status breakdown: on-time vs breached
- Resolution trend: last 30 days line chart

### Comments & Attachments
- **Threaded comments** — With ownership guards (only author edits, author/admin deletes)
- **File attachments** — MIME whitelist, 10MB size limit, served statically in dev / S3-ready in prod
- **Comment notifications** — Creator and assigned agent notified (commenter excluded)

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js 22, Express 5, TypeScript |
| ORM | Prisma 7 (PostgreSQL) |
| Auth | JWT (jsonwebtoken), bcrypt |
| Background Jobs | node-cron |
| Frontend | Next.js 16 (App Router), TypeScript |
| Data Fetching | TanStack Query v5 |
| Charts | Recharts |
| HTTP Client | Axios (with refresh interceptor + queue) |
| Containerization | Docker, Docker Compose |

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- PostgreSQL 15+
- (Optional) Docker & Docker Compose

### Local Development

```bash
# Clone
git clone https://github.com/Surajgupta6/cmf-issue-tracking.git
cd cmf-issue-tracking

# Backend
cd backend
cp .env.example .env          # Fill in DATABASE_URL, JWT_SECRET, etc.
npm install
npx prisma migrate dev
npm run dev                   # → http://localhost:5000

# Frontend (new terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # → http://localhost:3000
```

### Docker (One Command)
```bash
# Full stack: PostgreSQL + Backend + Frontend
docker compose up --build

# Services:
#   Frontend  → http://localhost:3000
#   Backend   → http://localhost:5000
#   Postgres  → localhost:5432
```

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Create org + admin account |
| POST | `/api/v1/auth/login` | — | Login, get JWT pair |
| POST | `/api/v1/auth/refresh` | — | Rotate refresh token |
| GET | `/api/v1/issues` | ✓ | List issues (RBAC-scoped, paginated) |
| POST | `/api/v1/issues` | ✓ | Create issue (auto-assigns SLA) |
| GET | `/api/v1/issues/:id` | ✓ | Issue detail with SLA + history |
| PATCH | `/api/v1/issues/:id/status` | ✓ | State machine transition |
| POST | `/api/v1/issues/:id/assign` | MANAGER+ | Assign to agent |
| GET | `/api/v1/dashboard/summary` | MANAGER+ | KPI summary |
| GET | `/api/v1/notifications` | ✓ | Paginated notifications |
| GET | `/api/v1/notifications/unread-count` | ✓ | Badge count |
| PATCH | `/api/v1/notifications/read-all` | ✓ | Mark all read |
| POST | `/api/v1/admin/sla-scan` | ADMIN | Trigger SLA breach scan |

## 🗄️ Database Schema

```
Organization ─┬─ User (role: ADMIN/MANAGER/AGENT/CUSTOMER)
              ├─ Category
              └─ Issue ─┬─ SLA (responseDeadline, resolutionDeadline, *Breached)
                        ├─ Comment
                        ├─ Attachment
                        ├─ IssueHistory (audit trail)
                        └─ Notification
```

## 🔑 Key Engineering Decisions

**Why atomic notifications in transactions?**
> If issue creation fails mid-way (e.g., SLA insert errors), rolling back the transaction also rolls back any notifications — no orphan notifications for issues that don't exist.

**Why `Promise.allSettled` in the SLA job?**
> One corrupted issue record shouldn't prevent the other 99 from being processed. `allSettled` gives partial success; `all` would abort everything on the first failure.

**Why token refresh queue in Axios?**
> Without queuing, 10 simultaneous 401 responses would trigger 10 parallel refresh calls, exhausting the refresh token (which is single-use after rotation). The queue ensures exactly 1 refresh happens regardless of concurrent request count.

**Why `output: "standalone"` in Next.js?**
> The standalone build traces only the files actually imported and bundles them with a minimal server. Docker image size drops from ~600MB → ~80-120MB.

## 📁 Environment Variables

### Backend (`.env`)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/cmf_issue_tracker
JWT_SECRET=your-strong-secret-here
JWT_REFRESH_SECRET=your-other-strong-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DISABLE_JOBS=false         # Set true in test environments
```

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
BACKEND_URL=http://localhost:5000   # Server-side rewrite target
```

## 📊 Git History

```
a592966 feat(docker): multi-stage Dockerfiles, Next.js standalone
64c1dd0 feat(sla-cron): SLA breach detection - idempotent, atomic, resilient
48daa2c feat(notifications): event-driven system - atomic tx, bell UI, polling
78da6ab fix(frontend): auth response shape corrections
bf070e6 feat(frontend): Next.js 16 - auth, dashboard, issues, role-based nav
19f454a feat(dashboard): analytics - KPIs, agent perf, SLA, trend charts
99d7106 feat(comments+attachments): threaded comments, file uploads
36e6ba2 feat(issues): lifecycle - SLA, state machine, assignment, audit trail
f39eda6 feat(users): RBAC management - list, role update, activate/deactivate
dddcada feat(auth): JWT, refresh tokens, helmet, CORS, rate limiting
```

---

> Built to demonstrate production-quality Node.js/TypeScript backend engineering with real-world concerns: transactions, RBAC, state machines, background jobs, and observability.