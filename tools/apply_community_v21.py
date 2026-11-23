#!/usr/bin/env python3
"""Apply conservative, repeatable V2.1 changes to a checked-out Garmin Coaching Hub fork."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

def replace_once(source, old, new, label):
    if new in source:
        return source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one source occurrence, found {count}. No files changed.')
    return source.replace(old, new, 1)

def main():
    history_path = ROOT / 'import_garmin_history.py'
    sync_path = ROOT / 'sync_garmin.py'
    history = history_path.read_text(encoding='utf-8')
    sync = sync_path.read_text(encoding='utf-8')
    history = replace_once(history, 'if year != 2026:\n            raise ValueError()', 'if not 1 <= year <= 9999:\n            raise ValueError()', 'year restriction')
    history = replace_once(history, '"Formato richiesto: 2026-MM"', '"Formato richiesto: YYYY-MM"', 'month error message')
    history = replace_once(history, 'TIMEZONE = ZoneInfo("Europe/Rome")', 'TIMEZONE = ZoneInfo(os.environ.get("GARMIN_TIMEZONE", "Europe/Rome"))', 'history timezone')
    sync = replace_once(sync, 'TIMEZONE = ZoneInfo("Europe/Rome")', 'TIMEZONE = ZoneInfo(os.environ.get("GARMIN_TIMEZONE", "Europe/Rome"))', 'sync timezone')
    # All replacements are validated before any write.
    history_path.write_text(history, encoding='utf-8')
    sync_path.write_text(sync, encoding='utf-8')
    print('V2.1 patch applied. Review git diff, then run: python -m unittest discover -s tests -v')

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
