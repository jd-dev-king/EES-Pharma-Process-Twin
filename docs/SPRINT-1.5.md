# Sprint 1.5 — Weighing & Dispensing

## Scope

- Two independent weigh rooms: WR-01 and WR-02
- PO-to-room routing validation
- Warehouse-delivery prerequisite
- Electronic weigh ticket generation
- Scale calibration status and tare interlock
- Material and lot barcode verification
- Target/tolerance validation
- Inventory deduction after successful weighment
- Fresh tare required for every material change
- Electronic completion signature
- Digital-thread event and Mixing notification

## Local validation

```bash
cd backend
source .venv/bin/activate
rm -f ees.db
python3 -m pytest -q
python3 -m uvicorn app.main:app --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm test
npm run build
npm run dev
```

## Demonstration flow

1. Register a PO routed to Weighing Staging 01 or 02.
2. Resolve material holds in Office.
3. Accept, pick, and deliver the warehouse TO.
4. Select the matching weigh room.
5. Open the electronic weigh ticket.
6. Tare the scale.
7. Scan the current material code or lot.
8. Enter an actual weight within ±2%.
9. Repeat tare → scan → weigh for every material.
10. Sign and complete the ticket.
