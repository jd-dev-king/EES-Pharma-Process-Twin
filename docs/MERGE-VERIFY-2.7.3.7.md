# Sprint 2.7.3.7 Merge Verification

Verify the canonical frontend contains:

```bash
grep -n "Bulk Unload HMI Synchronization Hotfix" frontend/src/App.tsx
grep -n "refreshBulkState" frontend/src/App.tsx
grep -n "runBulkAction" frontend/src/App.tsx
```

Expected bulk behavior:

1. Office schedules a tanker and its status appears immediately.
2. Warehouse inspection and pre-unload sampling update without reopening the zone.
3. QA disposition updates Warehouse immediately.
4. Automatic unloading advances every 1.6 seconds.
5. PG-101 inventory increases at unload completion without Force Reset.
6. Automatic PG transfer refreshes the active Mixing HMI.
