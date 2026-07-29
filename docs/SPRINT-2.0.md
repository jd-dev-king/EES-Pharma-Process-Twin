# Sprint 2.0 — Zoned Operations Interface

Sprint 2.0 replaces the long single-page frontend with an enterprise command center and distinct operational workspaces.

## Live zones

- Enterprise Command Center
- Office & Production Scheduling
- Warehouse Black Zone
- Weighing & Dispensing

## Planned zones visible in the navigation

- Premix & Mixing White Zone
- Packaging Grey Zone
- QA / QC Laboratories
- PLC & Automation Center
- Lean Six Sigma Center

## Preserved workflows

All Sprint 1.5 API behavior remains in place:

- PO registration and active PO workspace
- material availability and Office substitution approvals
- Warehouse priority queue, accept, pick, and deliver
- inventory and FEFO visibility
- dual weigh-room selection
- electronic weigh tickets
- tare, barcode, tolerance, and signature interlocks
- events, notifications, training sessions, and scheduler checks

## Verification

Backend:

```bash
cd backend
source .venv/bin/activate
python3 -m pytest -q
```

Frontend:

```bash
cd frontend
npm install
npm test -- --run
npm run build
npm run dev
```
