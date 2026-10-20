import type { Language } from '../types';

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

/**
 * Turn the compact scoring string built in scoring.ts (e.g.
 * "pos=2.91(6lines); SO(2p3/2/2p1/2)=2.17; cs_ratio=8.25; prom_floor")
 * into one human-readable sentence per component.
 *
 * Unknown tokens are passed through unchanged so nothing is silently lost
 * if scoring.ts grows a new component.
 */
export function explainDetail(detail: string, lang: Language): string[] {
  const ja = lang === 'ja';
  const out: string[] = [];
  for (const raw of detail.split(';')) {
    const tok = raw.trim();
    if (!tok) continue;
    let m: RegExpMatchArray | null;

    if ((m = tok.match(/^pos=([\d.]+)\((\d+)lines\)$/))) {
      out.push(ja
        ? `位置一致: ${m[2]} 本のラインが DB の結合エネルギーと一致 (重み付きスコア ${m[1]})`
        : `Position match: ${m[2]} line(s) at their database binding energies (weighted score ${m[1]})`);
    } else if ((m = tok.match(/^SO\((.+)\)=([\d.]+)$/))) {
      const [hi, lo] = splitLevelPair(m[1]);
      out.push(ja
        ? `スピン軌道対 ${hi} / ${lo} を分裂幅と強度比で確認 (+${m[2]})`
        : `Spin-orbit pair ${hi} / ${lo} confirmed by splitting and intensity ratio (+${m[2]})`);
    } else if ((m = tok.match(/^cs_ratio=([\d.]+)$/))) {
      out.push(ja
        ? `殻間の強度比が断面積の比と整合 (+${m[1]})`
        : `Intensity ratios between shells agree with the cross-sections (+${m[1]})`);
    } else if ((m = tok.match(/^auger=([\d.]+)$/))) {
      out.push(ja
        ? `Auger ラインも検出 (+${m[1]})`
        : `Auger line(s) also present (+${m[1]})`);
    } else if ((m = tok.match(/^penalty\(missing (.+)\)$/))) {
      out.push(ja
        ? `最強ライン ${m[1]} が測定範囲内にあるのに見つからない (スコア ×0.3)`
        : `Strongest line ${m[1]} is inside the scan range but missing (score ×0.3)`);
    } else if ((m = tok.match(/^SO_miss\((.+)\)$/))) {
      out.push(ja
        ? `スピン軌道の相方 ${m[1]} があるはずなのに見つからない (×0.5)`
        : `Spin-orbit partner ${m[1]} expected but not found (×0.5)`);
    } else if ((m = tok.match(/^scatter\(σ=([\d.]+)\)$/))) {
      out.push(ja
        ? `各ラインのずれがばらばらで、偶然の一致の可能性 (σ = ${m[1]} eV; ×0.3)`
        : `Shifts of the matched lines disagree, which suggests coincidental matches (σ = ${m[1]} eV; ×0.3)`);
    } else if ((m = tok.match(/^chem_shift\(μ=(-?[\d.]+),σ=([\d.]+)\)$/))) {
      out.push(ja
        ? `全ラインが ${m[1]} eV の一貫した化学シフトを示す (σ = ${m[2]} eV; ×1.3)`
        : `All lines share a consistent chemical shift of ${m[1]} eV (σ = ${m[2]} eV; ×1.3)`);
    } else if ((m = tok.match(/^multi\((\d+)grp\/(\d+)lines\)x([\d.]+)$/))) {
      out.push(ja
        ? `${m[1]} 個の殻にまたがる ${m[2]} 本のライン (×${m[3]})`
        : `Lines from ${m[1]} different shells (${m[2]} lines; ×${m[3]})`);
    } else if (tok === 'prom_floor') {
      out.push(ja
        ? '最低信頼度に据え置き: ラインの 1 本がスペクトル中の主要ピークに一致'
        : 'Held at the minimum confidence: one of its lines sits on a major peak of the spectrum');
    } else {
      out.push(tok);
    }
  }
  return out;
}
