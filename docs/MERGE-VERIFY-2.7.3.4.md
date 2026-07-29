# Sprint 2.7.3.4 Merge Verification

After merging, verify these strings:

```bash
grep -n "Pre-Unload QA Order Hotfix" frontend/src/App.tsx
grep -n "Ready for Pre-Unload Sample" backend/app/services/platform.py
grep -n "QA Released for Unloading" backend/app/services/platform.py
```

Expected workflow: Schedule → Inspect → Pre-Unload Sample → QA Disposition → Automatic Unload.
