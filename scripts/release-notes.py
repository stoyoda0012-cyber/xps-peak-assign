#!/usr/bin/env python3
"""Pull the release notes out of a pull-request body.

Used by .github/workflows/release.yml. Reads the PR body on stdin and prints
the text under a ``## Release notes`` heading (any case; ``Release Notes``
and ``リリースノート`` also match), up to the next ``## `` heading. Prints
nothing, and exits 0, when there is no such section: the workflow then
falls back to GitHub's generated notes.

    python3 scripts/release-notes.py < body.md
"""

from __future__ import annotations

import re
import sys

HEADING = re.compile(r"^##\s+(release\s*notes|リリースノート)\s*$", re.IGNORECASE)
NEXT = re.compile(r"^##\s")


def extract(body: str) -> str:
    lines = body.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    inside = False
    for line in lines:
        if not inside:
            if HEADING.match(line.strip()):
                inside = True
            continue
        if NEXT.match(line):
            break
        out.append(line)
    return "\n".join(out).strip()


if __name__ == "__main__":
    notes = extract(sys.stdin.read())
    if notes:
        print(notes)
