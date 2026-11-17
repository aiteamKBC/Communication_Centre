# Communication Centre

Frontend and Django backend for the Kent Business College Communication Centre.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Django

## Project Structure

- `frontend/`: main frontend app
- `backend/`: Django backend, API, media, and startup scripts
- `frontend/src/components/`: shared UI components
- `frontend/src/pages/`: route-level pages
- `frontend/src/router/config.tsx`: app routes
- `frontend/src/mocks/`: local mock data
- `frontend/src/hooks/`: shared hooks

## Available Pages

- `/`
- `/news`
- `/dashboard`
- `/risk-register`
- `/documents`
- `/departments`
- `/departments/:dept`
- `/events`
- `/feedback`
- `/training-plan`
- `/apprenticeships-timeline`
- `/administration`: users, account status, passwords, assigned roles, and account change history.

## Administration

The Administration button appears after the server verifies an active account with
**Admin Access** or Django superuser status. The page and every
`/api/administration/` endpoint enforce that same session-based access check.
IT access by itself does not permit administration.

Changes use the existing Django users and groups in `login_db`, with native Django
admin history. Ordinary application administrators manage ordinary accounts;
Django superusers also manage privileged accounts and advanced Django access.
Custom roles can be created, renamed, assigned, and deleted from **Administration
> Roles**. Each role is the same native Django `Group` shown in `/admin/auth/group/`;
its application permissions use Django `Permission` rows. No parallel role store
or copied user database is created. Built-in job roles remain protected and retain
their existing access. Accounts linked to retained records should be deactivated
rather than deleted.

The permission matrix controls Add, Edit, and Delete for news/announcements,
events, Training Plan, dashboard cards, and the department directory. Viewing user
activity/audit logs is a separate permission. Standard page viewing remains
available to every active authenticated account and is labelled **Included**.
Permissions from multiple roles and direct user grants are additive. Engagement
Centre job roles retain their existing desk/learner scope. Native permissions
outside this catalog are preserved and require a superuser to manage.

The API checks each operation independently of the browser controls. Compound
operations require their combined permissions, including all three mutation
permissions for a full Training Plan replacement. Role changes apply on the next
server request; the UI refreshes access when focused or after role saves. Role and
account changes are recorded in native Django administration history. Stale edits
require reloading, and role deletion requires its exact name for confirmation.

The `CommunicationAccess` proxy model adds no table. Its permission catalog is
created idempotently when a role is saved or the native Django Group form opens.

The original `/admin/` panel remains available to eligible staff accounts for other
registered models and permissions. Vite proxies `/api/`, `/admin/`, and `/static/`
to the backend; production routing must also serve these paths appropriately.

Run the administration checks without connecting to configured databases:

```powershell
cd backend
.\.venv\Scripts\python.exe check_isolated_tests.py login.tests login.test_administration login.test_permissions api.tests api.test_lms_reference callcentre.tests
cd ../frontend
npx playwright test --config playwright.administration.config.ts
```

## Local Development

Requirements:

- Node.js 18+ recommended
- npm
- Python environment for `backend/`

Install dependencies:

```bash
cd frontend
npm install
```

Start the dev server:

```bash
npm run dev
```

Run the backend on port 8000:

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File .\start_backend_8000.ps1
```

Run the backend in explicit local mode:

```powershell
cd backend
powershell -ExecutionPolicy Bypass -File .\start_backend_8000.ps1 -Local
```

You can also run Django manually in local mode:

```powershell
cd backend
$env:DJANGO_ENV="local"
python manage.py runserver 127.0.0.1:8000
```

Build for production:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

Run type checking:

```bash
npm run type-check
```

## Notes

- Some UI flows reference local API endpoints such as `http://127.0.0.1:8000`.
- Generated folders like `frontend/node_modules`, `frontend/.vite`, and `frontend/out` should not be committed.

## Backend Environment Modes

- Default mode loads `backend/.env` and keeps the current production-style backend flow unchanged.
- Local mode is enabled only when `DJANGO_ENV=local`.
- In local mode, Django loads `backend/.env.local`.
- If present, local mode also loads `backend/login/.env.login.local`; otherwise it falls back to `backend/login/.env.login`.
- This is intended for your separate Neon local branch, such as `local-dev`.

## Media Behavior

- Local uploaded media is stored under `backend/media/`.
- Local media is served from Django at `/media/` only for the local backend process.
- Local uploads are not auto-published to production.
- Production remains tied to the environment configured by `backend/.env`.
