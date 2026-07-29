# Sprint 2.3 — Packaging Execution

## Scope

- PKG-01 and PKG-02 live packaging work centers
- QA-released bulk packaging queue
- Scheduled packaging-line enforcement
- Office-controlled packaging-line reassignment
- Automatic bottle/case production progress
- Random conveyor jam and PLC fault simulation
- Diagnose/reset recovery
- Finished-goods sample collection
- QA FG release, hold, and reject dispositions
- Automatic outbound Warehouse TO creation after FG release

## Demonstration flow

1. Release bulk in Quality.
2. Open Packaging and select the scheduled line.
3. Open the campaign and start the automatic line.
4. Diagnose/reset a jam if generated.
5. Collect the FG sample at 100%.
6. Release finished goods in Quality.
7. Confirm `TO-FG-<PO>` appears in Warehouse for Shipping Dock handoff.
