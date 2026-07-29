# Sprint 1.2 — Frontend Foundation

## Goal

Connect a maintainable React/Vite/TypeScript interface to the verified Sprint 1.1 FastAPI API.

## Delivered vertical slice

1. Frontend requests `/api/health` and displays API/database status.
2. Frontend requests `/api/training/roles` and starts a fresh session at 0%.
3. Office registers a production order through `/api/office/register-po`.
4. Backend creates the related Warehouse transfer order.
5. Frontend refreshes the active PO and Warehouse queue.

## Local ports

- Backend: `8000`
- Frontend: `5173`

## Verification checklist

```bash
# Terminal 1
cd backend
source .venv/bin/activate
python -m pytest -q
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2
cd frontend
npm install
cp .env.example .env
npm test
npm run build
npm run dev
```

The web application should show `API Online`, allow a fresh training session, register a PO, and display its Warehouse TO.
