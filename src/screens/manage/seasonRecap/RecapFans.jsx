import React from "react";
import { recapStyles } from "./recapStyles.js";
import { seasonFanGrowth, formatFans } from "../../../platform/fans/fanPresentation.js";

// ============================================================================
//  RecapFans — 賽季總結的「本季支持者成長」（Fan System F4）
//
//  ── 兩種合法狀態，不要把第二種當錯誤處理 ──────────────────────────────────
//  ① 有開季快照（`fansAtSeasonStart`）⇒ 顯示 起點 → 終點 → 成長
//  ② 沒有快照（`null`，F2 之前開的賽季）⇒ **只顯示目前總數**
//     不顯示 `+0`、不顯示「—」、不顯示「未知」，也**不得回填** snapshot。
//     舊存檔沒有起點是事實，不是缺陷；把它演成 0 成長才是說謊。
//
//  ⚠ 本元件**不算任何粉絲數值**，只做相減與格式化（`seasonFanGrowth`）。
//  ⚠ 本元件**不寫任何狀態**——它是 recap，不是結算。
// ============================================================================
export default function RecapFans({ fans, fansAtSeasonStart }) {
  const growth = seasonFanGrowth({ fans, fansAtSeasonStart });
  if (growth.end === null) return null;

  return (
    <section
      data-testid="recap-fans"
      data-has-baseline={growth.hasBaseline ? "true" : "false"}
      data-delta={growth.hasBaseline ? String(growth.delta) : ""}
      data-anomaly={growth.anomaly ? "true" : "false"}
      style={{ ...recapStyles.section, ...recapStyles.prizeSection }}
    >
      <div style={recapStyles.smallSectionTitle}>支持者</div>

      {growth.hasBaseline ? (
        <>
          <div style={{ ...recapStyles.row }}>
            <span style={recapStyles.label}>本季起點</span>
            <span style={recapStyles.value}>{growth.start.toLocaleString()}</span>
          </div>
          <div style={{ ...recapStyles.row }}>
            <span style={recapStyles.label}>目前</span>
            <span style={recapStyles.value}>{growth.end.toLocaleString()}</span>
          </div>
          <div style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
            <span style={recapStyles.label}>本季成長</span>
            <span
              data-testid="recap-fans-delta"
              style={{ ...recapStyles.value, ...recapStyles.positive }}
            >
              +{growth.delta.toLocaleString()}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ ...recapStyles.row, ...recapStyles.rowLast }}>
            <span style={recapStyles.label}>目前支持者</span>
            <span data-testid="recap-fans-total" style={recapStyles.value}>
              {growth.end.toLocaleString()}
            </span>
          </div>
          {/*  ⚠ 只在**真的沒有基準**時才說這句；資料異常（end < start）
               不該用同一句話蓋過去，那是要被 verifier 抓到的 bug。 */}
          {!growth.anomaly && (
            <div style={{ ...recapStyles.label, fontSize: 9, opacity: 0.75, paddingTop: 2 }}>
              本季成長統計將從下一賽季開始
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** 給非 recap 版面（例如 CS 總結）用的極簡版：一行「本季 +N」。 */
export function RecapFansInline({ fans, fansAtSeasonStart }) {
  const growth = seasonFanGrowth({ fans, fansAtSeasonStart });
  if (growth.end === null) return null;
  return (
    <span data-testid="recap-fans-inline" data-has-baseline={growth.hasBaseline ? "true" : "false"}>
      {growth.hasBaseline
        ? `支持者 ${formatFans(growth.end)}（本季 +${growth.delta.toLocaleString()}）`
        : `支持者 ${formatFans(growth.end)}`}
    </span>
  );
}
