# Sprint 2.7.3.6 Merge Verification

After merging, verify:

```bash
grep -n "Keep the open Mixing HMI synchronized" frontend/src/App.tsx
grep -n "selectedPo, selectedTo, selectedMixBatch" frontend/src/App.tsx
```

Expected flow:

1. Automatic PG transfer reaches 100%.
2. Transfer card shows complete.
3. Batch HMI automatically changes to `Bulk PG Confirmation`.
4. `Confirm Bulk PG Addition` appears.
5. Confirmation releases Manual Additions.
