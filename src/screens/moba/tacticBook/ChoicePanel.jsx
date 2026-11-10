// ============================================================================
//  screens/moba/tacticBook/ChoicePanel.jsx — 戰術書：可調整的選項（Phase 3a T13）
//
//  純呈現：groups 來自 tacticBookView()（＝ Registry 的 live 選擇，扣掉量測不到效果的）。
//  這裡不判斷哪些選項存在——收到什麼畫什麼；design 選項根本不會傳進來。
//  「專業模式」按鈕顯示但停用（3b 開放），不是可點但無效的選項。
//
//  Owner Preview UI（2026-11-10）：同一批選項重新排成三塊——
//    ① 勝利條件（一鍵預設）② 時期部署（前／中／後期各自設定）③ 整場設定（團隊／打野／三路／席位）
//  每一列標出狀態：預設（跟著模板）／已覆寫（你選的）／勝利條件（替你填的）；Registry 有、但這個模板目前不提供的選擇
//  畫成「未開放」的灰色標籤（不是按鈕、不可點、testid 不是 tb-choice-，所以可點的選項仍然恰好等於 view-model）。
//  可點的選項按鈕、tb-dim-*、tb-group-*、tb-wc-filled-* 的 testid 與之前相同。
// ============================================================================
import React from "react";
import { EFFECT_HINTS, DEPLOY_FIELDS, effectHintOf } from "./tacticBookOptions.js";

const TAG = { default: ["is-default", "預設"], override: ["is-override", "已覆寫"], win: ["is-win", "勝利條件"] };

/** 一個維度：標題＋狀態＋可點的選項＋未開放的標籤。 */
function DimRow({ d, meta = null, onChoose, label = null, showHint = false }) {
  const status = d.quick ? (d.explicit ? "override" : "default") : meta?.status ?? (d.explicit ? "override" : d.fromWinCondition ? "win" : "default");
  const [cls, text] = TAG[status];
  const hint = showHint ? effectHintOf(d.dimension) : null;
  return (
    <div className="tbx-dim" data-testid={`tb-dim-${d.dimension}`} data-status={status} role="radiogroup" aria-label={d.label}>
      <div className="tbx-dim-head">
        <span className="tbx-dim-label">{label ?? d.label}</span>
        <span className={`tbx-tag ${cls}`} {...(d.fromWinCondition ? { "data-testid": `tb-wc-filled-${d.dimension}` } : {})}>{text}</span>
      </div>
      <div className="tbx-opts">
        {d.templateCustom && (
          <button type="button" role="radio" aria-checked={!d.explicit} className="tbx-opt"
            data-testid={`tb-choice-${d.dimension}-_template`} data-selected={!d.explicit ? "1" : "0"}
            onClick={() => onChoose?.(d.dimension, null, d.own)}>
            模板值<span className="tbx-opt-def" aria-hidden="true">預設</span>
          </button>
        )}
        {d.choices.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.selected} className="tbx-opt"
            data-testid={`tb-choice-${d.dimension}-${c.id}`} data-selected={c.selected ? "1" : "0"}
            onClick={() => onChoose?.(d.dimension, c.id, d.fromWinCondition ? null : d.own)}>
            {c.label}{c.isTemplateDefault && <span className="tbx-opt-def" aria-hidden="true">預設</span>}
          </button>
        ))}
        {(meta?.withheld ?? []).map((w) => (
          <span key={w.id} className="tbx-locked" data-testid={`tb-withheld-${d.dimension}-${w.id}`} aria-disabled="true" title="這個選項目前未開放（尚未通過驗證）">
            {w.label}<b>未開放</b>
          </span>
        ))}
      </div>
      {hint && <div className="tbx-hint">{hint}</div>}
    </div>
  );
}

/** 只有一個值可選的維度（模板固定）。 */
function FixedRow({ f, label = null }) {
  return (
    <div className="tbx-dim" data-testid={`tb-fixed-${f.dimension}`} data-status="fixed">
      <div className="tbx-dim-head">
        <span className="tbx-dim-label" style={{ color: "var(--tbx-dim)" }}>{label ?? f.label}</span>
        <span className="tbx-tag is-fixed">模板固定</span>
      </div>
      <div className="tbx-opts">
        <span className="tbx-locked" style={{ cursor: "default" }}>{f.valueLabel}</span>
        {f.withheld.map((w) => (
          <span key={w.id} className="tbx-locked" data-testid={`tb-withheld-${f.dimension}-${w.id}`} aria-disabled="true" title="這個選項目前未開放（尚未通過驗證）">{w.label}<b>未開放</b></span>
        ))}
      </div>
    </div>
  );
}

export default function ChoicePanel({ groups, onChoose, onReset, changedCount = 0, deployment = [], dimensionMeta = {}, fixed = [] }) {
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  const win = byId.win ?? null;
  const phases = byId.phases ?? null;
  const quick = phases?.dimensions.find((d) => d.quick) ?? null;
  const matchGroups = groups.filter((g) => g.id !== "win" && g.id !== "phases");
  const fixedMatch = fixed.filter((f) => f.group !== "phases" && f.group !== "win");
  //  沒有部署表（舊呼叫端）⇒ 時期維度照舊逐列畫，不會漏掉任何選項。
  const phaseFallback = phases && !deployment.length ? phases.dimensions.filter((d) => !d.quick) : [];
  return (
    <section data-testid="tb-choice-panel" aria-label="調整戰術" className="tbx-sec">
      <div className="tbx-sec-head">
        <span className="tbx-sec-no">C</span>
        <div className="tbx-sec-titles">
          <div className="tbx-sec-title">逐項調整</div>
          <div className="tbx-sec-sub">每一列都可以分別設定，可以同時調整很多項。沒動的就照模板；只列出實際量得到效果的選項。</div>
        </div>
        <div className="tbx-sec-tools">
          {changedCount > 0 && (
            <button type="button" data-testid="tb-reset" className="tbx-ghost" onClick={onReset}>全部還原成模板（{changedCount}）</button>
          )}
          <button type="button" data-testid="tb-pro-mode" className="tbx-ghost" disabled title="專業模式將在之後的版本開放">專業模式 · 3b 開放</button>
        </div>
      </div>
      {groups.length === 0 && <div data-testid="tb-no-choices" className="tbx-note">這個模板目前沒有可以調整的選項。</div>}

      {win && (
        <div className="tbx-win" data-testid="tb-group-win">
          <div className="tbx-sub" style={{ color: "var(--tbx-gold)" }}>勝利條件<small>想走的整體路線（可不選）</small></div>
          {win.dimensions.map((d) => <DimRow key={d.dimension} d={d} meta={dimensionMeta[d.dimension]} onChoose={onChoose} label="本場路線" showHint />)}
        </div>
      )}

      {phases && (
        <div data-testid="tb-group-phases">
          <div className="tbx-sub">時期部署<small>前期 → 中期 → 後期，依比賽時間自動切換；三個時期各自設定</small></div>
          <div className="tbx-timeline" aria-hidden="true"><span>前期</span><span>中期</span><span>後期</span></div>
          <dl className="tbx-legend" data-testid="tb-phase-legend">
            {DEPLOY_FIELDS.map((fld) => (<div key={fld.id}><dt>{fld.label}</dt><dd>{EFFECT_HINTS[fld.id]}</dd></div>))}
          </dl>
          {quick && (
            <div className="tbx-quick">
              <DimRow d={quick} onChoose={onChoose} showHint />
            </div>
          )}
          <div className="tbx-phases">
            {deployment.map((p) => {
              const overrides = p.cells.filter((c) => c.dim && dimensionMeta[c.dimension]?.status !== "default").length;
              return (
                <div key={p.id} className="tbx-phase" data-phase={p.id} data-testid={`tb-phase-${p.id}`}>
                  <div className="tbx-phase-head">
                    <span className="tbx-phase-name">{p.label}</span>
                    <span className="tbx-phase-count">{overrides ? `已調整 ${overrides} 項` : "全部照模板"}</span>
                  </div>
                  {p.cells.map((c) => (c.dim
                    ? <DimRow key={c.dimension} d={c.dim} meta={dimensionMeta[c.dimension]} onChoose={onChoose} label={c.label} />
                    : <FixedRow key={c.dimension} f={c.fixed} label={c.label} />))}
                </div>
              );
            })}
          </div>
          {phaseFallback.length > 0 && (
            <div className="tbx-group" style={{ marginTop: 10 }}>
              {phaseFallback.map((d) => <DimRow key={d.dimension} d={d} meta={dimensionMeta[d.dimension]} onChoose={onChoose} showHint />)}
            </div>
          )}
        </div>
      )}

      {matchGroups.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="tbx-sub">整場設定<small>不分時期，整場比賽都適用</small></div>
          <div className="tbx-match">
            {matchGroups.map((g) => (
              <div key={g.id} className="tbx-group" data-testid={`tb-group-${g.id}`}>
                <div className="tbx-group-name">{g.label}</div>
                {g.dimensions.map((d) => <DimRow key={d.dimension} d={d} meta={dimensionMeta[d.dimension]} onChoose={onChoose} />)}
              </div>
            ))}
          </div>
          {fixedMatch.length > 0 && (
            <div className="tbx-fixed" data-testid="tb-fixed-list">
              <span className="tbx-note">這個模板固定、不能調整的項目：</span>
              {fixedMatch.map((f) => (
                <span key={f.dimension} className="tbx-chip" data-testid={`tb-fixed-${f.dimension}`}>{f.label}＝{f.valueLabel}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
