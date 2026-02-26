// ============================================================================
// Element Database Types
// ============================================================================

export interface CoreLevel {
  name: string;           // e.g., "1s", "2p3/2", "3d5/2"
  bindingEnergy: number;  // eV
  crossSection: number;   // Mb at loaded photon energy
  orbitalType: string;    // 's', 'p', 'd', 'f'
}

export interface AugerLine {
  name: string;           // e.g., "KLL", "LMM"
  kineticEnergy: number;  // eV (source-independent)
}

export interface SpinOrbitPair {
  levelHigh: string;      // j = l+1/2 (e.g., "2p3/2")
  levelLow: string;       // j = l-1/2 (e.g., "2p1/2")
  splitting: number;      // eV
  ratioHigh: number;      // area ratio from 2j+1 rule
  ratioLow: number;
}

export interface XPSElement {
  symbol: string;
  atomicNumber: number;
  coreLevels: CoreLevel[];
  augerLines: AugerLine[];
  spinOrbitPairs: SpinOrbitPair[];
}

// ============================================================================
// Auto-Identification Types
// ============================================================================

export interface DetectedPeak {
  position: number;       // BE (eV)
  height: number;
  prominence: number;
  fwhmEstimate: number;   // eV
  index: number;          // array index
}

export interface MatchedLine {
  lineName: string;       // e.g., "2p3/2", "KLL(Auger)"
  lineType: 'photo' | 'auger';
  databaseBE: number;     // expected BE
  detectedBE: number;     // observed peak position
  deltaEV: number;        // detected - database
  crossSection: number;   // Mb, 0 for Auger
}

export interface ElementCandidate {
  element: string;
  confidence: number;     // 0-1
  rawScore: number;
  matchedLines: MatchedLine[];
  detail: string;
}

export interface IdentificationResult {
  elements: string[];
  confidences: Record<string, number>;
  candidates: ElementCandidate[];
  detectedPeaks: DetectedPeak[];
  signal: number[];       // background-subtracted
  background: number[];
  rejected: ElementCandidate[];
  chargingEV: number;
}

// ============================================================================
// App State Types
// ============================================================================

export interface SpectrumData {
  energy: number[];       // BE axis (eV)
  intensity: number[];    // raw counts
  name: string;           // filename or sample name
}

export interface AnalysisSettings {
  source: string;         // 'Al' for MVP
  toleranceEV: number;    // default 2.0
  minConfidence: number;  // default 0.3
  bgMethod: 'shirley';
  includeAuger: boolean;
  chargingCorrection: boolean;
}

export type Language = 'en' | 'ja';

// ============================================================================
// JSON Data Schema
// ============================================================================

export interface BindingEnergyEntry {
  Z: number;
  symbol: string;
  orbitals: Record<string, number>;
}

export interface CrossSectionEntry {
  symbol: string;
  orbital: string;
  bindingEnergy: number;
  crossSection: number;
}
