# Sprint 2.7.2 — Fully Automated CIP Progression

## Purpose

Convert CIP recovery from manual tick advancement to a self-running demo sequence while preserving fault recovery and final electronic verification.

## Automatic sequence

After **Start CIP**, the frontend automatically advances active CIP runs approximately every 1.6 seconds:

1. Drain
2. Wash
3. Rinse
4. Final Verification

The automatic loop pauses when a PLC/CIP fault is generated. The operator must diagnose and reset the fault before automatic progression resumes.

## Manual controls retained

- Diagnose CIP fault
- Reset PLC after diagnosis
- Enter final electronic signature
- Verify Clean / Available

## Contract correction retained

Progress, diagnosis, and reset calls may send a blank signature. A signature of at least three characters is enforced only for final verification in the service layer.

## Validation

- TypeScript/TSX syntax validation passed for the updated frontend source.
- Sprint 2.7.1 backend regression coverage and corrected CIP request schema are preserved.
