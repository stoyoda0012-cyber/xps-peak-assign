#!/usr/bin/env python3
"""Convert XPS CSV data files to JSON for the web app."""
import json
import os
import sys
import math

COMMON_DATA = "/Users/toyodasatoshi/MATLAB-Drive/SourceCode/Common/data"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data")

AL_KA = 1486.6  # eV


def read_csv_with_cr(path):
    """Read CSV that may use CR line endings."""
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    # Normalize line endings
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = [l for l in raw.split("\n") if l.strip()]
    return lines


def convert_binding_energies():
    """BindingEnergyTable.csv -> binding-energies.json"""
    lines = read_csv_with_cr(os.path.join(COMMON_DATA, "BindingEnergyTable.csv"))
    header = lines[0].split(",")
    # header[0] = ElementNumber, [1] = ElementSymbol, [2:] = orbital names
    orbital_names = header[2:]

    entries = []
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) < 3:
            continue
        z = int(parts[0])
        symbol = parts[1].strip()
        orbitals = {}
        for i, name in enumerate(orbital_names):
            val = parts[i + 2].strip() if i + 2 < len(parts) else "NaN"
            if val and val != "NaN":
                try:
                    be = float(val)
                    if not math.isnan(be) and be <= AL_KA:
                        orbitals[name] = round(be, 1)
                except ValueError:
                    pass
        if orbitals:
            entries.append({"Z": z, "symbol": symbol, "orbitals": orbitals})

    out_path = os.path.join(OUT_DIR, "binding-energies.json")
    with open(out_path, "w") as f:
        json.dump(entries, f, indent=1)
    print(f"binding-energies.json: {len(entries)} elements, {os.path.getsize(out_path)} bytes")


def convert_cross_sections():
    """CrossSectionTable_Yeh=Lindau.csv -> cross-sections-al.json (Al Ka column only)"""
    lines = read_csv_with_cr(
        os.path.join(COMMON_DATA, "CrossSectionTable_Yeh=Lindau.csv")
    )
    header = lines[0].split(",")
    # Find Al Ka column index
    al_col = None
    for i, h in enumerate(header):
        if "1486_6" in h:
            al_col = i
            break
    if al_col is None:
        print("ERROR: Could not find Al Ka column")
        sys.exit(1)

    entries = []
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) <= al_col:
            continue
        try:
            z = int(parts[0])
        except ValueError:
            continue
        if z == 0:
            continue  # skip Photon Energy row
        symbol = parts[1].strip()
        orbital = parts[2].strip()
        try:
            be = float(parts[3])
        except ValueError:
            be = 0
        cs_str = parts[al_col].strip()
        if not cs_str:
            cs = 0.0
        else:
            try:
                cs = float(cs_str)
            except ValueError:
                cs = 0.0

        if cs > 0 and be <= AL_KA:
            entries.append(
                {
                    "symbol": symbol,
                    "orbital": orbital,
                    "bindingEnergy": round(be, 1),
                    "crossSection": cs,
                }
            )

    out_path = os.path.join(OUT_DIR, "cross-sections-al.json")
    with open(out_path, "w") as f:
        json.dump(entries, f, indent=1)
    print(f"cross-sections-al.json: {len(entries)} entries, {os.path.getsize(out_path)} bytes")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    convert_binding_energies()
    convert_cross_sections()
    print("Done!")
