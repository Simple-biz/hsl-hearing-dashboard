# HSL Hearing Management System

HIPAA-compliant hearing management system for Hogan Smith Law (Social Security disability and personal injury law firm in Orlando, FL).

Migrated from PHP/MySQL on GoDaddy → Next.js 16 + Neon Postgres + Vercel.

## Tech Stack

| Layer     | Technology                                                  |
| --------- | ----------------------------------------------------------- |
| Framework | Next.js 16 (App Router, React 19, Turbopack)                |
| Language  | TypeScript 5.7                                              |
| UI        | Tailwind CSS 4, shadcn/ui, Lucide icons                     |
| Database  | Neon Postgres (Scale plan, HIPAA BAA)                       |
| Auth      | NextAuth.js v4 (credentials provider, bcrypt, JWT sessions) |
| Hosting   | Vercel Pro (BAA signed)                                     |
| Cron      | Vercel Cron Functions                                       |
| Email     | n8n webhook (self-hosted at auto.simple.biz)                |
| Domain    | hearings.hogansmith.com (GoDaddy DNS → Vercel)              |

## Prerequisites

- Node.js 20+ (22 recommended)
- npm
- Git
- Access to Neon database (connection string)
- Vercel account (for deployment)

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd hsl-hearings
npm install
```

### 2. Install shadcn/ui components

All shadcn/ui components are installed. If the `components/ui/` folder is missing or incomplete after clone:

```bash
npx shadcn@latest init
npx shadcn@latest add --all
```

### 3. Environment variables

Create `.env.local` in the project root:

```env
# Database — Neon Postgres connection string
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/hsl_hearings?sslmode=require

# NextAuth
NEXTAUTH_SECRET=<random-32-char-string>
NEXTAUTH_URL=http://localhost:3000

# n8n Webhook (for email notifications)
N8N_WEBHOOK_URL=https://auto.simple.biz/webhook/hsl-email
# n8n Webhook (for MR Pivot to Google Sheet sync)
N8N_WEBHOOK_SYNC_URL=https://auto.simple.biz/webhook/web-app-sync
N8N_WEBHOOK_SECRET=<webhook-secret>

# Cron job protection
CRON_SECRET=<random-string>

# Public URL (used for schedule links)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For production on Vercel, set these in Project Settings → Environment Variables:

- Change `NEXTAUTH_URL` to `https://hearings.hogansmith.com`
- Change `NEXT_PUBLIC_APP_URL` to `https://hearings.hogansmith.com`

### 4. Run development server

```bash
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login`.

### 5. Build for production

```bash
npm run build
npm start
```

## Project Structure

```
hsl-hearings/
├── app/
│   ├── (dashboard)/                # Protected dashboard routes (layout with sidebar)
│   │   ├── layout.tsx              # Server component → DashboardShell (auth + sidebar)
│   │   ├── page.tsx                # Main dashboard page (server component, fetches data)
│   │   ├── dashboard-client.tsx    # Main dashboard client component (table, filters, modals)
│   │   ├── actions.ts              # Server actions: CRUD, auto-assign, pagination, stats
│   │   ├── schedule/               # Admin rep schedule management
│   │   │   ├── page.tsx            # Server component
│   │   │   ├── schedule-client.tsx # Calendar UI, availability editing
│   │   │   └── action.ts          # Server actions: availability CRUD, lock/unlock
│   │   ├── representatives/        # Rep dashboard (CRUD reps, token management)
│   │   │   ├── page.tsx
│   │   │   ├── rep-dashboard-client.tsx
│   │   │   └── action.ts          # Server actions: rep CRUD, tokens, bulk operations
│   │   ├── import/                 # CSV import page
│   │   ├── reports/                # Reports page (placeholder)
│   │   ├── admin/                  # Admin settings page (placeholder)
│   │   ├── medical-records/        # MR pivot page (placeholder)
│   │   ├── rfc/                    # RFC page (placeholder)
│   │   ├── patient-portal/         # Patient portal (placeholder)
│   │   └── api-keys/               # API keys page (placeholder)
│   ├── schedule/
│   │   └── [token]/                # Public rep schedule (no auth, token + password)
│   │       ├── page.tsx
│   │       ├── public-schedule-client.tsx
│   │       └── action.ts
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # NextAuth API route
│   │   ├── cron/
│   │   │   ├── send-reminders/route.ts  # Daily hearing reminders
│   │   │   ├── schedule-reminder/route.ts # Deadline reminders
│   │   │   └── auto-lock/route.ts       # Auto-lock past-deadline schedules
│   │   └── send-token-email/route.ts    # Send schedule link via n8n
│   ├── login/page.tsx              # Login page
│   ├── layout.tsx                  # Root layout (ThemeProvider, AuthProvider)
│   └── globals.css                 # Global styles, scrollbar customization
├── components/
│   ├── layout/
│   │   ├── app-sidebar.tsx         # Main sidebar navigation
│   │   ├── app-header.tsx          # Page header with title + actions
│   │   ├── dashboard-nav.tsx       # Secondary nav bar with action buttons
│   │   ├── dashboard-shell.tsx     # Client wrapper (SidebarProvider, no SSR)
│   │   ├── role-gate.tsx           # Role-based visibility wrapper
│   │   ├── theme-toggle.tsx        # Dark/light mode toggle
│   │   └── index.ts
│   ├── modals/
│   │   ├── add-hearing-modal.tsx   # Add new hearing form
│   │   ├── auto-assign-modal.tsx   # Bulk auto-assign with progress overlay
│   │   ├── email-all-modal.tsx     # Email all assigned reps
│   │   ├── unassign-all-modal.tsx  # Bulk unassign with preview
│   │   ├── activity-log-modal.tsx  # Activity log viewer with filters
│   │   ├── rep-stats-modal.tsx     # Rep assignment statistics
│   │   ├── token-modal.tsx         # Per-rep schedule link management
│   │   ├── revoke-all-modal.tsx    # Bulk revoke all tokens
│   │   ├── bulk-links-modal.tsx    # Bulk generate schedule links
│   │   └── index.ts
│   ├── ui/                         # shadcn/ui components (auto-generated)
│   └── auth-provider.tsx           # NextAuth SessionProvider wrapper
├── lib/
│   ├── auth.ts                     # NextAuth config (credentials, JWT, callbacks)
│   ├── session.ts                  # Session helpers (getSession, requireAuth, requireRole)
│   ├── db/index.ts                 # Neon database client (@neondatabase/serverless)
│   ├── auto-assign.ts              # Auto-assign scoring engine (10 rules from PHP)
│   ├── activity-log.ts             # Activity logging (logAction, logSystemActivity)
│   ├── roles.ts                    # Role definitions and permissions (13 roles)
│   ├── timezone.ts                 # Timezone conversion utilities
│   └── utils.ts                    # cn() utility for className merging
├── middleware.ts                    # NextAuth middleware (protects all routes except public)
├── vercel.json                     # Cron job configuration
├── next.config.ts                  # Next.js config
├── tsconfig.json                   # TypeScript config
├── package.json                    # Dependencies
└── SHADCN_INSTALL.md               # shadcn component installation guide
```

## Authentication

NextAuth.js with credentials provider. Users are stored in the `users` table with bcrypt-hashed passwords (migrated from the old PHP system).

### Roles (13 total)

Defined in `lib/roles.ts`. Key roles:

| Role                 | Access                                   |
| -------------------- | ---------------------------------------- |
| `system_admin`       | Full access to everything                |
| `admin`              | Manage hearings, reps, schedules, assign |
| `manager`            | Same as admin                            |
| `staff`              | View dashboard, limited editing          |
| `rep`                | View only their own hearings             |
| `internal_advocates` | Rep role for internal reps               |
| `external_advocates` | Rep role for external reps               |

### Session

JWT-based sessions (8-hour expiry). Session includes `user.id`, `user.role`, `user.email`, `user.name`.

### Protected Routes

`middleware.ts` protects all routes except: `/login`, `/schedule/*` (public), `/api/cron/*`, static files.

## Database

Neon Postgres (Scale plan with HIPAA BAA). Connection via `@neondatabase/serverless`.

### Key Tables

| Table                 | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `users`               | Login accounts (email, password_hash, role, is_active)                    |
| `hearings`            | All hearing records (claimant, date, time, rep assignment, status fields) |
| `representatives`     | Rep profiles (name, type, limits, restrictions, timezone)                 |
| `rep_availability`    | Per-day availability (date, type, time slots, locked status)              |
| `mr_teams`            | Medical record teams                                                      |
| `config_options`      | Dropdown options (MOA, decision status, etc.)                             |
| `rep_docs_assignees`  | Document assignees                                                        |
| `rep_schedule_tokens` | Public schedule access tokens (bcrypt passwords)                          |
| `federal_holidays`    | Holiday dates for auto-assign                                             |
| `hearing_reminders`   | Tracks sent reminders (prevents duplicates)                               |
| `activity_log`        | Audit trail (user_id, action, description, timestamp)                     |

## Auto-Assign Engine

Located in `lib/auto-assign.ts`. Port of the PHP auto-assign with 10 scoring rules:

1. Schedule lock check — skip if rep's schedule is unlocked for that month
2. Federal holiday check — skip if hearing date is a holiday
3. Availability — check full/morning/afternoon/custom time slots
4. Daily limit — max hearings per day
5. Weekly limit — max hearings per week
6. Hearing restriction — 2x2, 3x3 spacing rules
7. 2-hour buffer — between hearings (waived for same ALJ)
8. Distribution scoring — balance workload, +1000 priority for internal reps
9. Monthly preference — bonus/penalty based on month settings
10. Workload bonus — favor reps with fewer total assignments

## Server-Side Pagination

The dashboard uses server-side pagination via `fetchHearingsPage()` server action. Filters (search, date, rep, status) are sent to the server as SQL WHERE clauses. Only the current page of rows is transferred (not all 5,400+ hearings). Sorting happens in Postgres via ORDER BY. Stats are computed server-side with `COUNT(*) FILTER (...)`. Filter changes are debounced 300ms before fetching.

## Cron Jobs

Configured in `vercel.json`, protected by `CRON_SECRET`:

| Job                           | Schedule       | Purpose                                                       |
| ----------------------------- | -------------- | ------------------------------------------------------------- |
| `/api/cron/send-reminders`    | 9am daily      | Send hearing reminders at 56/45/30/10/1 day intervals         |
| `/api/cron/schedule-reminder` | 9am daily      | Warn reps about upcoming schedule deadline (10/5/0 days)      |
| `/api/cron/auto-lock`         | Midnight daily | Lock past-deadline rep schedules, insert default availability |

## Email System

All emails are HIPAA-compliant minimal alerts (zero PHI in email body). Sent via n8n webhook at `N8N_WEBHOOK_URL`.

Email types: `hearing_alert_minimal`, `hearing_reminder_minimal`, `schedule_reminder_minimal`, `auto_lock_minimal`, `schedule_link`.

## Activity Logging

All write operations are logged to `activity_log` via `logAction()` from `lib/activity-log.ts`. The function auto-resolves the current user from the NextAuth session.

Logged actions: hearing CRUD, assignments, auto-assign, field updates, email sends, schedule changes, rep management, token operations.

## Key Design Decisions

- **Native `<select>` over shadcn Select** — eliminates Radix ID hydration mismatches in React 19
- **Uncontrolled inputs (defaultValue + ref)** — for edit forms and max limit inputs, prevents re-render on every keystroke
- **Custom action menu (portal-based)** — shadcn DropdownMenu had click-through issues; custom portal with getBoundingClientRect and smart viewport flip
- **createPortal to document.body** — for edit modal, bulk action bar, auto-assign toast, horizontal scrollbar
- **Server-side pagination** — dashboard fetches only current page from Neon, not entire dataset
- **Fixed horizontal scrollbar** — portaled to viewport bottom, synced with table scroll via dual-ref onScroll, custom thick visible styling
- **`DashboardShell` client component** — wraps SidebarProvider to keep layout as server component for auth
- **Date parsing with T12:00:00** — prevents UTC midnight → local timezone day shift (e.g., May 1 showing as April 30)
- **React 19 compatibility** — no `setState` in useEffect bodies, no ref access during render, `useTransition` for async state, `fetchId` counter pattern for data loading

## Common Tasks

### Add a new user

```sql
INSERT INTO users (email, password_hash, full_name, role, is_active)
VALUES ('user@hogansmith.com', '<bcrypt-hash>', 'Full Name', 'staff', true);
```

Generate bcrypt hash: `node -e "require('bcryptjs').hash('password', 10).then(h => console.log(h))"`

### Add a new column to the dashboard

1. Add the column to `ALL_COLUMNS` array in `dashboard-client.tsx`
2. Add the field to `ALLOWED_FIELDS` in `updateHearing()` in `actions.ts`
3. Add the field to the SELECT query in `fetchHearingsPage()` in `actions.ts`
4. Add rendering logic in `renderCell()` in `dashboard-client.tsx`

### Add a new modal

1. Create `components/modals/my-modal.tsx`
2. Export from `components/modals/index.ts`
3. Import in `dashboard-client.tsx`
4. Add `useState` for visibility + button trigger + conditional render

### Add a new sidebar page

1. Create `app/(dashboard)/my-page/page.tsx` (server component)
2. Add the route to `components/layout/app-sidebar.tsx` nav items
3. Add role permissions in `lib/roles.ts` if needed

## Deployment

### Vercel

```bash
npm run build    # Test locally first
vercel --prod    # Or push to main branch for auto-deploy
```

### Environment Variables (Vercel)

Set in Project Settings → Environment Variables:

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=<secret>
NEXTAUTH_URL=https://hearings.hogansmith.com
N8N_WEBHOOK_URL=https://auto.simple.biz/webhook/hsl-email
N8N_WEBHOOK_SECRET=<secret>
CRON_SECRET=<secret>
NEXT_PUBLIC_APP_URL=https://hearings.hogansmith.com
```

### DNS

Point `hearings.hogansmith.com` to Vercel via CNAME record in GoDaddy DNS.

## Pending / Backlog

- MR Pivot page — data view, not built yet
- Patient Portal — placeholder
- RFC page — placeholder
- Reports page — has mock data only
- Admin settings page — placeholder
- CSV Compare modal — not built
- Per-row Email button — placeholder
- Import system — page exists but needs testing
- Bulk auto-assign for selected rows (via checkbox bulk action bar)
- Bulk email for selected rows
