# Sprint 2.1 — Premix and Mixing Execution

Sprint 2.1 activates the Premix & Mixing White Zone as a live manufacturing workspace.

## Included

- Two independent mix rooms: MR-01 / V-201 and MR-02 / V-202
- Office-assigned route fields for weigh room, mix tank, hold tank, and packaging line
- Dye-premix requirement on the production order
- Queue handoff from completed electronic weigh tickets
- Automatic bulk-water, agitation, premix, and transfer progression
- Manual-add confirmation
- Premix start/completion interlocks
- Real-time level, mass, temperature, RPM, and sequence progress
- Random PLC faults with diagnose/reset recovery
- Hold-tank cleanliness and availability validation
- LIMS transfer sample hold
- Operator route-change request and Office approval/denial
- Digital-thread events and cross-functional notifications

## Database migration note

This sprint adds mix rooms, hold tanks, mix batches, premix runs, route-change requests, and route fields on production orders. During local development, stop the backend and remove `backend/ees.db` before restarting.

## Verification

```bash
cd backend
source .venv/bin/activate
python3 -m pytest -q
```

Expected backend result: `14 passed`.
