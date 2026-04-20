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
