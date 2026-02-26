#!/usr/bin/env python3
"""Export NPL sample data as 2-column CSV for the web app."""
import sys
import os
import numpy as np

sys.path.insert(0, "/Users/toyodasatoshi/MATLAB-Drive/SourceCode")

from peak_analysis.wide_spectrum.data_loader import load_spectrum

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "samples")


def export_npl(npl_path, out_name, region_index=0):
    """Export NPL file as BE,Intensity CSV."""
    sp = load_spectrum(npl_path, region_index=region_index)
    energy = sp.energy  # BE
    intensity = sp.intensity

    # Ensure ascending BE
    if energy[0] > energy[-1]:
        energy = energy[::-1]
        intensity = intensity[::-1]

    out_path = os.path.join(OUT_DIR, out_name)
    with open(out_path, "w") as f:
        f.write("BindingEnergy_eV,Intensity\n")
        for e, i in zip(energy, intensity):
            f.write(f"{e:.2f},{i:.1f}\n")
    print(f"{out_name}: {len(energy)} points, {energy[0]:.1f}-{energy[-1]:.1f} eV")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)

    npl_dir = "/Users/toyodasatoshi/MATLAB-Drive/TestData/Fitting/readtest/npl"
    # AlF3 Wide survey (has charging ~24 eV)
    export_npl(os.path.join(npl_dir, "AlF3_ion_off.npl"), "alf3-wide.csv", region_index=0)
    # TiO2/FTO Wide survey
    export_npl(
        os.path.join(npl_dir, "190422_FTO_20L_TiO2ns_ion_off.npl"),
        "tio2-wide.csv",
        region_index=0,
    )
    print("Done!")
