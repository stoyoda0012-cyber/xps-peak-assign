import type { ElementCandidate, IdentificationResult, Language } from '../types';

const LEVEL_RE = /^\d[spdf](\d\/\d)?$/;

/**
 * "2p3/2/2p1/2" -> ["2p3/2", "2p1/2"]. Level names themselves contain a slash
 * (the j value), so the pair cannot be split at the first "/"; try each split
 * point and take the one where both halves are well-formed level names.
 */
function splitLevelPair(inner: string): [string, string] {
  const parts = inner.split('/');
  for (let k = 1; k < parts.length; k++) {
    const hi = parts.slice(0, k).join('/');
    const lo = parts.slice(k).join('/');
    if (LEVEL_RE.test(hi) && LEVEL_RE.test(lo)) return [hi, lo];
  }
  return [inner, '?'];
}

/** One row of the "why" table. */
export interface ExplainRow {
  /** base: the position score everything else builds on; bonus/penalty: additive or multiplicative; note: a rule applied after scoring */
  kind: 'base' | 'bonus' | 'penalty' | 'note';
  /** What was checked, e.g. "Spin-orbit pair" */
  label: string;
  /** What was found, e.g. "2p3/2 and 2p1/2 both present; splitting and ratio match" */
  observation: string;
  /** Effect on the score, e.g. "+2.17" or "×0.3"; empty for notes */
  effect: string;
}

/**
 * Turn the compact scoring string built in scoring.ts (e.g.
 * "pos=2.91(6lines); SO(2p3/2/2p1/2)=2.17; cs_ratio=8.25; prom_floor")
 * into one structured row per component.
 *
 * Unknown tokens are passed through as a note so nothing is silently lost
 * if scoring.ts grows a new component.
 */
export function explainDetail(detail: string, lang: Language): ExplainRow[] {
  const ja = lang === 'ja';
  const rows: ExplainRow[] = [];
  for (const raw of detail.split(';')) {
    const tok = raw.trim();
    if (!tok) continue;
    let m: RegExpMatchArray | null;

    if ((m = tok.match(/^pos=([\d.]+)\((\d+)lines\)$/))) {
      rows.push({
        kind: 'base',
        label: ja ? '位置一致' : 'Position match',
        observation: ja
          ? `${m[2]} 本のラインが表の結合エネルギーの許容範囲内（ずれが小さく、ピークが強いほど高得点）`
          : `${m[2]} line(s) within tolerance of the tabulated binding energy (closer and more prominent peaks score higher)`,
        effect: `+${m[1]}`,
      });
    } else if ((m = tok.match(/^SO\((.+)\)=([\d.]+)$/))) {
      const [hi, lo] = splitLevelPair(m[1]);
      rows.push({
        kind: 'bonus',
        label: ja ? 'スピン軌道対' : 'Spin-orbit pair',
        observation: ja
          ? `${hi} と ${lo} の両方を検出し、分裂幅と強度比が期待値と一致（最大 +3.0）`
          : `${hi} and ${lo} both present; splitting and intensity ratio match expectation (max +3.0)`,
        effect: `+${m[2]}`,
      });
    } else if ((m = tok.match(/^cs_ratio=([\d.]+)$/))) {
      rows.push({
        kind: 'bonus',
        label: ja ? '殻間の強度比' : 'Shell intensity ratios',
        observation: ja
          ? '異なる殻のピーク高さの比が、光イオン化断面積の比と整合（殻の組ごとに最大 +1.5）'
          : 'Peak heights of different shells scale like their photoionization cross-sections (max +1.5 per pair of shells)',
        effect: `+${m[1]}`,
      });
    } else if ((m = tok.match(/^auger=([\d.]+)$/))) {
      rows.push({
        kind: 'bonus',
        label: ja ? 'Auger ライン' : 'Auger line',
        observation: ja
          ? 'この元素の Auger ラインも検出（1 本あたり最大 +2.0）'
          : 'An Auger line of this element is also present (max +2.0 per line)',
        effect: `+${m[1]}`,
      });
    } else if ((m = tok.match(/^penalty\(missing (.+)\)$/))) {
      rows.push({
        kind: 'penalty',
        label: ja ? '最強ラインの欠落' : 'Strongest line missing',
        observation: ja
          ? `最も強いはずの ${m[1]} が測定範囲内なのに検出されていない`
          : `${m[1]}, which should be the strongest line, lies inside the scan range but was not found`,
        effect: '×0.3',
      });
    } else if ((m = tok.match(/^SO_miss\((.+)\)$/))) {
      rows.push({
        kind: 'penalty',
        label: ja ? 'スピン軌道の相方が欠落' : 'Spin-orbit partner missing',
        observation: ja
          ? `${m[1]} が見つかるはずの位置に無い`
          : `${m[1]} is expected alongside the matched line but was not found`,
        effect: '×0.5',
      });
    } else if ((m = tok.match(/^scatter\(σ=([\d.]+)\)$/))) {
      rows.push({
        kind: 'penalty',
        label: ja ? 'ずれの一貫性' : 'Shift consistency',
        observation: ja
          ? `各ラインのずれがばらばら（σ = ${m[1]} eV）。偶然の一致の可能性が高い`
          : `The shifts of the matched lines disagree (σ = ${m[1]} eV), which suggests coincidental matches`,
        effect: '×0.3',
      });
    } else if ((m = tok.match(/^chem_shift\(μ=(-?[\d.]+),σ=([\d.]+)\)$/))) {
      rows.push({
        kind: 'bonus',
        label: ja ? 'ずれの一貫性' : 'Shift consistency',
        observation: ja
          ? `全ラインが同じ向きに ${m[1]} eV ずれている（σ = ${m[2]} eV）。化学シフトとして自然`
          : `All lines are shifted by the same ${m[1]} eV (σ = ${m[2]} eV), as a real chemical shift would be`,
        effect: '×1.3',
      });
    } else if ((m = tok.match(/^multi\((\d+)grp\/(\d+)lines\)x([\d.]+)$/))) {
      rows.push({
        kind: 'bonus',
        label: ja ? '複数の殻' : 'Multiple shells',
        observation: ja
          ? `${m[1]} 個の殻にまたがる ${m[2]} 本のラインが一致（殻が 1 つ増えるごとに ×1.3）`
          : `${m[2]} lines from ${m[1]} different shells match (×1.3 per additional shell)`,
        effect: `×${m[3]}`,
      });
    } else if (tok === 'prom_floor') {
      rows.push({
        kind: 'note',
        label: ja ? '最低信頼度に据え置き' : 'Held at the minimum confidence',
        observation: ja
          ? 'スコアは低いが、ラインの 1 本がスペクトル中の主要ピークに一致するため、最低信頼度まで引き上げて表示'
          : 'The score alone is low, but one of its lines sits on a major peak of the spectrum, so it is raised to the minimum confidence',
        effect: '',
      });
    } else if (tok === 'charging_ref') {
      rows.push({
        kind: 'note',
        label: ja ? '帯電補正の基準' : 'Charging reference',
        observation: ja
          ? 'C 1s を帯電補正の基準 (284.8 eV) として使ったため、C は常に結果に含める'
          : 'C 1s was used as the charging reference (284.8 eV), so C is always kept in the results',
        effect: '',
      });
    } else {
      rows.push({ kind: 'note', label: tok, observation: '', effect: '' });
    }
  }
  return rows;
}

/** How a raw score became the displayed confidence. */
export interface ScoreSummary {
  rawScore: number;
  /** Highest raw score among all candidates (accepted and rejected) */
  maxScore: number;
  /** Element that holds maxScore */
  topElement: string;
  /** rawScore / maxScore */
  ratio: number;
  /** The confidence actually shown (may be higher than ratio when the floor rule applied) */
  confidence: number;
  floored: boolean;
}

/**
 * Confidence is the candidate's raw score divided by the highest raw score
 * in the spectrum (so the best candidate is always 100 %), optionally raised
 * to the minimum confidence by the prominence-floor rule.
 */
export function summariseScore(cand: ElementCandidate, result: IdentificationResult): ScoreSummary {
  let maxScore = 0;
  let topElement = cand.element;
  for (const c of [...result.candidates, ...result.rejected]) {
    if (c.rawScore > maxScore) { maxScore = c.rawScore; topElement = c.element; }
  }
  if (maxScore < 1e-10) maxScore = 1;
  const ratio = cand.rawScore / maxScore;
  return {
    rawScore: cand.rawScore,
    maxScore,
    topElement,
    ratio,
    confidence: cand.confidence,
    floored: cand.confidence > ratio + 1e-6,
  };
}
