# Sprint 1.3 — Shared Platform Services

## Goal

Introduce the first reusable enterprise services while preserving the verified Office-to-Warehouse and training-session workflows.

## Delivered

- Persistent digital-thread event records
- Warehouse notification generation
- Enterprise event timeline API and UI
- Notification API and UI
- Deterministic scheduler conflict checks
- Python 3.10-compatible UTC timestamps
- Separate Vite and Vitest configurations
- Backend regression coverage for events, notifications, and scheduler checks

## API additions

- `GET /api/events`
- `GET /api/notifications`
- `POST /api/scheduler/check-conflicts`

## Local verification

Backend:

```bash
cd backend
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m pytest -q
python3 -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm test
npm run build
npm run dev
```
