# Enterprise Execution Suite

**Sprint 3.0.10 — Final Stabilization, Documentation & Public Release Readiness**

A full-stack pharmaceutical enterprise execution and digital-twin simulator spanning planning, warehouse logistics, bulk receiving, weighing, mixing, QA, packaging, shipping, CIP, reliability, EBR, automation, historian, SCADA, 3D visualization, operational intelligence, sustainability, and workforce training.

## Release-candidate controls

The new **Release** zone provides a controlled demonstration reset. Type `RESET` to clear transactional simulator state and restore deterministic inventory and equipment master data without manually deleting the database.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Installation](docs/INSTALLATION.md)
- [Demo guide](docs/DEMO-GUIDE.md)
- [Testing](docs/TESTING.md)
- [Validation](docs/VALIDATION.md)
- [Security](docs/SECURITY.md)
- [Release checklist](docs/RELEASE-CHECKLIST.md)

# Enterprise Execution Suite — Sprint 3.0.2

Live PLC & Automation Center with modular PLC rack, ladder/FBD monitoring, read-only I/O, alarm investigation, equipment faceplates, and training scenarios.

# EES Enterprise Platform — Sprint 2.7.3.7

## Bulk PG Mix Interlock Hotfix

This hotfix connects the departmental bulk workflow to the live Mixing recipe sequence.

### Enforced recipe sequence

1. Bulk Water Addition
2. Bulk PG Verification
3. Automatic PG Charge
4. Bulk PG Confirmation
5. Manual Additions
6. Premix (when required)
7. Final Agitation

Manual additions remain interlocked until the automatic Propylene Glycol transfer is complete and the process operator selects **Confirm Bulk PG Addition**.

### Data recorded

- Source tank and released bulk lot
- Destination mix tank
- Target and transferred quantity
- Operator confirmation
- Batch mass and vessel level adjustment
- Digital-thread transfer and confirmation events

### Database

No schema change is required when upgrading from Sprint 2.7.3.4.


## Sprint 2.7.3.6 hotfix

Synchronizes the open Mixing workspace after every automatic bulk-transfer tick. When the PG transfer reaches 100%, the Batch HMI now immediately changes to **Bulk PG Confirmation** and displays **Confirm Bulk PG Addition** without requiring a manual page reload or batch reselection.


## Sprint 2.7.3.7 hotfix

- Adds a dedicated bulk-state refresh for tanker deliveries, tank farm inventory, and PG production transfers.
- Refreshes Warehouse immediately after receiving inspection, sample collection, QA release, and unload start.
- Updates unloading progress and destination-tank inventory after every automatic tick.
- Refreshes QA and Office bulk status without requiring Force Reset or reopening a zone.
- Keeps the open Mixing HMI synchronized when an automatic PG transfer changes batch phase.


## Sprint 2.7.3.10
Adds multi-tank tanker scheduling and safe per-tank demo reset controls.


## Sprint 2.7.3.10 Hotfix
Warehouse transfer-order selection now synchronizes the active PO material-readiness workspace immediately, including missing-flavor substitution controls.


## Sprint 2.7.3.10
Warehouse can request an Office-approved production quantity revision when released packaging material cannot satisfy the PO. Approval updates the PO quantity and bottle requirement and clears the raw-material transfer-order blocker.


## Sprint 3.0.1.2 — Automation Center Foundation

The Automation zone is now live with read-only PLC equipment cards, ladder/FBD monitoring, digital I/O status, alarm tracing, and links back to source equipment.


## Sprint 3.0.1.2 UI Refresh Stabilization

Prevents overlapping full-platform refreshes and limits initial hydration to one execution, eliminating cross-page KPI flicker, card reordering, and layout jumping introduced by selection-state refresh recursion.


## Sprint 3.0.1.2 stabilization

- Office PO selector is no longer overwritten by Warehouse selection synchronization.
- Same-PO weigh-room reservations are treated as an already completed bend step.
- Open Ticket resolves the room active PO and reopens an existing active ticket when present.
- Completed weigh tickets are separated from the active queue.


## Sprint 3.0.2.1 — R&D Zone Restoration Hotfix

Restores the Research & Development Laboratory as a dedicated active zone without changing the verified manufacturing or Automation Center workflows. The R&D workspace includes linked formulation programs, pilot-batch and scale-up context, development evidence, and controlled handoff guidance while keeping QA release responsibilities separate.


## Sprint 3.0.9

Introduces the modular Process Overview Digital Twin mission-control dashboard with live KPIs, animated process flow, asset telemetry, batch lanes, and digital-thread navigation.


## Sprint 3.0.6

Adds an immersive isometric 3D plant navigation layer with live equipment state, camera presets, animated material flow, asset faceplates, and direct links to department and PLC workspaces. The validated 2D overview remains available as a fallback.


## Sprint 3.0.9
Adds predictive maintenance and operational intelligence dashboards derived from live simulator state and reliability history.


## Sprint 3.0.9

Adds Workforce, Training & Skills Matrix dashboards for role readiness, certifications, skills gaps, training status, and department coverage.


## Sprint 3.0.9.1

Workforce Rendering Hotfix fixes the undefined QA backlog reference, adds safe data fallbacks, wraps the Workforce zone in an error boundary, and assigns unique operational-intelligence asset identities to prevent duplicate React keys.


## Sprint 3.0.9.2
Training sessions now progress through actionable steps, update scores, and complete at 100%.
