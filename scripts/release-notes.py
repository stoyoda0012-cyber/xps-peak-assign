#!/usr/bin/env python3
"""Pull the release notes out of a pull-request body.

Used by .github/workflows/release.yml. Reads the PR body on stdin and prints
the text under a ``## Release notes`` heading (any case; ``Release Notes``
and ``リリースノート`` also match), up to the next ``## `` heading. A horizontal rule (``---``) does **not**
end the section: the project's notes are bilingual, English then Japanese,
separated by one. Trailing attribution lines that tools append to a PR body
("Generated with/by Claude Code", a claude.ai session link), and a rule or
blank lines left dangling above them, are dropped. Prints nothing, and
exits 0, when there is no such section: the workflow then falls back to
GitHub's generated notes.

    python3 scripts/release-notes.py < body.md
"""

from __future__ import annotations

import re
import sys

HEADING = re.compile(r"^##\s+(release\s*notes|リリースノート)\s*$", re.IGNORECASE)
NEXT = re.compile(r"^##\s")
RULE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")
ATTRIBUTION = re.compile(
    r"(generated (with|by) \[?claude code|https://claude\.ai/code/)", re.IGNORECASE
)


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
    # Drop the attribution footer: trailing attribution lines, blanks, and the
    # rule that introduced them. A rule followed by real text is kept.
    while out and (not out[-1].strip() or ATTRIBUTION.search(out[-1])):
        out.pop()
    while out and (not out[-1].strip() or RULE.match(out[-1])):
        out.pop()
    return "\n".join(out).strip()


if __name__ == "__main__":
    notes = extract(sys.stdin.read())
    if notes:
        print(notes)
