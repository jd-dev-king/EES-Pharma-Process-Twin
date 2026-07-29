# Sprint 3.0.1.2 — Office & Weighing Synchronization Hotfix

## Fixes

- Office PO selection is no longer overwritten by the selected Warehouse transfer order.
- Warehouse-driven PO synchronization runs only while the Warehouse zone is active.
- A room reserved for the same PO is treated as an already completed bend step.
- Opening a weigh ticket resolves the room's active PO and reopens an existing active ticket when one exists.
- Completed tickets are separated from the active ticket queue.
- The Scale HMI automatically opens for the selected or newly created ticket.

No database migration is required.
