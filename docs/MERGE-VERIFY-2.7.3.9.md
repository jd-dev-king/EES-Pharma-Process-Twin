# Sprint 2.7.3.9 — Warehouse PO Readiness Synchronization Hotfix

## Correction

When the Warehouse operator selects a transfer order for a different production order, the frontend now reloads that PO's Office material-readiness workspace immediately.

This ensures that a missing or blocked flavor lot and the **Notify Office** substitution action appear without using the browser reset/refresh button.

## Test

1. Create or select a second PO with a missing/held flavor requirement.
2. Open Warehouse.
3. Select the new PO's transfer order.
4. Confirm the material warning and **Notify Office: Request ...** button appear immediately.
5. Select the original transfer order again and confirm its correct material workspace is restored.
