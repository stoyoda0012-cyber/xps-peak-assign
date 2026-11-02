#!/usr/bin/env python3
"""Verify the bundled reference data against its toyomacro pin, and say when
toyomacro has moved on.

    python3 scripts/check-toyomacro-pin.py             # local check + upstream comparison
    python3 scripts/check-toyomacro-pin.py --offline   # local check only
    python3 scripts/check-toyomacro-pin.py --strict    # also fail when upstream data changed

Standard library only, so it runs anywhere (CI included).

Two kinds of result:

* The files in ``src/data/`` must be exactly what ``toyomacro-source.json``
  records (sha256). A mismatch means the data was edited by hand or the
  record was not regenerated. That fails the check (exit 1): fix it with
  ``npm run data:sync``.

* toyomacro's latest release (and its main branch) are compared with the pin
  by the git blob ids of the three source files, through GitHub's API. A
  newer release that changed one of them is reported as a warning (a
  ``::warning::`` annotation under GitHub Actions) but does not fail the
  check unless ``--strict``: the policy is to pick upstream changes up when
  this repository's data is next worked on, not on every release. Network
  trouble is reported and ignored.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "src" / "data"
RECORD_FILE = DATA_DIR / "toyomacro-source.json"
API = "https://api.github.com/repos/stoyoda0012-cyber/toyomacro"
CACHE_DIR = "src/toyomacro/data/_cache"
SEMVER_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
IN_ACTIONS = bool(os.environ.get("GITHUB_ACTIONS"))


def annotate(level: str, message: str) -> None:
    """Print for a human, and as a GitHub Actions annotation when running there."""
    if IN_ACTIONS:
        file = RECORD_FILE.relative_to(ROOT).as_posix()
        print(f"::{level} file={file}::{message}")
    print(f"{level.upper()}: {message}")


def api_get(path: str) -> object:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "xps-peak-assign-data-check"}
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API + path, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def check_local(record: dict) -> int:
    """Return the number of bundled files that differ from the record."""
    bad = 0
    for name, info in record["outputs"].items():
        path = DATA_DIR / name
        if not path.exists():
            annotate("error", f"src/data/{name} is missing; run `npm run data:sync`.")
            bad += 1
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != info["sha256"]:
            annotate("error", f"src/data/{name} does not match toyomacro-source.json "
                              f"(edited by hand, or the record was not regenerated); run `npm run data:sync`.")
            bad += 1
    if not bad:
        print(f"src/data matches the record: toyomacro {record['tag']} ({record['commit'][:12]}).")
    return bad


def latest_release_tag() -> str | None:
    tags = api_get("/tags?per_page=100")
    versions = []
    for t in tags:
        m = SEMVER_TAG.match(t["name"])
        if m:
            versions.append((tuple(int(g) for g in m.groups()), t["name"]))
    return max(versions)[1] if versions else None


def blob_ids(ref: str) -> dict[str, str]:
    entries = api_get(f"/contents/{CACHE_DIR}?ref={ref}")
    return {e["name"]: e["sha"] for e in entries if e.get("type") == "file"}


def changed_sources(record: dict, ref: str) -> list[str]:
    upstream = blob_ids(ref)
    changed = []
    for rel, info in record["sources"].items():
        name = rel.rsplit("/", 1)[-1]
        if upstream.get(name) != info["gitBlob"]:
            changed.append(name)
    return changed


def check_upstream(record: dict, strict: bool) -> int:
    pinned = record["tag"]
    try:
        latest = latest_release_tag()
        if latest is None:
            annotate("warning", "toyomacro has no vX.Y.Z tags; cannot compare releases.")
            return 0
        changed_at_latest = changed_sources(record, latest) if latest != pinned else []
        changed_at_main = changed_sources(record, "main")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError, KeyError) as exc:
        annotate("warning", f"could not compare with upstream toyomacro ({exc}); skipped.")
        return 0

    status = 0
    if latest != pinned:
        if changed_at_latest:
            annotate("warning", f"toyomacro {latest} is out (pinned: {pinned}) and changed "
                                f"{', '.join(changed_at_latest)}. When next touching the reference data, "
                                f"run `npm run data:sync -- --tag {latest}` and review the golden-test diff.")
            status = 1 if strict else 0
        else:
            print(f"toyomacro {latest} is out (pinned: {pinned}); the three source tables are unchanged.")
    else:
        print(f"Pinned toyomacro {pinned} is the latest release.")

    if changed_at_main:
        print(f"Note: toyomacro main has unreleased changes to {', '.join(changed_at_main)}.")
    return status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--offline", action="store_true", help="skip the upstream comparison")
    parser.add_argument("--strict", action="store_true", help="exit 1 when a newer release changed the data")
    args = parser.parse_args()

    if not RECORD_FILE.exists():
        annotate("error", "src/data/toyomacro-source.json is missing; run `npm run data:sync -- --tag vX.Y.Z`.")
        return 1
    record = json.loads(RECORD_FILE.read_text(encoding="utf-8"))

    status = 1 if check_local(record) else 0
    if not args.offline:
        status = max(status, check_upstream(record, args.strict))
    return status


if __name__ == "__main__":
    sys.exit(main())
