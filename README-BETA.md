# Community Edition V2.1 beta — patch package

This package **adds or replaces** the files shown here. It does not include or overwrite the existing dashboard or Garmin scripts directly.

After copying the package into the repository root, run:

```bash
python tools/apply_community_v21.py
python -m unittest discover -s tests -v
python -m py_compile sync_garmin.py import_garmin_history.py
```

The patch script updates the complete existing `sync_garmin.py` and `import_garmin_history.py` **in place**, preserving their other logic. It is safe to run twice. Read `docs/BETA_TEST.md` for the full procedure.
