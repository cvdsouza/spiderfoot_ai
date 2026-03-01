# SpiderFoot AI — Agent Onboarding Guide

SpiderFoot AI is an OSINT (Open-Source Intelligence) automation platform. It runs scan modules against a target (domain, IP, email, etc.), correlates the findings, and presents results through a modern React UI with AI-powered analysis. The backend is Python/FastAPI; the frontend is React + TypeScript + Tailwind CSS v4.

---

## Repository layout

```
spiderfoot_ai/
├── api/                   # FastAPI application
│   ├── app.py             # App factory + lifespan startup
│   ├── middleware/        # Auth (JWT), security headers
│   ├── routers/           # One file per feature area (see below)
│   └── services/          # result_consumer.py, scan_runner.py, task_publisher.py
├── spiderfoot/            # Core SpiderFoot library (SpiderFootDb, SpiderFootHelpers, etc.)
├── modules/               # sfp_*.py scan modules (200+)
├── correlations/          # YAML correlation rule files
├── frontend/              # React SPA
│   └── src/
│       ├── api/           # Axios API functions (client.ts is the axios instance)
│       ├── components/    # React components (see breakdown below)
│       ├── hooks/         # Custom hooks (useScanStatus)
│       ├── stores/        # Zustand stores
│       └── types/         # Shared TypeScript types
├── worker.py              # Standalone distributed worker (RabbitMQ consumer)
├── sf.py                  # CLI entry point
├── docker-compose.yml     # Production compose (spiderfoot + rabbitmq)
├── docker-compose-dev.yml # Dev overlay (mounts source into container)
├── Dockerfile             # Main image build
├── requirements.txt       # Python dependencies
└── .deepsource.toml       # DeepSource static analysis config
```

---

## Running the application

### Docker (recommended)
```bash
# First run — generate TLS certs for RabbitMQ
./generate-certs.sh

# Start everything
./start.sh                      # or: docker compose up --build

# Dev mode (live code mount — no rebuild needed for Python changes)
docker compose -f docker-compose.yml -f docker-compose-dev.yml up

# With distributed workers
./start-worker.sh --fast 2 --slow 1 --detach
```

The app listens on **https://localhost:5001**. Default credentials: `admin` / `changeme` (set via env vars `SPIDERFOOT_ADMIN_USER` / `SPIDERFOOT_ADMIN_PASSWORD`).

### Frontend dev server (hot reload)
```bash
cd frontend
npm install
npm run dev          # Vite dev server on http://localhost:5173 (proxies /api to :5001)
npm run build        # Production build → frontend/dist/
```

The production FastAPI app serves the built `frontend/dist/` as a SPA fallback.

---

## Backend

### Tech stack
- **FastAPI** + **Uvicorn** (async)
- **SpiderFootDb** — SQLite wrapper in `spiderfoot/db.py` (no ORM, raw SQL)
- **JWT auth** via `python-jose` + `passlib` (`api/middleware/auth.py`)
- **RabbitMQ** (AMQPS) for distributed scan dispatch; optional — falls back to local subprocess

### API routers (`api/routers/`)

| File | Prefix | Notes |
|---|---|---|
| `scans.py` | `/api/v1/scans` | CRUD, start/stop |
| `results.py` | `/api/v1/scans/{id}/...` | Events, graph, summary, paged events |
| `exports.py` | `/api/v1/scans/{id}/export` | CSV / JSON exports |
| `modules.py` | `/api/v1/modules` | Module list + config |
| `settings.py` | `/api/v1/settings` | Platform config |
| `auth.py` | `/api/v1/auth` | Login, token refresh |
| `users.py` | `/api/v1/users` | User CRUD |
| `workers.py` | `/api/v1/workers` | Worker heartbeat + status |
| `ai_analysis.py` | `/api/v1/ai` | AI scan analysis (OpenAI / Anthropic) |
| `correlation_rules.py` | `/api/v1/correlation-rules` | YAML rule CRUD |
| `system.py` | `/api/v1/system` | Version, health |
| `legacy.py` | `/` (flat) | Backward-compat routes for `sfcli.py` |

### App state
Shared objects are stored on `app.state` (set during `lifespan`):
- `app.state.config` — live platform config dict (includes `__modules__` and `__correlationrules__`)
- `app.state.modules` — loaded module dict
- `app.state.correlation_rules` — parsed rule list
- `app.state.result_consumer` — `ResultConsumerManager` (RabbitMQ consumer, only when RabbitMQ is available)

### Database access
Every router handler receives a `SpiderFootDb` instance via dependency injection (`Depends(get_db)` in `api/middleware/db.py`). Do not create `SpiderFootDb` instances directly in handlers.

### Scan execution flow
1. `POST /api/v1/scans` → `scan_runner.py` → if RabbitMQ available, publishes task to `sf.fast` or `sf.slow` queue; otherwise spawns local subprocess.
2. `worker.py` (or local subprocess) runs `SpiderFootScanner`, writes results to the shared SQLite DB.
3. When using distributed workers, `ResultConsumerManager` listens to a results queue and writes final status back to the DB.

---

## Frontend

### Tech stack
- **React 18** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS v4** — utility classes only, no `tailwind.config.js`
- **TanStack React Query v5** — all data fetching/caching
- **Zustand** — client state (auth, sidebar, theme, toasts)
- **React Router v6** — SPA routing
- **Recharts** — dashboard charts
- **react-force-graph-2d / 3d** — graph visualization

### Routes (`frontend/src/App.tsx`)

| Path | Component | Notes |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/` | `Welcome` | Dashboard (widgets) |
| `/scans` | `ScanList` | Scan list with search + inline actions |
| `/newscan` | `NewScan` | Start a scan |
| `/scaninfo/:id` | `ScanInfo` | Tabbed scan detail view |
| `/correlation-rules` | `CorrelationRulesPage` | Rule management |
| `/settings` | `SettingsPage` | Platform config |
| `/users` | `UserManagementPage` | Admin only |
| `/workers` | `WorkersStatus` | Worker health |

All routes except `/login` are wrapped in `ProtectedRoute` (checks `useAuthStore`).

### Layout
```
Layout (Layout.tsx)
├── Sidebar (Sidebar.tsx)   ← collapsible, always dark; 56px collapsed / 220px expanded
├── Header (Header.tsx)     ← slim top bar: page title, theme toggle, user menu
└── <Outlet>                ← page content, max-w-7xl centered
    └── ToastContainer      ← fixed bottom-right toast stack
```

Sidebar pin state persists via `useSidebarStore` → localStorage key `sf_sidebar`.

### Zustand stores (`frontend/src/stores/`)

| File | Key | Persisted |
|---|---|---|
| `authStore.ts` | `token`, `user`, `hasPermission()`, `hasRole()` | localStorage (`sf_token`, `sf_user`) |
| `themeStore.ts` | `theme` (light/dark), `toggleTheme()` | localStorage; sets `.dark` class on `<html>` |
| `sidebarStore.ts` | `isPinned`, `togglePin()` | localStorage (`sf_sidebar`) |
| `toastStore.ts` | `toasts`, `add()`, `remove()` | none (in-memory only) |

**Toast imperative helpers** (usable outside React components):
```ts
import { toast } from '../stores/toastStore';
toast.success('Scan started');
toast.error('Something failed');
toast.info('...'); toast.warning('...');
```

### API layer (`frontend/src/api/`)
- `client.ts` — Axios instance; attaches `Authorization: Bearer <token>` from `authStore` automatically; redirects to `/login` on 401.
- All other files export async functions that call `client.get/post/put/delete`.
- React Query `queryKey` naming convention: `['resource', id, ...filters]`.

### Styling conventions

**All colors go through CSS custom properties** defined in `frontend/src/index.css`:
```css
var(--sf-primary)        /* indigo-blue accent */
var(--sf-bg)             /* page background */
var(--sf-bg-secondary)   /* subtle alternate surface */
var(--sf-bg-card)        /* card / panel surface */
var(--sf-text)           /* primary text */
var(--sf-text-muted)     /* secondary / label text */
var(--sf-border)         /* dividers and input borders */
var(--sf-sidebar-bg)     /* always dark navy */
```

**Dark mode** uses the `.dark` class on `<html>` (toggled by `themeStore`). Because this app uses class-based dark mode and Tailwind v4 defaults to media-query dark mode, `index.css` has:
```css
@custom-variant dark (&:is(.dark *));
```
This is essential — **do not remove it**. Without it, all `dark:` utility classes will not respond to the theme toggle.

**Badge/status color pattern** (light-mode-safe):
```html
<!-- Use bg-{color}-100 / text-{color}-700 in light, dark:bg-{color}-900/40 dark:text-{color}-300 -->
<span class="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Active</span>
```
Avoid `bg-{color}-500/10 text-{color}-400` — those are invisible in light mode.

### ScanInfo tabs
`ScanInfo.tsx` uses **conditional rendering** (not CSS hide) for tabs. Each tab's component mounts fresh when selected and unmounts when leaving. This is important for components that use `useEffect` or `useLayoutEffect` to measure DOM elements — the ref will be `null` during the loading phase.

### GraphView specifics
- Uses `useLayoutEffect([backendData])` (not `useEffect`) to measure the canvas container width. This is because the component has early `return` statements during loading, so `containerRef` is null on initial mount; the effect re-fires when `backendData` arrives.
- Node type filtering is done via `hiddenTypes: Set<string>` state; `filteredGraphData` is a derived memo.
- `detectNodeColor` and `detectNodeType` in `GraphView.tsx` heuristically classify nodes (IP, Domain, Email, URL, ASN, Root, Other) from their label text.
- 3D graph (Three.js, ~1 MB) is lazy-loaded only when the user switches to 3D mode.

---

## Worker architecture

`worker.py` is a standalone Python process. It:
1. Connects to RabbitMQ over AMQPS (TLS, port 5671)
2. Consumes from `sf.fast` or `sf.slow` queue
3. Runs `SpiderFootScanner` locally (same code as the main server)
4. Writes results directly to the shared SQLite DB (same volume)
5. Publishes a completion message back to the API server
6. Sends heartbeats to `POST /api/v1/workers/heartbeat`

Workers are stateless — the DB is the shared state. Scale horizontally by running more `worker.py` processes.

```bash
# Env vars for a worker
RABBITMQ_URL=amqps://user:pass@host:5671/
RABBITMQ_CA_CERT=/path/to/ca.crt
SPIDERFOOT_DATA=/var/lib/spiderfoot     # same volume as API server
SPIDERFOOT_WORKER_NAME=worker-01
SPIDERFOOT_API_URL=http://spiderfoot:5001
```

---

## Authentication & permissions

- Login returns a JWT stored in localStorage as `sf_token`.
- Roles: `administrator`, `analyst`, `viewer` (typical values; defined in DB).
- `useAuthStore.hasRole('administrator')` for admin-only gates in the UI.
- `useAuthStore.hasPermission('resource', 'action')` for fine-grained checks.
- Administrators bypass all permission checks (`user.roles.includes('administrator') → true`).

---

## Key conventions

1. **Never use `window.alert` or `window.confirm`** — use the toast system for notifications and inline confirmation UI patterns (see `ScanList.tsx` for the `pendingAction` / `rowPendingDelete` pattern).
2. **New API endpoints go in the appropriate router file** under `api/routers/`. Access the DB via `Depends(get_db)`.
3. **New frontend API functions go in `frontend/src/api/`** — import `api` from `./client` and use `api.get/post/put/delete`.
4. **React Query cache keys** should be specific enough to distinguish different filter states: `['scanEventsPaged', scanId, eventType, filterFp, search, page]`.
5. **Do not import `useToastStore` hook in non-component code** — use the imperative `toast.*` helpers from `toastStore.ts` instead.
6. **Component files** use PascalCase `.tsx`; store/hook/utility files use camelCase `.ts`.
7. **Python style**: max line length 120, Google-style docstrings, complexity limit 60 (see `setup.cfg`).
8. **Tests** live in `test/unit/`, `test/integration/`, `test/acceptance/`. Run with `pytest test/`.

---

## Environment variables

| Variable | Default | Used by |
|---|---|---|
| `SPIDERFOOT_ADMIN_USER` | `admin` | API (bootstrap admin on first start) |
| `SPIDERFOOT_ADMIN_PASSWORD` | `changeme` | API |
| `RABBITMQ_URL` | `amqps://spiderfoot:spiderfoot@rabbitmq:5671/` | API + workers |
| `RABBITMQ_CA_CERT` | `/etc/rabbitmq/certs/ca.crt` | API + workers |
| `SPIDERFOOT_DATA` | `/var/lib/spiderfoot` | API + workers (SQLite path) |
| `SPIDERFOOT_WORKER_NAME` | hostname | Workers |
| `SPIDERFOOT_API_URL` | `http://localhost:5001` | Workers (heartbeat) |

Copy `.env.example` → `.env` (if present) or pass via docker compose `environment:` block.

---

## Common tasks

### Add a new API endpoint
1. Find or create the appropriate router in `api/routers/`.
2. Add the FastAPI route function with `Depends(get_db)` for database access.
3. Add the corresponding function in `frontend/src/api/` calling the axios client.
4. Add a `useQuery` or `useMutation` call in the relevant component.

### Add a new frontend page
1. Create the component in `frontend/src/components/<feature>/MyPage.tsx`.
2. Add a `<Route>` in `frontend/src/App.tsx`.
3. Add a `NavLink` entry in `frontend/src/components/layout/Sidebar.tsx`.
4. If admin-only, gate the nav item with `useAuthStore().hasRole('administrator')`.

### Add a new Zustand store
Follow the pattern in `toastStore.ts` or `sidebarStore.ts`. Use `persist` middleware from `zustand/middleware` if the state should survive page reload.

### Change the color palette
Edit the CSS custom properties in `frontend/src/index.css` (`:root` for light, `.dark` for dark). All components consume `var(--sf-*)` variables — no need to change individual components.
