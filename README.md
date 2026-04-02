# Communication Centre

Frontend application for the Kent Business College Communication Centre.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Router

## Project Structure

- `frontend/`: main frontend app
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

Install dependencies:

```bash
cd frontend
npm install
```

Start the dev server:

```bash
npm run dev
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

- This repository currently contains the frontend app only.
- Some UI flows reference local API endpoints such as `http://127.0.0.1:8000`.
- Generated folders like `frontend/node_modules`, `frontend/.vite`, and `frontend/out` should not be committed.
