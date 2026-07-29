# Sprint 2.7.3.3 Merge Verification

After merging, run from the canonical repository root:

```bash
grep -n "Sprint 2.7.3.2 · Departmental Bulk Workflow Integration" frontend/src/App.tsx
grep -n "Bulk Tanker Delivery Scheduler" frontend/src/App.tsx
grep -n "Bulk Tanker Receiving" frontend/src/App.tsx
grep -n "Inbound Bulk Material QA Queue" frontend/src/App.tsx
grep -n "Propylene Glycol Production Charge" frontend/src/App.tsx
grep -n "This zone is read-only" frontend/src/App.tsx
```

Expected ownership:

- Office: `Bulk Tanker Delivery Scheduler`
- Warehouse: `Bulk Tanker Receiving`
- Quality: `Inbound Bulk Material QA Queue`
- Mixing: `Propylene Glycol Production Charge`
- Bulk: read-only `Bulk Tank Farm`

The Bulk zone must not contain Schedule Tanker, QA Release, or Create PG Transfer buttons.
