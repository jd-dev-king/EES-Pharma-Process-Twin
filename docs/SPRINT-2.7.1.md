# Sprint 2.7.1 — CIP Progress Contract Hotfix

## Corrected behavior

- CIP `tick`, `diagnose`, and `reset` requests accept a blank electronic-signature value.
- Final `verify` continues to require an electronic signature of at least three characters in the service layer.
- FastAPI no longer rejects automatic CIP progress calls with HTTP 422.
- Drain, Wash, Rinse, and Final Verification can progress without prematurely requiring a signature.

## Validation

```text
25 passed
```

The regression suite includes a direct API test that posts an empty signature to the CIP tick endpoint and confirms successful progress.
