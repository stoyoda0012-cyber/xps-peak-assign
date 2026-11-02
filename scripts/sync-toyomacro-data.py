#!/usr/bin/env python3
"""Regenerate ``src/data/*.json`` from a pinned release of toyomacro.

toyomacro (https://github.com/stoyoda0012-cyber/toyomacro) is the single
source of the reference tables this app ships: the elemental binding-energy
table, the Yeh & Lindau (1985) cross-sections and the Scofield (1973)
cross-sections. This script reads them from an installed toyomacro and
writes the three slim JSON files the app bundles, plus a record of exactly
what they were made from (``src/data/toyomacro-source.json``). toyomacro
itself is never modified.

    python3 scripts/sync-toyomacro-data.py                 # re-sync at the pinned tag
    python3 scripts/sync-toyomacro-data.py --tag v0.8.0    # move the pin to another release
    python3 scripts/sync-toyomacro-data.py --check         # regenerate in memory, fail on any difference

It needs ``uv`` (https://docs.astral.sh/uv/). The script re-executes itself
in a throwaway environment that has toyomacro installed from GitHub at the
requested tag, so nothing is installed into the project. The Al Ka column is
tabulated by Yeh & Lindau; the Ga Ka values are interpolated on Scofield's
grid by toyomacro's own ``CrossSection.lookup`` (monotone cubic in log-log),
so they are the same numbers the Python tools produce.

After a sync that changes values, run ``npm test``: the golden tests pin the
pipeline output and must be updated deliberately (see CLAUDE.md).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/stoyoda0012-cyber/toyomacro"
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "src" / "data"
RECORD_FILE = DATA_DIR / "toyomacro-source.json"
WORKER_ENV = "TOYOMACRO_SYNC_WORKER"

AL_KA = 1486.6
GA_KA = 9251.7

# toyomacro files read, relative to the repository root. The record stores a
# hash of each so that check-toyomacro-pin.py can tell when an upstream
# release changed one of them.
SOURCE_FILES = {
    "binding_energy.json": "src/toyomacro/data/_cache/binding_energy.json",
    "cross_section.json": "src/toyomacro/data/_cache/cross_section.json",
    "scofield.json": "src/toyomacro/data/_cache/scofield.json",
}

OUTPUT_FILES = ("binding-energies.json", "cross-sections-al.json", "cross-sections-ga.json")


# ---------------------------------------------------------------------------
# Launcher: run the worker inside `uv run --with toyomacro@<tag>`
# ---------------------------------------------------------------------------

def read_record() -> dict | None:
    if RECORD_FILE.exists():
        with open(RECORD_FILE, encoding="utf-8") as f:
            return json.load(f)
    return None


def launch(args: argparse.Namespace) -> int:
    record = read_record()
    tag = args.tag or (record or {}).get("tag")
    if not tag:
        sys.exit("No pinned tag: pass --tag vX.Y.Z (src/data/toyomacro-source.json is missing).")

    cmd = [
        "uv", "run", "--no-project", "--quiet",
        "--with", f"toyomacro @ git+{REPO_URL}@{tag}",
        "python", str(Path(__file__).resolve()), "--tag", tag,
    ]
    if args.check:
        cmd.append("--check")
    env = {**os.environ, WORKER_ENV: "1"}
    try:
        return subprocess.call(cmd, env=env)
    except FileNotFoundError:
        sys.exit("`uv` was not found. Install it from https://docs.astral.sh/uv/ and retry.")


# ---------------------------------------------------------------------------
# Worker: build the tables with toyomacro imported
# ---------------------------------------------------------------------------

def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha(data: bytes) -> str:
    """The id git gives this content, as the GitHub contents API reports it."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def resolve_commit(tag: str) -> str:
    out = subprocess.run(
        ["git", "ls-remote", REPO_URL, f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}"],
        capture_output=True, text=True, check=True,
    ).stdout
    peeled = plain = None
    for line in out.splitlines():
        sha, ref = line.split("\t")
        if ref.endswith("^{}"):
            peeled = sha
        else:
            plain = sha
    commit = peeled or plain
    if not commit:
        sys.exit(f"Tag {tag} not found in {REPO_URL}")
    return commit


def sig(x: float, digits: int = 8) -> float:
    """Round to `digits` significant figures, so interpolated floats print cleanly."""
    return float(f"{x:.{digits}g}")


def build_tables(tag: str) -> tuple[dict[str, object], dict]:
    import toyomacro  # noqa: F401  (installed by the launcher)
    from toyomacro.data import BindingEnergy, CrossSection, get_cache_dir

    cache_dir = Path(get_cache_dir())
    installed = getattr(toyomacro, "__version__", None)
    if installed and tag.lstrip("v") != installed:
        sys.exit(f"Installed toyomacro is {installed}, but the requested tag is {tag}.")

    sources = {}
    raw = {}
    for name, rel in SOURCE_FILES.items():
        data = (cache_dir / name).read_bytes()
        raw[name] = json.loads(data)
        sources[rel] = {"sha256": sha256_of(data), "gitBlob": git_blob_sha(data)}

    # 1. Binding energies: the whole table, ordered by Z. App-side filtering
    #    by the source's photon energy happens in element-db.ts.
    elements = raw["binding_energy.json"]["elements"]
    be_rows = []
    for symbol, entry in sorted(elements.items(), key=lambda kv: kv[1]["Z"]):
        orbitals = {k: float(v) for k, v in entry["orbitals"].items() if v is not None}
        if orbitals:
            be_rows.append({"Z": entry["Z"], "symbol": symbol, "orbitals": orbitals})
    be_table = {sym: row["orbitals"] for sym, row in zip((r["symbol"] for r in be_rows), be_rows)}

    # 2. Yeh & Lindau at Al Ka: every line the table prints with a value at
    #    1486.6 eV. Bare subshell labels, as the table stores them; the app
    #    splits a doublet by the statistical branching ratio.
    al_rows = []
    yl = raw["cross_section.json"]["data"]
    yl_by_z = sorted(yl.items(), key=lambda kv: BindingEnergy.get_atomic_number(kv[0]) or 999)
    for symbol, lines in yl_by_z:
        for orbital, line in lines.items():
            be = line.get("binding_energy")
            if be is None or be > AL_KA:
                continue
            cs = CrossSection.lookup(symbol, orbital, AL_KA, table="yeh_lindau")
            if cs:
                al_rows.append({
                    "symbol": symbol, "orbital": orbital,
                    "bindingEnergy": round(float(be), 1), "crossSection": sig(cs),
                })

    # 3. Scofield at Ga Ka: one entry per bare subshell, the doublet summed
    #    by toyomacro. bindingEnergy is the deepest component of that
    #    subshell in the binding-energy table (informational; element-db.ts
    #    takes positions from the binding-energy table itself).
    ga_rows = []
    scofield = raw["scofield.json"]["data"]
    for symbol, lines in scofield.items():
        bares = sorted({orbital.rstrip("0123456789/") for orbital in lines})
        for bare in bares:
            components = [v for k, v in be_table.get(symbol, {}).items() if k.startswith(bare)]
            if not components:
                continue  # the app cannot place a line the BE table lacks
            cs = CrossSection.lookup(symbol, bare, GA_KA, table="scofield")
            if cs:
                ga_rows.append({
                    "symbol": symbol, "orbital": bare,
                    "bindingEnergy": round(max(components), 1), "crossSection": sig(cs),
                })
    ga_rows.sort(key=lambda r: (r["symbol"], r["bindingEnergy"]))

    outputs = {
        "binding-energies.json": be_rows,
        "cross-sections-al.json": al_rows,
        "cross-sections-ga.json": ga_rows,
    }
    record = {
        "_comment": "Written by scripts/sync-toyomacro-data.py. Do not edit by hand; "
                    "scripts/check-toyomacro-pin.py verifies the outputs against it.",
        "repository": REPO_URL,
        "tag": tag,
        "commit": resolve_commit(tag),
        "version": installed,
        "provenance": f"{REPO_URL}/blob/{tag}/docs/DATA_SOURCES.md",
        "photonEnergies": {"cross-sections-al.json": AL_KA, "cross-sections-ga.json": GA_KA},
        "sources": sources,
        "outputs": {},
    }
    return outputs, record


def encode(obj: object) -> bytes:
    return json.dumps(obj, indent=1, ensure_ascii=False).encode("utf-8")


def describe_diff(name: str, old: list | None, new: list) -> list[str]:
    """Human-readable summary of what changed between two table versions."""
    if old is None:
        return [f"{name}: new file ({len(new)} entries)"]
    if name == "binding-energies.json":
        key = lambda r: r["symbol"]  # noqa: E731
        flat = lambda rows: {(r["symbol"], o): v for r in rows for o, v in r["orbitals"].items()}  # noqa: E731
    else:
        key = lambda r: (r["symbol"], r["orbital"])  # noqa: E731
        flat = lambda rows: {key(r): r["crossSection"] for r in rows}  # noqa: E731
    a, b = flat(old), flat(new)
    added = sorted(set(b) - set(a))
    removed = sorted(set(a) - set(b))
    changed = sorted(k for k in set(a) & set(b) if abs(a[k] - b[k]) > 1e-12 * max(1.0, abs(a[k])))
    lines = [f"{name}: {len(old)} -> {len(new)} entries; +{len(added)} -{len(removed)} ~{len(changed)}"]
    for k in added[:20]:
        lines.append(f"  + {k}")
    for k in removed[:20]:
        lines.append(f"  - {k}")
    for k in changed[:40]:
        lines.append(f"  ~ {k}: {a[k]} -> {b[k]}")
    for label, items in (("added", added), ("removed", removed), ("changed", changed)):
        if len(items) > (40 if label == "changed" else 20):
            lines.append(f"  ... {len(items)} {label} in total")
    return lines


def worker(args: argparse.Namespace) -> int:
    outputs, record = build_tables(args.tag)
    for name, rows in outputs.items():
        data = encode(rows)
        record["outputs"][name] = {"sha256": sha256_of(data), "entries": len(rows)}

    differences = 0
    for name, rows in outputs.items():
        path = DATA_DIR / name
        old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        summary = describe_diff(name, old, rows)
        if old != rows:
            differences += 1
            print("\n".join(summary))
        else:
            print(f"{name}: unchanged ({len(rows)} entries)")

    old_record = read_record()
    record_changed = old_record != record

    if args.check:
        if differences or record_changed:
            print("\nsrc/data is not what toyomacro", args.tag, "produces. Run: npm run data:sync")
            return 1
        print("src/data matches toyomacro", args.tag)
        return 0

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for name, rows in outputs.items():
        (DATA_DIR / name).write_bytes(encode(rows))
    RECORD_FILE.write_bytes(encode(record) + b"\n")
    print(f"\nWrote {len(outputs)} tables and {RECORD_FILE.relative_to(ROOT)} "
          f"(toyomacro {args.tag}, {record['commit'][:12]}).")
    if differences:
        print("Values changed: run `npm test` and update the golden expectations deliberately.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tag", help="toyomacro release tag, e.g. v0.7.0 (default: the pinned one)")
    parser.add_argument("--check", action="store_true",
                        help="do not write; exit 1 if src/data differs from what the pin produces")
    args = parser.parse_args()
    if os.environ.get(WORKER_ENV):
        return worker(args)
    return launch(args)


if __name__ == "__main__":
    sys.exit(main())
