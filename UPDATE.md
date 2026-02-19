# SpiderFoot Modernization Changelog

This document tracks all modernization work performed on the SpiderFoot codebase, migrating from the legacy CherryPy/Mako/Bootstrap stack to a modern FastAPI/React/Tailwind architecture.

**Previous version:** 4.0.0 (last updated ~2023)
**Target:** Python 3.10+, FastAPI backend, React SPA frontend, SQLite (unchanged)

---

## Phase 0: Foundation & Dependency Updates

**Goal:** Update all dependencies, establish new project structure, no behavior changes.

### 0.1 — Updated `requirements.txt`

**Removed:**
- `CherryPy` — replaced by FastAPI/Uvicorn
- `cherrypy-cors` — replaced by FastAPI CORS middleware
- `Mako` — replaced by React SPA
- `secure` — replaced by custom security headers middleware
- `PyPDF2` — renamed upstream to `pypdf`

**Added:**
- `fastapi>=0.109.0` — async web framework
- `uvicorn[standard]>=0.27.0` — ASGI server
- `pydantic>=2.5.0` — data validation and settings
- `python-multipart>=0.0.6` — form/file upload parsing
- `python-jose[cryptography]>=3.3.0` — JWT token handling
- `passlib[bcrypt]>=1.7.4` — password hashing

**Updated upper bounds:**
- `cryptography` — `<4` to `<44`
- `pyOpenSSL` — `<22` to `<25`
- `networkx` — `<2.7` to `<4`
- `pypdf` (was PyPDF2) — `<2` to `>=3.0.0,<5`
- `python-whois` — `<0.8` to `>=0.9.0,<1`
- `publicsuffixlist` — `<0.10` to `>=0.10.0,<1`
- `python-docx` — updated to `>=0.8.11,<1`
- `python-pptx` — updated to `>=0.6.21,<1`

### 0.2 — Python Version Gate

- `sf.py`: Changed minimum Python version from 3.7 to 3.10
- `.github/workflows/tests.yaml`: Updated test matrix from `[3.7, 3.8, 3.9, 3.10]` to `[3.10, 3.11, 3.12]`
- Updated GitHub Actions versions: `checkout@v2` to `v4`, `setup-python@v2` to `v5`, `codecov@v1` to `v4`

### 0.3 — New Directory Structure

Created the following project structure:

```
api/                          # FastAPI application
  __init__.py
  app.py                      # App factory, lifespan, router mounting
  config.py                   # Settings via Pydantic BaseSettings
  dependencies.py             # Dependency injection (DB, config, auth)
  routers/
    scans.py                  # Scan CRUD + control
    results.py                # Events, correlations, search
    exports.py                # CSV/Excel/JSON/GEXF downloads
    settings.py               # Global + module config
    modules.py                # Module listing, event types, correlation rules
    system.py                 # ping, vacuum, query
    auth.py                   # Login, token refresh
    legacy.py                 # Backward-compat flat URL mappings for sfcli.py
  models/
    common.py                 # ApiResponse, ErrorResponse, StatusResponse
    scans.py                  # ScanCreate, ScanListItem, ScanStatusInfo, etc.
    results.py                # EventResult, CorrelationResult, SearchCriteria
    settings.py               # SettingsData, ModuleInfo, EventTypeInfo
  middleware/
    auth.py                   # JWT + optional Digest auth
    security_headers.py       # CSP, referrer policy, etc.
  utils/
    scan_manager.py           # Extracted scan launch logic from sfwebui.py

frontend/                     # React SPA (Vite + TypeScript)
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    api/                      # Axios-based API client
    components/
      layout/                 # Header, Layout
      scans/                  # ScanList, ScanInfo, NewScan, EventBrowser, etc.
      settings/               # SettingsPage
      common/                 # StatusBadge, RiskBadges
    hooks/                    # useScanStatus
    stores/                   # Zustand theme store
    types/                    # TypeScript types matching Pydantic models
```

### 0.4 — Test Infrastructure

- Added `httpx>=0.26.0` and `pytest-asyncio>=0.23.0` to `test/requirements.txt`
- Updated `pytest`, `pytest-cov`, `pytest-mock`, `pytest-xdist` versions
- Created FastAPI `TestClient` fixture in `test/conftest.py`

### PyPDF2 to pypdf Migration

- Updated `modules/sfp_filemeta.py`:
  - `import PyPDF2` changed to `import pypdf`
  - `PyPDF2.PdfFileReader(raw, strict=False)` changed to `pypdf.PdfReader(raw)`
  - `pdf.getDocumentInfo()` changed to `pdf.metadata`
  - `PyPDF2.generic.NullObject` changed to `pypdf.generic.NullObject`

---

## Phase 1: FastAPI API Layer

**Goal:** Migrate all 40+ JSON endpoints from `sfwebui.py` to FastAPI routers with Pydantic models.

### 1.1 — App Factory (`api/app.py`)

- Replicates initialization from `sf.py`: module loading, correlation rules, DB init
- Stores shared state in `app.state` (config, modules, correlations, logging queue)
- Mounts all routers under `/api/v1`
- Adds CORS middleware (replaces `cherrypy-cors`)
- Serves React SPA static files with fallback to `index.html` for client-side routing

### 1.2 — Pydantic Models (`api/models/`)

Formalized the implicit data contracts. Key models:

| File | Models |
|------|--------|
| `common.py` | `ErrorDetail`, `ErrorResponse`, `StatusResponse` |
| `scans.py` | `ScanStatusEnum`, `ScanCreate`, `ScanListItem`, `ScanStatusInfo`, `ScanConfig`, `ScanLogEntry`, `ScanErrorEntry` |
| `results.py` | `EventResult`, `UniqueEventResult`, `CorrelationResult`, `SearchCriteria`, `ElementTypeDiscovery` |
| `settings.py` | `SettingsData`, `SettingsUpdate`, `ModuleInfo`, `EventTypeInfo`, `CorrelationRuleInfo` |

### 1.3 — Dependency Injection (`api/dependencies.py`)

Replaced the repeated `dbh = SpiderFootDb(self.config)` pattern with FastAPI `Depends()`:
- `get_config()` — returns live configuration from app state
- `get_default_config()` — returns default configuration
- `get_db()` — creates a per-request `SpiderFootDb` instance
- `get_sf()` — creates a per-request `SpiderFoot` instance
- `get_logging_queue()` — returns the logging queue

### 1.4 — Routers (Endpoint Mapping)

40+ endpoints mapped from CherryPy to RESTful FastAPI routes:

| Old CherryPy URL | New FastAPI Route | Method |
|---|---|---|
| `/scanlist` | `/api/v1/scans` | GET |
| `/scanstatus?id=X` | `/api/v1/scans/{id}/status` | GET |
| `/scanopts?id=X` | `/api/v1/scans/{id}/config` | GET |
| `/startscan` | `/api/v1/scans` | POST |
| `/stopscan?id=X` | `/api/v1/scans/{id}/stop` | POST |
| `/scandelete?id=X` | `/api/v1/scans/{id}` | DELETE |
| `/rerunscan?id=X` | `/api/v1/scans/{id}/rerun` | POST |
| `/scanlog` | `/api/v1/scans/{id}/log` | GET |
| `/scanerrors` | `/api/v1/scans/{id}/errors` | GET |
| `/scanhistory` | `/api/v1/scans/{id}/history` | GET |
| `/scansummary` | `/api/v1/scans/{id}/summary` | GET |
| `/scancorrelations` | `/api/v1/scans/{id}/correlations` | GET |
| `/scaneventresults` | `/api/v1/scans/{id}/events` | GET |
| `/scaneventresultsunique` | `/api/v1/scans/{id}/events/unique` | GET |
| `/scanelementtypediscovery` | `/api/v1/scans/{id}/discovery` | GET |
| `/search` | `/api/v1/search` | GET |
| `/resultsetfp` | `/api/v1/scans/{id}/false-positives` | PUT |
| `/scanviz` | `/api/v1/scans/{id}/graph` | GET |
| `/scaneventresultexport` | `/api/v1/scans/{id}/export/events` | GET |
| `/scancorrelationsexport` | `/api/v1/scans/{id}/export/correlations` | GET |
| `/scanexportlogs` | `/api/v1/scans/{id}/export/logs` | GET |
| `/scanexportjsonmulti` | `/api/v1/scans/export/json` | GET |
| `/scanvizmulti` | `/api/v1/scans/export/graph` | GET |
| `/optsraw` | `/api/v1/settings` | GET |
| `/savesettingsraw` | `/api/v1/settings` | PUT |
| `/optsexport` | `/api/v1/settings/export` | GET |
| `/modules` | `/api/v1/modules` | GET |
| `/eventtypes` | `/api/v1/event-types` | GET |
| `/correlationrules` | `/api/v1/correlation-rules` | GET |
| `/ping` | `/api/v1/ping` | GET |
| `/query` | `/api/v1/query` | POST |
| `/vacuum` | `/api/v1/vacuum` | POST |

### 1.5 — Authentication (`api/middleware/auth.py`)

- JWT-based authentication for the React SPA via `POST /api/v1/auth/login`
- HTTP Digest Auth support preserved for CLI backward compatibility
- Credential source: `~/.spiderfoot/passwd` file (unchanged)
- CSRF tokens (`self.token` in sfwebui.py) made unnecessary with JWT

### 1.6 — Legacy Compatibility Router (`api/routers/legacy.py`)

Maps old flat URLs (`/ping`, `/scanlist`, `/startscan`, etc.) to new RESTful routes. Ensures `sfcli.py` continues working during migration.

### 1.7 — Scan Manager (`api/utils/scan_manager.py`)

Extracted scan launch logic from `sfwebui.py` `startscan()` method. The `multiprocessing.Process` spawn pattern is preserved; the blocking wait loop uses `asyncio.sleep()` for FastAPI compatibility.

---

## Phase 2: Server Switchover

**Goal:** Replace CherryPy with Uvicorn in `sf.py`. Single server serves both API and static files.

### Changes to `sf.py`

- Removed all `cherrypy` imports and configuration
- Removed unused `random` import
- Replaced `start_web_server()` function body with Uvicorn launch:
  ```python
  import uvicorn
  from api.app import create_app
  app = create_app(config=sfConfig, web_config=sfWebUiConfig, logging_queue=loggingQueue)
  uvicorn.run(app, host=..., port=..., ssl_keyfile=..., ssl_certfile=...)
  ```
- SSL and authentication configuration preserved
- CLI scan mode (`start_scan()`) unchanged

### Security Headers Middleware (`api/middleware/security_headers.py`)

Replaced `secure` library configuration from `sfwebui.py` with Starlette middleware providing:
- Content Security Policy (CSP)
- Referrer Policy
- X-Content-Type-Options
- X-Frame-Options

### Static File Serving

- FastAPI `StaticFiles` mount for the React build output (`frontend/dist/assets/`)
- SPA fallback: serves `index.html` for all non-API routes

---

## Phase 3: React SPA Foundation

**Goal:** Build the React shell with routing and the scan list page.

### Project Setup

- Initialized with Vite + React + TypeScript template
- **Dependencies installed:**
  - `react-router-dom@6` — multi-page routing with nested layouts
  - `@tanstack/react-query` — server state management, polling
  - `zustand` — lightweight client state management
  - `axios` — HTTP client with JWT token interceptor
  - `tailwindcss` + `@tailwindcss/vite` — utility-first CSS (replaces Bootstrap 3.4.1)

### API Client Layer (`frontend/src/api/`)

- `client.ts` — Axios instance with JWT Bearer token interceptor, base URL `/api/v1`
- `scans.ts` — typed functions for scan CRUD and status
- `results.ts` — typed functions for events, correlations, graph, search
- `settings.ts` — typed functions for settings, modules, event types

### App Shell and Routing (`App.tsx`)

Routes configured with React Router v6:
- `/` — Scan list
- `/newscan` — New scan form
- `/scaninfo/:id` — Scan detail page
- `/settings` — Settings page

All routes nested under a shared `Layout` component with `QueryClientProvider`.

### Layout (`components/layout/`)

- **Header.tsx** — Navigation bar with links to Scans, New Scan, Settings. Includes dark/light theme toggle button and link to API docs (`/docs`).
- **Layout.tsx** — Wraps content with Header and `<Outlet />` for nested routing.

### Theme System

- CSS custom properties for all colors (`--sf-primary`, `--sf-bg`, `--sf-text`, `--sf-border`, etc.)
- Light and dark themes via `.dark` class on `<html>`
- Zustand store (`stores/themeStore.ts`) with `localStorage` persistence

### Scan List Page (`components/scans/ScanList.tsx`)

Replaces `scanlist.tmpl` (46 lines) + `spiderfoot.scanlist.js` (296 lines):
- Filterable table with status filter tabs (All, Running, Finished, Failed)
- Checkbox multi-select with shift-click support
- Bulk actions: Stop, Delete, Re-run selected scans
- Color-coded status badges with animated pulse for running scans
- Risk matrix display (HIGH/MEDIUM/LOW/INFO counts)
- Auto-refresh every 10 seconds via React Query `refetchInterval`

### Common Components

- **StatusBadge.tsx** — Color-coded status badges (blue for running with pulse animation, green for finished, red for errors, etc.)
- **RiskBadges.tsx** — Inline risk matrix display with color-coded counts

---

## Phase 4: Scan Detail Page

**Goal:** Implement the scan info page with 6 sub-views.

Replaces `scaninfo.tmpl` (906 lines, 830+ lines of inline JS) split into independent React components.

### Summary Tab (inline in `ScanInfo.tsx`)

- Table showing event types, descriptions, last seen timestamps, total/unique counts
- Auto-refreshes every 5 seconds while scan is running

### Correlations Tab (inline in `ScanInfo.tsx`)

- Card-based layout showing correlation results
- Color-coded risk badges (HIGH=red, MEDIUM=orange, LOW=yellow)
- Shows correlation title, description, event count, rule ID

### Event Browser (`components/scans/EventBrowser.tsx`)

- Filterable by event type (dropdown populated from scan data)
- Toggle to hide/show false positives
- Two view modes: All Results and Unique values
- Results table with last seen, data, source, type, FP flag columns
- Auto-refreshes while scan is running

### Graph View (`components/scans/GraphView.tsx`)

- Canvas-based force-directed graph visualization
- Simple force simulation (repulsion + edge attraction + center gravity)
- Color-coded nodes by type (ROOT=blue, ENTITY=green, IP_ADDRESS=amber, etc.)
- Click-to-select nodes with detail panel
- Dark/light mode aware rendering

### Scan Log (`components/scans/ScanLog.tsx`)

- Toggle between Log and Errors views
- Configurable log limit (100/200/500/1000 entries)
- Color-coded log levels (ERROR=red, WARNING=orange, INFO=blue, DEBUG=gray)
- Auto-refreshes while scan is running

### Scan Config (`components/scans/ScanConfig.tsx`)

- Scan metadata section (name, target, created, started, ended, status)
- Enabled modules display as tags
- Searchable/filterable configuration options table with descriptions

### Scan Status Polling (`hooks/useScanStatus.ts`)

- React Query hook with 5-second polling interval
- Automatically stops polling when scan reaches terminal state (FINISHED, ABORTED, ERROR-FAILED)

---

## Phase 5: New Scan & Settings Pages

### New Scan Page (`components/scans/NewScan.tsx`)

Replaces `newscan.tmpl` (117 lines) + `spiderfoot.newscan.js` (51 lines):
- Scan name and target input fields
- Three selection mode tabs:
  - **By Use Case** — Radio cards: All, Footprint, Investigate, Passive
  - **By Data Type** — Checkbox list of event types with select/deselect all
  - **By Module** — Checkbox list of modules with select/deselect all, descriptions
- Form validation with error display
- Redirects to scan info page on successful creation

### Settings Page (`components/settings/SettingsPage.tsx`)

Replaces `opts.tmpl` (200 lines) + `spiderfoot.opts.js` (44 lines):
- Left sidebar with module list (global + per-module sections)
- Right panel with dynamic form rendering
- Boolean values rendered as True/False select dropdowns
- String values rendered as text inputs
- Save button with status feedback (saved/error)
- React Query cache invalidation on save

---

## Phase 6: CLI Migration & Cleanup

### Updated `sfcli.py`

- **JWT authentication:** Added `do_login` command for JWT token acquisition
- **Token management:** `jwt_token` attribute stored on the CLI class; automatically included in request headers when available
- **HTTP method support:** Extended `request()` method to support GET, POST, PUT, DELETE via `method` parameter
- **Digest auth fallback:** HTTP Digest Auth preserved as fallback when no JWT token is available
- **Updated all API URLs** from flat CherryPy paths to new RESTful `/api/v1/` paths:
  - `/scanlist` changed to `/api/v1/scans`
  - `/startscan` changed to `/api/v1/scans` (POST)
  - `/stopscan?id=X` changed to `/api/v1/scans/{id}/stop` (POST)
  - `/scandelete?id=X` changed to `/api/v1/scans/{id}` (DELETE)
  - `/scanopts?id=X` changed to `/api/v1/scans/{id}/config`
  - `/scanlog` changed to `/api/v1/scans/{id}/log`
  - `/scansummary` changed to `/api/v1/scans/{id}/summary`
  - `/scancorrelations` changed to `/api/v1/scans/{id}/correlations`
  - `/scaneventresults` changed to `/api/v1/scans/{id}/events`
  - `/scaneventresultsunique` changed to `/api/v1/scans/{id}/events/unique`
  - `/scanexportjsonmulti` changed to `/api/v1/scans/export/json`
  - `/scanvizmulti` changed to `/api/v1/scans/export/graph`
  - `/optsraw` changed to `/api/v1/settings` (GET)
  - `/savesettingsraw` changed to `/api/v1/settings` (PUT)
  - `/ping` changed to `/api/v1/ping`
  - `/modules` changed to `/api/v1/modules`
  - `/eventtypes` changed to `/api/v1/event-types`
  - `/correlationrules` changed to `/api/v1/correlation-rules`
  - `/query` changed to `/api/v1/query`
  - `/search` changed to `/api/v1/search`
- **Updated POST field names** for scan creation: `scanname` to `scan_name`, `scantarget` to `scan_target`, `modulelist` to `module_list`, `typelist` to `type_list`, `usecase` to `use_case`
- **Fixed bug:** `do_stop` was printing `{id}` (builtin) instead of `{scan_id}` (local variable)

### Legacy Compatibility Router

The `api/routers/legacy.py` router is preserved as a bridge, mapping all old flat CherryPy URLs to new FastAPI routes. This ensures any external tools or scripts using old URLs continue to work.

---

## Phase 7: Polish & Production Readiness

### Dockerfile Updates

**`Dockerfile`** — Modernized with 3-stage multi-stage build:
1. **Stage 1 (frontend-build):** Node 20 Alpine, `npm ci`, `npm run build`
2. **Stage 2 (python-build):** Python 3.12 Alpine, venv creation, pip install
3. **Stage 3 (final):** Python 3.12 Alpine, copies built frontend + Python venv

**`Dockerfile.full`** — Updated to include frontend build stage while preserving all CLI tool installations (nmap, nuclei, WhatWeb, testssl.sh, etc.). Updated Node.js setup to v20.

### Build Tooling

**`Makefile`** created with the following targets:

| Target | Description |
|--------|-------------|
| `make help` | Show available commands |
| `make dev` | Start development servers (API + frontend with hot reload) |
| `make build-frontend` | Build the React frontend for production |
| `make install` | Install Python and frontend dependencies |
| `make test` | Run Python tests |
| `make test-coverage` | Run tests with coverage report |
| `make lint` | Run TypeScript type checking |
| `make clean` | Clean build artifacts |
| `make docker` | Build Docker image |
| `make docker-run` | Run Docker container |

### `.dockerignore` Updates

Added `frontend/node_modules`, `frontend/dist`, `.pytest_cache`, `.mypy_cache`, `.env` to keep Docker build context clean.

### OpenAPI Documentation

FastAPI auto-generates interactive API documentation:
- Swagger UI available at `/docs`
- ReDoc available at `/redoc`
- OpenAPI JSON schema at `/openapi.json`

### Bug Fixes

**Use case module matching (scan_manager.py):**
- Frontend sent lowercase `'footprint'` but modules define title-cased `'Footprint'` in their metadata
- Fixed `NewScan.tsx` use case values to title case (Footprint, Investigate, Passive)
- Made `scan_manager.py` comparison case-insensitive with `.lower()` for robustness

**Multiprocessing context mismatch (scan_manager.py, sf.py, app.py):**
- `scan_manager.py` globally called `mp.set_start_method("spawn")`, but the logging queue was created in the default "fork" context on Linux/Docker
- Replaced global `set_start_method` with explicit `_spawn_ctx = mp.get_context("spawn")`
- All `mp.Process(...)` calls now use `_spawn_ctx.Process(...)`
- Logging queues created with `mp.get_context("spawn").Queue()` in `sf.py` and `api/app.py`

**SQL NULL handling for false positives (db.py):**
- `false_positive <> 1` excludes rows where `false_positive IS NULL` (NULL <> 1 evaluates to NULL, which is falsy)
- Fixed with `COALESCE(false_positive, 0) <> 1` in 3 SQL locations in `spiderfoot/db.py`

### Scan Detail Page UX Improvements

**Summary tab — Clickable event types:**
- Added `browseEventType` state and `handleEventTypeClick` handler in `ScanInfo.tsx`
- Clicking an event type row switches to the Browse tab pre-filtered to that type
- Added horizontal bar chart visualization (top 15 event types, pure CSS bars, also clickable)
- Summary table rows styled with cursor-pointer and blue text to signal interactivity
- `EventBrowser.tsx` accepts `initialEventType` prop with `useEffect` sync for prop changes

**Event Browser fixes (EventBrowser.tsx):**
- Changed `filterFp` default from `true` to `false` (show all results by default)
- Fixed event type dropdown: was reading `row[3]` (module name) instead of `row[10]` (event type)
- Added separate Module and Type columns to the results table

**Correlations — Expandable cards with event details:**
- Created `CorrelationCard.tsx` component with `isExpanded` state
- React Query with `enabled: isExpanded` for on-demand event fetching via `GET /scans/{id}/events?correlationId={corrId}`
- Chevron icon with rotation animation on expand
- Expanded section shows events table: Data, Source Data, Module, Identified
- Max height with scroll (`max-h-96`) for large event sets
- Dark mode support for risk badges (HIGH=red, MEDIUM=orange, LOW=yellow, INFO=blue)

**Correlations — Risk level filtering:**
- `RiskBadges.tsx` accepts optional `onRiskClick` callback prop; badges show cursor-pointer when clickable
- Clicking a risk badge in the scan header switches to the Correlations tab with that risk level pre-filtered
- Correlations tab shows filter pills (HIGH / MEDIUM / LOW / INFO) with counts at the top
- Active pill uses solid filled style, inactive pills use lighter background; clicking active pill toggles it off
- "Clear filter" link available when a filter is active

**Graph — Rewritten with react-force-graph (OpenCTI-style):**
- Replaced custom O(n²) canvas force layout with `react-force-graph-2d` and `react-force-graph-3d`
- Same libraries used by OpenCTI for threat intelligence relationship graphs
- **2D mode (default):** Canvas-based rendering with custom `nodeCanvasObject`, D3-force layout with Barnes-Hut optimization
- **3D mode:** Lazy-loaded via `React.lazy()` + `Suspense` (Three.js ~1.2MB loaded on demand, not in main bundle)
- Node coloring by entity type heuristic: IP=orange, domain=cyan, email=purple, URL=green, ASN=pink, root=red, other=gray
- Root nodes sized larger (`val=10`), other nodes sized by connection count
- Hover highlights node + direct neighbors, dims all others (adjacency map)
- Click node → details panel with label, connection count, root badge
- Toolbar: 2D/3D toggle, Zoom to Fit button, node/edge counts, color legend
- Data transform: backend Sigma.js format `{nodes, edges}` → react-force-graph `{nodes, links}` with deduplication and orphan edge filtering
- `ResizeObserver` for responsive container width
- Tuned for OSINT graphs: `d3AlphaDecay=0.02`, `d3VelocityDecay=0.3`, `cooldownTicks=200`, `warmupTicks=100`

**New dependencies added:**
- `react-force-graph-2d@^1.29.1` — 2D canvas-based force graph
- `react-force-graph-3d@^1.29.1` — 3D WebGL force graph (lazy-loaded)

---

## Phase 8: AI-Powered Scan Analysis

**Goal:** Add AI-assisted analysis of scan results, allowing users to get intelligent insights into OSINT findings and their relevance to the target entity.

### Database Changes (`spiderfoot/db.py`)

- New table `tbl_scan_ai_analysis`: stores AI analysis records with id, scan_instance_id, provider, model, mode, created, status, result_json, token_usage, error
- Auto-migration for existing databases (same pattern as correlation table migration)
- Cascade delete: AI analyses removed when scan is deleted
- CRUD methods: `aiAnalysisCreate`, `aiAnalysisUpdate`, `aiAnalysisGet`, `aiAnalysisGetById`, `aiAnalysisDelete`

### API Key Encryption (`api/services/encryption.py`)

- Fernet symmetric encryption (AES-128-CBC + HMAC) using the `cryptography` library (already a dependency)
- Persistent secret key auto-generated at `~/.spiderfoot/secret.key` with `0o600` permissions
- `encrypt_api_key()` and `decrypt_api_key()` functions for secure storage/retrieval
- API keys stored encrypted in `tbl_config` — never exposed in API responses

### AI Analysis Service (`api/services/ai_analysis.py`)

- Two analysis modes:
  - **Quick Summary:** Single LLM API call with aggregated scan data (event type counts, correlations)
  - **Deep Analysis:** Per-category analysis (Infrastructure, Email Security, Web Presence, Threats, Identity, Data Exposure) with synthesis call
- Direct HTTP calls to OpenAI and Anthropic APIs using `requests` (no SDK dependencies)
- Default models: GPT-4o (OpenAI), Claude Sonnet (Anthropic)
- Background thread execution — API returns immediately with analysis ID
- Structured JSON response schema: executive summary, risk assessment, categorized findings with relevance/recommendations, target profile

### API Endpoints (`api/routers/ai_analysis.py`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/ai/config` | AI configuration status (no secrets returned) |
| PUT | `/api/v1/ai/config` | Save AI config (encrypts API keys) |
| POST | `/api/v1/ai/config/test` | Test API key connectivity |
| POST | `/api/v1/scans/{id}/ai-analysis` | Trigger analysis (returns analysis ID) |
| GET | `/api/v1/scans/{id}/ai-analysis` | List all analyses for a scan |
| GET | `/api/v1/scans/{id}/ai-analysis/{aid}` | Get single analysis |
| DELETE | `/api/v1/scans/{id}/ai-analysis/{aid}` | Delete analysis |

### Frontend: Settings Page — AI Configuration

- Dedicated "AI Analysis" section in Settings sidebar navigation
- Provider selection (OpenAI / Anthropic)
- API key inputs with password masking, "Key configured" indicator when set
- "Test Connection" button per provider with success/failure feedback
- Default analysis mode selection (Quick / Deep)
- Separate save flow from general settings (dedicated AI config endpoints)

### Frontend: AI Insights Tab (`AiInsights.tsx`)

- New "AI Insights" tab on the scan detail page (between Graph and Log)
- **Unconfigured state:** Setup prompt with link to Settings
- **Analyze controls:** Provider and mode dropdowns, Analyze button (disabled while scan is running)
- **Running state:** Progress indicator with polling (3-second interval)
- **Results view:**
  - Executive summary card with risk assessment badge
  - Target profile card with exposure level and discovered assets
  - Severity filter pills (HIGH/MEDIUM/LOW/INFO) matching existing risk color scheme
  - Expandable category cards (sorted by priority) with findings, relevance, recommendations, related event type chips
  - Analysis metadata footer (provider, model, tokens used, timestamp)
  - Previous analyses accessible via dropdown selector
  - Delete analysis option

### No New Dependencies

- **Backend:** Uses existing `cryptography` (Fernet) and `requests`
- **Frontend:** Uses existing `@tanstack/react-query`, `axios`, `react-router-dom`

---

## Phase 8b: Natural Language Query Interface

**Goal:** Let users ask questions about scan data in plain English, with AI translating questions into database queries and returning conversational answers.

### Database Changes (`spiderfoot/db.py`)

- New table `tbl_scan_ai_chat`: stores chat messages with id, scan_instance_id, role, content, token_usage, created
- Roles: `user` (question text), `assistant` (answer text), `tool_call` (JSON of queries made), `tool_result` (JSON)
- Auto-migration for existing databases
- Cascade delete: chat messages removed when scan is deleted
- CRUD methods: `aiChatCreate`, `aiChatGet`, `aiChatDeleteAll`

### AI Query Service (`api/services/ai_query.py`)

- **LLM tool calling**: AI decides which database queries to run, executes them, and synthesizes a natural language answer
- 6 tools mapping to existing `SpiderFootDb` methods:
  - `get_scan_info` — scan name, target, status
  - `get_scan_summary` — event type counts
  - `get_events_by_type` — actual event data with limit
  - `get_unique_values` — deduplicated values with counts
  - `get_correlations` — security correlations/findings
  - `search_events` — search by value pattern
- Separate tool-calling conversation loops for OpenAI and Anthropic (both support native tool calling)
- Max 5 tool-calling iterations per question (safety limit)
- Data truncation to prevent token explosion (500 char per event, 200 results max)
- Chat context: last 20 messages (10 exchanges) sent to LLM for follow-up awareness

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/scans/{id}/ai-chat` | Send question, get answer (synchronous, ~5-15s) |
| GET | `/api/v1/scans/{id}/ai-chat` | Get chat history for a scan |
| DELETE | `/api/v1/scans/{id}/ai-chat` | Clear chat history |

### Frontend: Ask Questions Tab (`AiChat.tsx`)

- New "Ask Questions" sub-tab within AI Insights (alongside existing "AI Analysis" tab)
- Chat-style interface with:
  - User messages (right-aligned) and AI responses (left-aligned)
  - Optimistic UI: user message appears immediately, animated loading dots while waiting
  - Collapsible "data queries" section showing which tools the AI called
  - Simple markdown rendering (headers, bold, bullets, tables, code blocks)
  - Auto-scroll to bottom on new messages
  - Starter questions (clickable chips) when chat is empty
  - Enter to send, Shift+Enter for newline
  - Clear history button
  - Chat history persisted in database — survives page refreshes

---

## Phase 9: AI-Assisted Correlation Rules Interface

**Goal:** Provide a full web UI for browsing, creating, editing, and deleting correlation rules — with AI assistance for rule generation. Rules page is global (not scan-scoped) since correlation rules apply to all scans.

### Architecture: Dual Storage

- **Built-in rules** from `correlations/*.yaml` files are loaded at startup and displayed as read-only
- **User rules** stored in new `tbl_correlation_rules` DB table, fully editable through the UI
- Both sources merged at startup and after any CRUD operation via `SpiderFootCorrelator` validation
- User rules can be enabled/disabled without deletion

### Database Changes (`spiderfoot/db.py`)

- New table `tbl_correlation_rules`: id, rule_id (unique), yaml_content, enabled, created, updated
- Auto-migration for existing databases
- 6 CRUD methods: `correlationRuleCreate`, `correlationRuleUpdate`, `correlationRuleDelete`, `correlationRuleGet`, `correlationRuleGetAll`, `correlationRuleToggle`

### App Startup Changes (`api/app.py`)

- New `_load_all_correlation_rules()` helper merges file-based + DB rules, tags each with `_source`
- New `reload_correlation_rules()` function called after CRUD operations to update app state
- `app.state.correlations_dir` stored for reload access

### API Endpoints (`api/routers/correlation_rules.py`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/correlation-rules` | List all rules (built-in + user) with source/enabled status |
| GET | `/api/v1/correlation-rules/{rule_id}` | Get single rule with full YAML |
| POST | `/api/v1/correlation-rules` | Create new user rule |
| PUT | `/api/v1/correlation-rules/{rule_id}` | Update user rule |
| DELETE | `/api/v1/correlation-rules/{rule_id}` | Delete user rule |
| POST | `/api/v1/correlation-rules/{rule_id}/toggle` | Enable/disable user rule |
| POST | `/api/v1/correlation-rules/validate` | Validate YAML without saving |
| POST | `/api/v1/correlation-rules/ai-generate` | AI generates rule from description |

- Built-in rules are protected: 403 on PUT/DELETE/toggle
- Validation uses `SpiderFootCorrelator` to parse and check rule validity
- Old `/correlation-rules` endpoint removed from `modules.py`, legacy endpoint updated

### AI Rule Generation Service (`api/services/ai_rules.py`)

- Specialized system prompt with complete YAML schema reference, analysis methods, and example rules
- Available event types list injected as context (from `SpiderFootDb.eventTypes()`)
- Single synchronous LLM call (no tool calling needed)
- Supports both OpenAI and Anthropic providers (same config as existing AI features)
- Extracts YAML from `\`\`\`yaml` code fences in response
- Security hardening: treats user-provided YAML as untrusted data

### Frontend: Correlation Rules Page

- New route `/correlation-rules` with nav item "Rules" in header
- **List view** (`CorrelationRulesPage.tsx`): all rules with risk badges, source badges, filters (source/risk), enable/disable toggle and delete for user rules
- **Rule Editor** (`RuleEditor.tsx`): YAML textarea with monospace font, tab handling, validate/save buttons, read-only mode for built-in rules with "Duplicate as User Rule" button
- **AI Assistant Panel** (`AiRuleAssistant.tsx`): toggleable side panel with natural language prompt, quick actions (Generate/Explain/Improve), "Apply to Editor" button for generated YAML

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **FastAPI over Django/Flask** | Async support, automatic OpenAPI docs, Pydantic integration, high performance |
| **React over Vue/Svelte** | Largest ecosystem, team familiarity, extensible to multi-page apps |
| **Tailwind CSS over Material UI** | Lightweight, no component lock-in, easy dark mode, matches utility-first approach |
| **TanStack React Query** | Built-in polling (`refetchInterval`), caching, background refetch — critical for scan status |
| **Zustand over Redux** | Minimal boilerplate for simple state (just theme toggle currently) |
| **JWT over session cookies** | Stateless auth, works with CLI and SPA, no CSRF needed |
| **Keep SQLite** | Sufficient for single-server deployment, zero configuration, existing schema unchanged |
| **233 modules untouched** | Modules interact only with core classes, not the web layer — no changes needed |

## What Was NOT Changed

- All 233 modules in `modules/` — untouched (except `sfp_filemeta.py` for PyPDF2 to pypdf rename)
- Core classes: `SpiderFoot`, `SpiderFootDb`, `SpiderFootEvent`, `SpiderFootPlugin`, `SpiderFootTarget`
- Scan execution engine: `sfscan.py`
- Correlation engine: `SpiderFootCorrelator`
- Database schema (SQLite)
- CLI scan mode in `sf.py` (`start_scan()` function)

---

## Build & Run

```bash
# Install dependencies
make install

# Development (frontend hot reload + API)
make dev

# Production build
make build-frontend
python sf.py -l 127.0.0.1:5001

# Docker
make docker
make docker-run
```
