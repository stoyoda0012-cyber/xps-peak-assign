import { useEffect } from 'react';
import type { Language } from '../types';
import { t } from '../i18n/translations';

interface MethodPageProps {
  lang: Language;
  onClose: () => void;
}

/**
 * "How it works": the analysis pipeline, the scoring rules, how a score becomes
 * a confidence, where the reference data comes from, and what the tool cannot do.
 * Kept in sync with src/lib/{background,peak-detection,auto-identify,scoring}.ts;
 * numbers quoted here are the constants in those files.
 */
export const MethodPage: React.FC<MethodPageProps> = ({ lang, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ja = lang === 'ja';

  return (
    <div className="method-overlay" onClick={onClose}>
      <div className="method-page" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="method-header">
          <h2>{t('methodTitle', lang)}</h2>
          <button className="method-close" onClick={onClose} aria-label="close">{'×'}</button>
        </div>

        {ja ? (
          <div className="method-body">
            <section>
              <h3>1. 解析の流れ</h3>
              <ol>
                <li><strong>バックグラウンド除去</strong>: Shirley 法を反復（最大 50 回）で適用し、信号成分を取り出します。</li>
                <li><strong>ピーク検出</strong>: 平滑化した信号から極大を探し、プロミネンス（周囲からの突出高さ）がノイズに応じたしきい値を超えるものをピークとします。最も強いピークに対して小さすぎるものは除きます。</li>
                <li><strong>帯電補正</strong>: C 1s とみなせるピーク（270〜320 eV で最も強いもの）を 284.8 eV に合わせ、全ピークを同じ量だけずらします。ずれが大きすぎる場合は補正しません。帯電補正を使った場合、C は結果に常に含めます。</li>
                <li><strong>候補の照合</strong>: 各ピーク位置を元素の結合エネルギー表と比べ、許容幅（Tolerance、既定 3.0 eV。化学シフトを拾うため検索は 1.5 倍、最低 4.5 eV に広げます）の中にあるライン（光電子と Auger）を候補として集めます。ランタノイド（La〜Lu）は浅い準位が多く誤検出の原因になるため除外しています。</li>
                <li><strong>採点と順位付け</strong>: 下の規則で元素ごとにスコアを計算し、信頼度に換算して並べます。</li>
              </ol>
            </section>

            <section>
              <h3>2. 採点の規則</h3>
              <p>各元素のスコアは、まず位置一致の基礎点を求め、そこに加点と倍率を重ねます。「根拠」パネルの各行がこの規則に対応します。</p>
              <table className="method-table">
                <thead><tr><th>項目</th><th>何を見るか</th><th>効き方</th></tr></thead>
                <tbody>
                  <tr><td>位置一致</td><td>ラインごとに、表の値からのずれを幅 σ = Tolerance のガウス関数で評価。ピークが強いほど重み（1〜3 倍）を増やす。</td><td>加点（基礎点）</td></tr>
                  <tr><td>スピン軌道対</td><td>2p3/2 と 2p1/2 のような対の両方があり、分裂幅のずれが 1.5 eV 未満で、高さの比が 2j+1 則に近い。</td><td>対ごとに最大 +3.0</td></tr>
                  <tr><td>殻間の強度比</td><td>異なる殻（2p と 3s など）のピーク高さの比が、光イオン化断面積の比の 1/3〜3 倍に収まる。</td><td>殻の組ごとに最大 +1.5</td></tr>
                  <tr><td>Auger ライン</td><td>その元素の Auger ラインが許容幅内にある。</td><td>1 本ごとに最大 +2.0</td></tr>
                  <tr><td>最強ラインの欠落</td><td>最も断面積の大きいラインが測定範囲内なのに見つからない（スピン軌道対が確認できた場合は適用しない）。</td><td>×0.3</td></tr>
                  <tr><td>相方の欠落</td><td>スピン軌道対の片方だけが見つかり、もう片方が範囲内にあるのに無い（分裂幅が 2 eV を超える対のみ）。</td><td>×0.5</td></tr>
                  <tr><td>ずれの一貫性</td><td>3 本以上一致したとき、各ラインのずれの標準偏差を見る。Tolerance の半分未満なら一貫した化学シフト、Tolerance を超えれば偶然の一致とみなす。</td><td>×1.3 または ×0.3</td></tr>
                  <tr><td>複数の殻</td><td>一致したラインが 2 つ以上の殻にまたがる（ずれがばらついている場合は適用しない）。</td><td>殻が 1 つ増えるごとに ×1.3</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h3>3. スコアから信頼度へ</h3>
              <p>信頼度は、その元素のスコアを、同じスペクトル内で最も高いスコアで割った値です。したがって最上位の元素は常に 100% になり、他は相対値です。<strong>異なるスペクトル間で信頼度を比べることはできません。</strong></p>
              <p>最低信頼度（Min Confidence、既定 0.30）を下回った元素は「棄却」に回ります。ただし、そのラインの 1 本がスペクトル中の主要ピーク（プロミネンス上位）に一致し、減点を受けていない場合は、最低信頼度まで引き上げて表示します（「最低信頼度に据え置き」）。C 1s や O 1s のような単線元素はこの規則で表示されることが多く、スコアが低いのは照合できる相手が無いためで、存在が疑わしいという意味ではありません。</p>
            </section>

            <section>
              <h3>4. 使っているデータ</h3>
              <ul>
                <li><strong>結合エネルギー表</strong>（103 元素）: 標準的な内殻準位の表（Bearden &amp; Burr 1967 / Fuggle &amp; Mårtensson 1980 系統）。toyomacro の binding_energy.json と同一です。</li>
                <li><strong>光イオン化断面積</strong>: Al Kα は Yeh &amp; Lindau, <em>At. Data Nucl. Data Tables</em> 32, 1 (1985)。Ga Kα（HAXPES）は Scofield, UCRL-51326 (1973)。</li>
                <li>Mg Kα、Zr Lα、Ag Lα、Ti Kα、Cr Kα、および放射光は、現在 Al Kα の断面積表を代用しています。殻間の強度比の評価がその分不正確になります（既知の制限）。</li>
              </ul>
            </section>

            <section>
              <h3>5. 限界と注意</h3>
              <ul>
                <li>信頼度はまだ較正されていません。順位の目安として使い、最終判断はスペクトルを見て行ってください。</li>
                <li>単線元素（C、O、F、N など）は構造的に低い信頼度になります。</li>
                <li>バックグラウンドは Shirley 法のみで、Tougaard 法はありません。定量（原子 %）は行いません。</li>
                <li>CSV は「エネルギー, 強度」の 2 列で、区切りはカンマかタブです。小数点にカンマを使った形式は読めません。</li>
                <li>入力データの単位（BE/KE）の自動判定は、選択中の X 線源の光子エネルギーに依存します。放射光データでは光子エネルギーを手動で設定してください。</li>
              </ul>
            </section>
          </div>
        ) : (
          <div className="method-body">
            <section>
              <h3>1. Pipeline</h3>
              <ol>
                <li><strong>Background removal</strong>: an iterative Shirley background (up to 50 iterations) is subtracted to isolate the signal.</li>
                <li><strong>Peak detection</strong>: local maxima of the smoothed signal whose prominence (height above the surroundings) exceeds a noise-adaptive threshold are taken as peaks; peaks far weaker than the strongest one are dropped.</li>
                <li><strong>Charging correction</strong>: the strongest peak between 270 and 320 eV is taken as C 1s and moved to 284.8 eV; every peak is shifted by the same amount. Implausibly large shifts are ignored. When the correction is used, C is always kept in the results.</li>
                <li><strong>Candidate matching</strong>: each peak position is compared with the binding-energy table; every photoelectron or Auger line within the tolerance (default 3.0 eV; the search is widened to 1.5× and at least 4.5 eV to catch chemical shifts) becomes a candidate. Lanthanides (La–Lu) are excluded because their many shallow levels cause false positives.</li>
                <li><strong>Scoring and ranking</strong>: each element is scored with the rules below, converted to a confidence and sorted.</li>
              </ol>
            </section>

            <section>
              <h3>2. Scoring rules</h3>
              <p>An element's score starts from the position-match base and is then raised or lowered by the checks below. Each row of the "Why" panel corresponds to one of these rules.</p>
              <table className="method-table">
                <thead><tr><th>Rule</th><th>What is checked</th><th>Effect</th></tr></thead>
                <tbody>
                  <tr><td>Position match</td><td>Per line, a Gaussian of the deviation from the tabulated value with σ = Tolerance, weighted 1–3× by the peak's prominence.</td><td>additive base</td></tr>
                  <tr><td>Spin-orbit pair</td><td>Both members of a pair such as 2p3/2 / 2p1/2 are present, the splitting is within 1.5 eV of the expected value, and the height ratio is close to the 2j+1 rule.</td><td>up to +3.0 per pair</td></tr>
                  <tr><td>Shell intensity ratios</td><td>Peak heights of different shells (e.g. 2p vs 3s) scale like their photoionization cross-sections, within a factor of 3.</td><td>up to +1.5 per pair of shells</td></tr>
                  <tr><td>Auger line</td><td>An Auger line of the element lies within tolerance.</td><td>up to +2.0 per line</td></tr>
                  <tr><td>Strongest line missing</td><td>The line with the largest cross-section is inside the scan range but absent (not applied when a spin-orbit pair was confirmed).</td><td>×0.3</td></tr>
                  <tr><td>Partner missing</td><td>Only one member of a spin-orbit pair was found although the other lies in range (pairs split by more than 2 eV only).</td><td>×0.5</td></tr>
                  <tr><td>Shift consistency</td><td>With 3+ matched lines, the standard deviation of their shifts: below half the tolerance counts as a consistent chemical shift; above the tolerance as coincidence.</td><td>×1.3 or ×0.3</td></tr>
                  <tr><td>Multiple shells</td><td>Matched lines come from two or more shells (skipped when the shifts are inconsistent).</td><td>×1.3 per additional shell</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h3>3. From score to confidence</h3>
              <p>Confidence is the element's score divided by the highest score in the same spectrum, so the top element is always 100 % and the others are relative to it. <strong>Confidences from different spectra are not comparable.</strong></p>
              <p>Elements below the minimum confidence (default 0.30) go to "Rejected", except when one of their lines sits on a major peak (top prominence) and no penalty applied: those are raised to the minimum and shown ("held at the minimum confidence"). Single-line elements such as C 1s or O 1s usually appear this way; their low score means there is nothing to cross-check, not that their presence is doubtful.</p>
            </section>

            <section>
              <h3>4. Reference data</h3>
              <ul>
                <li><strong>Binding energies</strong> (103 elements): the standard core-level table (Bearden &amp; Burr 1967 / Fuggle &amp; Mårtensson 1980 lineage), identical to toyomacro's binding_energy.json.</li>
                <li><strong>Photoionization cross-sections</strong>: Yeh &amp; Lindau, <em>At. Data Nucl. Data Tables</em> 32, 1 (1985) for Al Kα; Scofield, UCRL-51326 (1973) for Ga Kα (HAXPES).</li>
                <li>Mg Kα, Zr Lα, Ag Lα, Ti Kα, Cr Kα and synchrotron sources currently reuse the Al Kα table, so the shell-ratio check is less accurate for them (known limitation).</li>
              </ul>
            </section>

            <section>
              <h3>5. Limitations</h3>
              <ul>
                <li>Confidences are not yet calibrated. Use them to rank candidates and confirm against the spectrum.</li>
                <li>Single-line elements (C, O, F, N, …) are structurally low-confidence.</li>
                <li>Shirley background only (no Tougaard). No quantification (atomic %).</li>
                <li>CSV must be two columns, energy and intensity, separated by comma or tab. Decimal commas are not supported.</li>
                <li>Automatic BE/KE detection of the input depends on the selected X-ray source's photon energy; set it by hand for synchrotron data.</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default MethodPage;
