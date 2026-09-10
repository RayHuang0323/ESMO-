// ============================================================================
//  玩家挑戰（Player Challenge Slice 3）——挑戰看板 ＋ 賽前決策 ＋ 賽後對照
//
//  ── 三條誠實規則（架構文件 §6.2 ／ Owner Decision 5）─────────────────────
//  ① **不得假裝對面有真人在線。** 目前對手是決定性的練習對手，畫面照實說。
//  ② **不得宣稱有防作弊能力。** 目前是本機權威層（`trusted: false`）。
//  ③ **不得宣告系統證明不了的強弱。** 271b31d 已證明 `calcPower` 不可用作
//     可靠戰力 ⇒ 卡片上不出現任何戰力分／評分／星等；
//     只出現「快照裡讀得到的事實」與「你自己的挑戰紀錄（帶樣本數）」。
//
//  ④ **不得把對手來源的工程詞搬上主畫面。**（Slice 8）
//     快照 / provider / 來源 / 同步 這些字只活在程式碼與「挑戰規則」裡；
//     玩家在主畫面只該看到：對手、對手陣容狀態、是否更新、挑戰按鈕。
//     取不到對手時也只說「暫時無法取得對手」，不寫技術原因。
//
//  ⚠ 本檔**不 import** `teamStrength` / `calcPower`，一次都沒有。
//  ⚠ 本檔也**不 import** 任何 fixture 對手資料：對手一律來自 store 的
//    來源邊界（`opponentDirectory` / `OpponentProvider`）。換成真伺服器時
//    這個畫面一行都不用改——Slice 8 驗的就是這一條。
//  ⚠ 畫面**不組任何數值**：只送 `tacticId` / `opponentKey`，
//    快照的值一律由權威層自己查（`challenge/snapshotAuthority.js`）。
//
//  ── 手機優先 ─────────────────────────────────────────────────────────────
//  對手卡預設只顯示**兩層**資訊（身分＋一句可證明的特徵、紀錄），
//  其餘（先發、核心、流派取捨、戰術傾向）收在「查看詳情」裡。
//  所有可點擊元素 ≥44px。
// ============================================================================
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
//  ⚠ 席位→路名用**唯一那張表**，畫面不自己寫一份對照。
import { SEAT_LANE_ZH } from "../../platform/contracts/matchLineup.js";
//  UI Clarity Pass v1：規則不常駐在主畫面，收進可點開的說明。
import { InfoHint, ExpandableDetail, ChipRow } from "../../ui/Disclosure.jsx";
import "./playerChallenge.css";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { MOBA_TACTICS, mobaTacticById } from "../../platform/contracts/MobaTacticConfig.js";
import { MATCH_SOURCE, MATCH_TIER_LABELS } from "../../platform/progress/matchSource.js";
import { SNAPSHOT_AUTHORITY } from "../../platform/challenge/snapshotAuthority.js";
import { BOARD_SLOTS, tacticEvidenceRows } from "../../platform/challenge/challengeBoard.js";
//  Slice 8：對手來源的三態。⚠ 畫面**不判狀態、不寫文案**，只照 view 顯示。
import { DIRECTORY_STATUS } from "../../platform/challenge/opponentDirectory.js";
import { CHALLENGE_KINDS } from "../../platform/contracts/challengeInstance.js";
//  ⚠ 英雄名只用於**顯示**選角傾向；資料本身在快照裡是 heroId。
import { heroById } from "../../data/heroDatabase.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import ManageFrame from "../manage/ManageFrame.jsx";

const card = (accent = null) => ({
  background: GC.card, border: `1px solid ${accent ? `${accent}44` : GC.line}`,
  borderRadius: 12, padding: "12px 14px", marginBottom: 10, minWidth: 0,
});
const btn = (primary = false, disabled = false) => ({
  minHeight: 44, padding: "11px 16px", borderRadius: 10, width: "100%",
  background: disabled ? "rgba(255,255,255,0.04)" : primary ? `linear-gradient(135deg,${GC.blue},#1d4ed8)` : "rgba(255,255,255,0.06)",
  border: `1px solid ${disabled ? GC.line : primary ? GC.blueL : GC.line}`,
  color: disabled ? GC.gray : "#fff", fontSize: 13, fontWeight: 900,
  cursor: disabled ? "not-allowed" : "pointer",
});
//  ⚠ 仍然 44px 高（手指目標），只是寬度隨內容——它不是主要 CTA，
//    不該和「發起挑戰」一樣搶版面。
const smallBtn = (disabled = false) => ({
  minHeight: 44, padding: "0 14px", borderRadius: 10,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${GC.line}`,
  color: disabled ? GC.gray : "#fff", fontSize: 12, fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
});
const label = { color: GC.gray, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em" };
const chip = (c) => ({ ...label, color: c, border: `1px solid ${c}55`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" });

/** 候選位的顏色。⚠ 顏色只是分組提示，**不是**強度刻度。 */
const SLOT_TONE = {
  warmup: GC.green, even: GC.blueL, hard: GC.red,
  unusual: GC.purp, changed: GC.gold, unknown: GC.gray,
};

//  ⚠ 第一層只放**短標籤**：玩家要的是「這會不會影響我的生涯」這個答案，
//    不是五句完整的句子。完整理由在 `<ChallengeRules>` 裡。
const CAREER_SAFE = ["0 生涯成長", "不耗體力", "不推進日期", "不影響正式賽季", "無排位"];

/**
 * 完整規則的**唯一**入口。
 *
 * ⚠ 這些以前散在四個地方常駐著：頂部說明、戰術卡註解、看板免責聲明、
 *   頁尾的權威層說明。同一件事講四次，而且四段都是玩家不需要先讀的。
 * ⚠ 措辭紅線：這裡才可以出現系統語彙（快照／模擬版本），
 *   主畫面上不可以 —— 那是實作規則，不是玩家的第一層資訊。
 */
function ChallengeRules() {
  return (
    <InfoHint title="玩家挑戰規則" icon="help" text="挑戰規則" testid="challenge-rules" tone={GC.blueL}>
      <p><b>為什麼不影響生涯</b><br />
        挑戰跑的是完整的 MOBA 模擬，但結果只寫進挑戰紀錄，不寫回生涯：
        選手不會得到經驗、不會消耗體力，日期不會前進，正式賽季的戰績與名次也不會變動。
        因為不影響生涯，這裡也沒有排位分數。</p>
      <p><b>對手是誰</b><br />
        目前是固定的練習對手，<b>不是其他玩家的戰隊</b>。
        對手不會即時反應——用的是預先設定好的陣容、戰術與選角方針。</p>
      <p><b>出賽陣容什麼時候固定</b><br />
        按下「發起挑戰」的那一刻，你當下的先發與英雄熟練就固定成這一場的內容，
        之後再換先發或練熟練都只影響下一場。同一場永遠可以重算出同一個結果。</p>
      <p><b>再試一次</b><br />
        打同一份對手陣容，可以改自己的先發與戰術。它是練習用的，
        <b>不計入挑戰紀錄、也不產生任何獎勵</b>——否則重試就能把攻破率刷成任何數字。</p>
      <p><b>紀錄的範圍</b><br />
        目前在本機結算，還沒接伺服器，也還沒有防作弊機制。
        看板上的「你挑戰過幾次」只統計這個存檔自己的紀錄，不是全服資料。</p>
    </InfoHint>
  );
}

function TierBanner() {
  //  ⚠ 這是**對戰層級**（玩家挑戰／非排位），不是戰力分級。改名避免混淆。
  const matchTier = MATCH_TIER_LABELS[MATCH_SOURCE.challenge];
  return (
    <div data-testid="challenge-tier-banner" style={{ ...card(GC.purp), background: "rgba(167,139,250,0.10)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 13 }}>🤝</span>
        <span data-testid="challenge-tier-name" style={{ color: GC.purp, fontSize: 13, fontWeight: 900 }}>{matchTier.name}</span>
        <span style={chip(GC.gold)}>非排位</span>
        <span style={{ marginLeft: "auto" }}><ChallengeRules /></span>
      </div>
      {/* ⚠ 以前這裡是一句話**再加**五個 chip，兩者講的是同一件事。留 chip：
          它更短、掃一眼就看完，而且不會在手機上折成三行。 */}
      <div data-testid="challenge-career-safe" style={{ marginTop: 7 }}>
        <ChipRow dense items={CAREER_SAFE.map((t) => ({ text: t, tone: GC.green }))} />
      </div>
    </div>
  );
}

/** 對手卡。第一層＝身分＋一句事實＋你的紀錄；詳情收在展開層。 */
function OpponentCard({ c, busy, onChallenge, open, onToggle, index = 0 }) {
  const tone = SLOT_TONE[c.slot] ?? GC.gray;
  return (
    //  ⚠ `data-open` 同時驅動邊框、底色與陰影（見 playerChallenge.css）：
    //    「哪一張被展開了」不可以只靠發光表達——強光下的手機看不出來。
    <div className="esmo-cand" data-testid={`challenge-candidate-${c.key}`} data-slot={c.slot}
      data-open={open ? "1" : "0"}
      style={{ background: GC.card2, border: `1px solid ${tone}33`, borderRadius: 10, padding: "10px 12px", minWidth: 0,
        "--esmo-cand-delay": `${Math.min(index, 5) * 45}ms` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ ...label, color: GC.purp, fontFamily: MONO }}>{c.team.tag}</span>
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.team.teamName}
        </span>
        <span data-testid={`challenge-slot-${c.key}`} style={{ ...chip(tone), marginLeft: "auto" }}>
          {BOARD_SLOTS[c.slot]?.label ?? c.slot}
        </span>
      </div>

      {/* 第一層：一句可證明的特徵 ＋ 熟練（勝負的主要因素，所以放第一層） */}
      <div style={{ color: "#a1a1aa", fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>{c.traits[0]}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
        <span data-testid={`challenge-mastery-${c.key}`} style={chip(GC.blueL)}>
          英雄熟練 平均 Lv.{c.composition.avgMastery}
        </span>
        <span data-testid={`challenge-fresh-${c.key}`} style={chip(GC.gray)}>{c.freshness.label}</span>
        {/*  Slice 7：這份陣容我打過了沒。第一層只放**結論**（一個短標籤），
             完整的重複／獎勵規則走既有的第二層 InfoHint，不在卡片上展開。
             ⚠ 狀態由 Store 判（challengeEligibility），卡片不自己推。 */}
        {c.formalStateLabel && (
          <span data-testid={`challenge-formal-state-${c.key}`} data-state={c.formalState}
            style={chip(c.formalState === "updated" ? GC.gold : c.formalState === "played" ? GC.gray : GC.green)}>
            {c.formalStateLabel}
          </span>
        )}
        {c.recentLineupChange && <span style={chip(GC.gold)}>近期換過先發</span>}
        {/* ⚠ 誠實標示資料來源：fixture 不得被講成真玩家——但**標例外就夠了**。
            目前每一張卡都是練習對手，五個一模一樣的灰標籤只是在佔行高；
            「這些不是真玩家」那句話在「挑戰規則」裡講一次就夠。
            等真的有玩家戰隊時，它會是唯一被標出來的那一張 ⇒ 反而更醒目。 */}
        {c.source !== "fixture" && (
          <span data-testid={`challenge-source-${c.key}`} style={chip(GC.blueL)}>玩家戰隊</span>
        )}
      </div>

      {/* 觀測紀錄：⚠ 一定要帶樣本數，而且說明是「你的」紀錄。
          ⚠ 冷啟時每張卡都是「你還沒有挑戰過這支隊伍」——看板頂端已經說過一次了。
            打過之後這一行才有內容，那時它才值得佔一行。 */}
      {(c.record?.challenged ?? 0) > 0 && (
        <div data-testid={`challenge-record-${c.key}`} style={{ color: "#71717a", fontSize: 10.5, marginTop: 7, lineHeight: 1.6 }}>
          {c.recordLabel}
        </div>
      )}

      {/* ⚠ 以前是兩顆全寬按鈕上下疊，每張卡因此高出一倍。
          詳情是次要動作 ⇒ 縮成文字觸發點，主要 CTA 才佔按鈕的份量。 */}
      <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 8 }}>
        {/* ⚠ 本地的 `btn()` 帶 `width: 100%`。並排時必須改回 auto，
            否則兩顆各要 100% 會撐破卡片（實測：手機上主要 CTA 會掉到卡片外，
            文字被擠成一行一個字）。`minWidth: 0` 讓它在窄螢幕上縮得下去。 */}
        <button
          data-testid={`challenge-detail-${c.key}`} onClick={onToggle}
          aria-expanded={open}
          style={{ ...btn(false), fontSize: 11, minHeight: 44, padding: "0 14px", width: "auto", flex: "0 0 auto" }}
        >
          {open ? "收合" : "詳情"}
        </button>
        <button data-testid={`challenge-start-${c.key}`} onClick={onChallenge} disabled={busy !== null}
          style={{ ...btn(true, busy !== null), width: "auto", flex: "1 1 0", minWidth: 0, whiteSpace: "nowrap" }}>
          {busy === "run" ? "模擬中…" : "發起挑戰"}
        </button>
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {open && (
          <div data-testid={`challenge-detail-body-${c.key}`} style={{ display: "grid", gap: 7, padding: "2px 2px 4px" }}>
            {c.doctrine && (
              <div style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.6 }}>
                <b style={{ color: GC.purp }}>{c.doctrine.emoji} {c.doctrine.zh}</b>
                <div style={{ color: "#a1a1aa", marginTop: 2 }}>{c.doctrine.claim}</div>
              </div>
            )}
            {c.tactic && (
              <div style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.6 }}>
                預存戰術：<b style={{ color: GC.gold }}>{c.tactic.name}</b>（{c.tactic.focus}）
                {c.tactic.cons && <div style={{ color: "#a1a1aa", marginTop: 2 }}>弱點：{c.tactic.cons}</div>}
              </div>
            )}
            {c.composition.core && (
              <div style={{ fontSize: 11, color: "#d4d4d8" }}>
                熟練最高的席位：<b style={{ color: GC.blueL }}>{c.composition.core.seat}</b>
                　Lv.{c.composition.core.level}
              </div>
            )}
            <div style={{ display: "grid", gap: 3 }}>
              {c.seats.map((s) => (
                <div key={s.seat} style={{ display: "flex", gap: 8, fontSize: 10.5, color: "#a1a1aa", minWidth: 0 }}>
                  <span style={{ fontFamily: MONO, color: GC.gray, minWidth: 22 }}>{s.seat}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.playerId}</span>
                  <span style={{ marginLeft: "auto", color: GC.gray }}>Lv.{s.level ?? "—"}</span>
                </div>
              ))}
            </div>
            {c.draft?.hasPolicy && (
              <div data-testid={`challenge-draft-${c.key}`} style={{ fontSize: 11, color: "#d4d4d8", lineHeight: 1.6 }}>
                選角傾向：
                {c.draft.lines.map((l) => (
                  <div key={l} style={{ color: "#a1a1aa", marginTop: 2 }}>· {l}</div>
                ))}
              </div>
            )}
            {c.traits.slice(1).map((t) => (
              <div key={t} style={{ fontSize: 10.5, color: "#71717a" }}>· {t}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 一隻英雄的小方塊（禁用的畫成刪除線）。 */
function HeroChip({ id, nameOf, banned = false }) {
  return (
    <span style={{
      fontSize: 11, padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap",
      border: `1px solid ${banned ? "#7f1d1d" : "#3f3f46"}`,
      background: banned ? "#450a0a55" : "#27272a",
      color: banned ? "#fca5a5" : "#e4e4e7",
      textDecoration: banned ? "line-through" : "none",
    }}>{nameOf(id)}</span>
  );
}

/**
 * 這一場的選角結果。
 *
 * ⚠ 對手**不在線**：他出的是發布防守陣容時就凍結的方針。
 *   所以這裡的措辭是「依預存選角方針回應」，不是「等待對手 Ban/Pick」——
 *   後者會讓玩家以為對面有人，那是假的。
 * ⚠ 只呈現事實（誰禁了誰、誰拿到誰、最後誰站哪一路），
 *   不寫任何「你應該先禁 X」之類的結論。
 */
function DraftPanel({ view, nameOf }) {
  if (!view?.draft) return null;
  const d = view.draft;
  const SEATS = ["b1", "b2", "b3", "b4", "b5"];
  const side = (title, color, bans, seats, testid) => (
    <div data-testid={testid} style={{ minWidth: 0 }}>
      <div style={{ ...label, color }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
        {bans.length === 0
          ? <span style={{ fontSize: 11, color: GC.gray }}>沒有禁用</span>
          : bans.map((h) => <HeroChip key={h} id={h} nameOf={nameOf} banned />)}
      </div>
      <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
        {seats.map(([seat, heroId, lane]) => (
          <div key={seat} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, minWidth: 0 }}>
            <span style={{ ...label, fontFamily: MONO, color, minWidth: 20 }}>{seat}</span>
            <span style={{ ...label, color: GC.gray, minWidth: 26 }}>{lane}</span>
            <span style={{ color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(heroId)}</span>
          </div>
        ))}
      </div>
    </div>
  );
  const rowsOf = (prefix) => SEATS.map((s, i) => {
    const seat = `${prefix}${s.slice(1)}`;
    return [seat, d.assignment[seat], SEAT_LANE_ZH[SEATS[i]]];
  });

  return (
    <div data-testid="challenge-draft" style={{ marginTop: 12, borderTop: "1px solid #27272a", paddingTop: 10 }}>
      <div style={label}>這一場的選角</div>
      <div data-testid="challenge-draft-async-note" style={{ fontSize: 11, color: GC.gold, marginTop: 4, lineHeight: 1.6 }}>
        對手依預存選角方針回應（他不在線上，這不是即時 Ban/Pick）
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
        {side("我方", GC.blueL, d.bans.challenger, rowsOf("b"), "challenge-draft-mine")}
        {side("對手", GC.redL, d.bans.defender, rowsOf("r"), "challenge-draft-opponent")}
      </div>
      {view.rows.length > 0 && (
        <div data-testid="challenge-draft-compare" style={{ marginTop: 10 }}>
          <div style={label}>對手方針 vs 這一場實際</div>
          <div style={{ display: "grid", gap: 3, marginTop: 5 }}>
            {view.rows.map((r) => (
              <div key={`${r.kind}:${r.heroId}`} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, minWidth: 0 }}>
                <span style={{ color: "#e4e4e7", minWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ ...label, color: GC.gray }}>{r.kind === "priority" ? "優先選用" : r.kind.replace("seat:", "席位 ")}</span>
                {/* ⚠ 四種都是可證明的事實。「被我先選走」不可以和「他自己沒選」混為一談。 */}
                <span style={{ marginLeft: "auto", ...chip(
                  r.bannedByChallenger || r.pickedByChallenger ? GC.green : r.got ? GC.redL : GC.gray,
                ) }}>
                  {r.bannedByChallenger ? "被我禁掉"
                    : r.pickedByChallenger ? "被我先選走"
                      : r.got ? "他拿到了" : "沒拿到"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ ...label, color: "#52525b", marginTop: 8, fontFamily: MONO, wordBreak: "break-all" }}>
        draft {d.hash}　指派方式 {d.resolution.assigner}
      </div>
    </div>
  );
}

/** 賽後：宣告 vs 實際。⚠ 只並排真實數字，**不下結論**。 */
function EvidenceTable({ title, rows, testid }) {
  if (!rows?.length) return null;
  return (
    <div data-testid={testid} style={{ marginTop: 10 }}>
      <div style={label}>{title}</div>
      <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#d4d4d8", minWidth: 0 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, color: GC.gray }}>目標 {r.goal}</span>
            <span style={{ fontFamily: MONO, fontWeight: 900, minWidth: 34, textAlign: "right", color: r.met === null ? GC.gray : r.met ? GC.green : GC.redL }}>
              {r.actual === null ? "—" : r.actual}
            </span>
          </div>
        ))}
      </div>
      <div style={{ ...label, color: "#52525b", marginTop: 6, lineHeight: 1.6 }}>
        左邊是這套戰術自己宣告的觀察目標，右邊是引擎的實際計數。「—」代表引擎沒有這項統計。
      </div>
    </div>
  );
}

export default function PlayerChallengeScreen({ onBack, onDraft = null, runChallengeId = null, onRanChallenge = null }) {
  //  ── 訂閱一個**穩定字串**（Slice 2 的教訓：結算不改變筆數，簽章必須含 status）
  const sig = useProfileStore((s) => {
    const c = s.challenge;
    const order = c?.order ?? [];
    return [
      s.meta?.days ?? 0, c?.lastPublishedCareerDay ?? "-", c?.defense?.hash ?? "-",
      order.length, order.map((id) => `${id}:${c.instances[id]?.status ?? ""}`).join(","),
    ].join("|");
  });
  const heroProgress = useHeroProgressStore((s) => s.progress);
  const heroNameOf = (id) => heroById(id)?.zh ?? id;

  const view = useMemo(() => useProfileStore.getState().challengeView(), [sig]);
  //  ⚠ Slice 7：`tacticId` 必須宣告在 `board` 之前——看板要用它算陣容身分，
  //    而 const 在同一個作用域裡先用後宣告是 TDZ 錯誤，不是 undefined。
  const [tacticId, setTacticId] = useState(() => view.defense?.standingOrders?.tacticId ?? MOBA_TACTICS[0].tacticId);

  //  ── Slice 8：對手來源狀態 ─────────────────────────────────────────────
  //  ⚠ 訂閱的是 store 上的 `opponentDirectory`：`refreshOpponents()` 寫它，
  //    寫了畫面就重畫。畫面自己不記狀態，也不自己呼叫 provider。
  const dirState = useProfileStore((s) => s.opponentDirectory);
  const dir = useMemo(
    () => useProfileStore.getState().opponentDirectoryView({ heroProgress }),
    [dirState, heroProgress],
  );
  //  ⚠ 掛載時去取一次。目前 provider 是同步的，所以這一瞬間就完成；
  //    接上真 API 之後，這裡就是「正在取得對手…」真正會出現的地方。
  //    ⚠ 相依陣列刻意留空：熟練度之後才變的話，store 的 read-through
  //      會自己拿到新的一批（見 `_resolveOpponentDirectory`），不需要在這裡重取。
  useEffect(() => { useProfileStore.getState().refreshOpponents({ heroProgress }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useMemo(
    //  ⚠ `heroById` 是**函式**（`(id) => hero | null`），不是物件。
    //    寫成 `heroById?.[id]` 永遠拿到 undefined，英雄名就會全部退化成 id。
    //  ⚠ 戰術是陣容身分的一部分 ⇒ 換戰術要重算看板狀態，所以它在相依陣列裡。
    //  ⚠ `dirState`：來源重新整理之後對手可能換了一份陣容，看板要跟著重算，
    //    否則「對手更新了陣容」永遠不會出現。
    () => useProfileStore.getState().challengeBoardView({ heroProgress, heroNameOf, tacticId }),
    [sig, heroProgress, tacticId, dirState],
  );
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [openCard, setOpenCard] = useState(null);
  const [verify, setVerify] = useState(null);

  const detail = useMemo(
    () => (openId ? useProfileStore.getState().challengeDetail(openId) : null),
    [openId, sig],
  );
  //  ⚠ 讀的是**這一場凍結的** DraftResult，不重新解算（重算會得到別的陣容）。
  const draftView = useMemo(
    () => (openId ? useProfileStore.getState().challengeDraftView(openId) : null),
    [openId, sig],
  );

  const publish = () => {
    setMsg(null); setBusy("publish");
    const r = useProfileStore.getState().publishDefenseSnapshot(tacticId, { heroProgress });
    setBusy(null);
    setMsg(r.ok ? { kind: "ok", text: "防守陣容已更新" } : { kind: "err", text: r.errors[0]?.message ?? "發布失敗" });
  };

  /**
   * 再去問一次對手來源。
   *
   * ⚠ 這**不是**配對、不是排隊、不是找線上玩家。它只是「重新取得清單」。
   *   目前來源是本機固定的練習對手，所以重新整理通常拿到同一批——
   *   畫面照實呈現，不編造「找到新對手了」。
   */
  const refreshOpponents = () => {
    setMsg(null);
    useProfileStore.getState().refreshOpponents({ heroProgress });
  };

  /** 共用：建立場次 → 讓畫面先畫出「模擬中」→ 跑模擬。 */
  //  ── Slice 6：從選角頁接手開打 ─────────────────────────────────────────
  //  ⚠ 只跑一次。`ranRef` 防 StrictMode 雙掛載重複模擬（同一場跑兩次會覆蓋結果）。
  const ranRef = useRef(null);
  useEffect(() => {
    if (!runChallengeId || ranRef.current === runChallengeId) return;
    ranRef.current = runChallengeId;
    setMsg(null); setVerify(null);
    setOpenId(runChallengeId);
    setBusy("run");
    const t = setTimeout(() => {
      const r = useProfileStore.getState().runChallengeById(runChallengeId);
      setBusy(null);
      if (!r.ok) setMsg({ kind: "err", text: r.errors?.[0]?.message ?? "模擬失敗" });
      onRanChallenge?.();
    }, 30);
    return () => clearTimeout(t);
  }, [runChallengeId, onRanChallenge]);

  const runFlow = (start) => {
    setMsg(null); setVerify(null);
    const started = start();
    if (!started.ok) { setMsg({ kind: "err", text: started.errors[0]?.message ?? "無法發起挑戰" }); return; }
    setOpenId(started.challengeId);
    setBusy("run");
    //  ⚠ 模擬是同步的、會佔住主執行緒數秒。先讓瀏覽器畫出狀態再開跑。
    //    這**不是**為了假裝有網路延遲。
    setTimeout(() => {
      const r = useProfileStore.getState().runChallengeById(started.challengeId);
      setBusy(null);
      if (!r.ok) setMsg({ kind: "err", text: r.errors[0]?.message ?? "模擬失敗" });
    }, 30);
  };

  //  ── Slice 6：挑戰改成先進手動選角 ────────────────────────────────────
  //  ⚠ 這裡**不再直接建立場次**。玩家先自己 Ban/Pick，選滿之後由
  //    `ChallengeDraftRoute` 帶著 `challengerActions` 呼叫同一支
  //    `startFixtureChallenge` —— 建立場次的入口仍然只有一個。
  //  ⚠ 沒有 `onDraft`（例如舊的嵌入用法）就退回原本的直接開打，
  //    這條路徑仍然合法：不傳 actions ⇒ 由玩家自己的方針決定性補位。
  const challenge = (key) => {
    if (onDraft) {
      const r = useProfileStore.getState().beginChallengeDraft(key, { tacticId });
      if (!r.ok) { setMsg({ kind: "err", text: r.errors?.[0]?.message ?? "無法開始選角" }); return; }
      onDraft(key);
      return;
    }
    runFlow(() => useProfileStore.getState().startFixtureChallenge(key, { tacticId, heroProgress }));
  };
  const retry = (id) => runFlow(() =>
    useProfileStore.getState().retryChallenge(id, { tacticId, heroProgress }));

  const doVerify = (id) => {
    const r = useProfileStore.getState().verifyChallengeReplay(id);
    setVerify(r.ok && r.match
      ? { kind: "ok", text: "重播結果與當初完全一致" }
      : { kind: "err", text: r.reason ?? "重播對不上" });
  };

  const result = detail?.instance?.result ?? null;
  const myTactic = detail ? mobaTacticById(detail.instance.challengerTacticId) : null;
  const oppTactic = detail ? mobaTacticById(detail.instance.defenderTacticId) : null;

  return (
    //  ⚠ wide：候選卡是拿來互相比較的，460px 只放得下一欄。
    <ManageFrame title="玩家挑戰" subtitle="ASYNC UNRANKED" onBack={onBack} wide>
      <TierBanner />

      {/* ── 賽前決策：這一場要用哪一套戰術 ─────────────────────────────── */}
      <div style={card(GC.blueL)}>
        <div style={label}>這一場的戰術（也會成為你的防守預設）</div>
        <select
          data-testid="challenge-tactic-select" value={tacticId} onChange={(e) => setTacticId(e.target.value)}
          style={{ width: "100%", minHeight: 44, marginTop: 8, background: GC.card2, color: "#fff", border: `1px solid ${GC.line}`, borderRadius: 10, padding: "0 10px", fontSize: 13, fontFamily: FONT }}
        >
          {MOBA_TACTICS.map((t) => <option key={t.tacticId} value={t.tacticId}>{t.emoji} {t.name}</option>)}
        </select>
        {/* ⚠ 完整的凍結語意（快照／可重算）是系統規則，收進「挑戰規則」。
            這裡只留玩家真的要知道的那一句。 */}
        <div data-testid="challenge-entry-note" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, minWidth: 0 }}>
          <span style={{ color: "#a1a1aa", fontSize: 11 }}>本場使用目前的先發與熟練，發起時固定。</span>
          <InfoHint title="出賽陣容什麼時候固定" testid="challenge-entry-hint">
            <p>按下「發起挑戰」的那一刻，你當下的先發與英雄熟練就固定成這一場的內容。</p>
            <p>之後換先發、練熟練都只影響<b>下一場</b>；這一場無論重看幾次都是同一個結果。</p>
            <p>你在這裡選的戰術，同時也會成為別人挑戰你時的預設戰術。</p>
          </InfoHint>
        </div>
      </div>

      {/* ── 挑戰看板 ───────────────────────────────────────────────────── */}
      <div style={card()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <div style={label}>挑戰看板</div>
          <span data-testid="challenge-board-count" style={{ ...label, marginLeft: "auto", color: GC.gray }}>
            {board.candidates.length} 個候選
          </span>
          {/* ⚠ 這顆只是「再去看一次有沒有新對手」。**不做**自動輪詢、
              不顯示在線人數、不假裝對面有人（Owner §7）。 */}
          <button
            type="button"
            data-testid="challenge-refresh"
            disabled={!dir.canRetry || !!busy}
            onClick={refreshOpponents}
            style={smallBtn(!dir.canRetry || !!busy)}
          >
            {dir.retryLabel}
          </button>
        </div>
        {/* ── 來源三態：只在需要說話時才佔位 ─────────────────────────────
            ⚠ 文案由 store 的 view 給（`opponentDirectory.js` 的 `DIRECTORY_TEXT`），
              畫面不自己寫——兩邊各寫一份遲早會分歧。
            ⚠ 錯誤時**不顯示技術原因**：玩家看到的只有一句話與一顆重新整理。 */}
        {dir.message && (
          <div
            data-testid="challenge-source-state"
            data-status={dir.status}
            style={{
              marginTop: 8, padding: "9px 11px", borderRadius: 9,
              border: `1px solid ${dir.status === DIRECTORY_STATUS.error ? `${GC.red}55` : GC.line}`,
              background: dir.status === DIRECTORY_STATUS.error ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.03)",
              color: dir.status === DIRECTORY_STATUS.error ? GC.redL : GC.gray,
              fontSize: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0,
            }}
          >
            <span data-testid="challenge-source-message">{dir.message}</span>
            {dir.status !== DIRECTORY_STATUS.loading && (
              <button
                type="button"
                data-testid="challenge-source-retry"
                onClick={refreshOpponents}
                style={{ ...smallBtn(false), marginLeft: "auto" }}
              >
                {dir.retryLabel}
              </button>
            )}
          </div>
        )}
        {/* ⚠ 免責聲明搬進「挑戰規則」：它每次進來都一樣，但玩家只需要讀一次。 */}
        {board.coldStart && (
          <div data-testid="challenge-coldstart-note" style={{ color: GC.gold, fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span>還沒有挑戰紀錄，分類會隨你的戰績變準。</span>
            <InfoHint title="候選是怎麼分類的" tone={GC.gold} testid="challenge-coldstart-hint">
              <p>看板依<b>你自己打過的實際戰績</b>把對手分類，不是依戰力分數——
                這個遊戲裡沒有任何一個數字能誠實代表戰力。</p>
              <p>樣本不足時會標成「尚無足夠挑戰紀錄」，這是誠實的「還不知道」，
                不是「這隊很弱」。同一支隊伍打過三場以上才會出現攻破率。</p>
              <p>「再試一次」的場次<b>不計入</b>，否則重試就能把攻破率刷成任何數字。</p>
            </InfoHint>
          </div>
        )}
        {/* ⚠ 桌機把候選排成兩欄：1366px 下單欄會讓整頁多捲一屏，
            而候選卡本來就是拿來互相比較的——並排才比得動。 */}
        <div data-testid="challenge-board" className="esmo-challenge-board" style={{ marginTop: 10 }}>
          {board.candidates.map((c) => (
            <OpponentCard
              key={c.key} c={c} busy={busy} index={board.candidates.indexOf(c)}
              open={openCard === c.key}
              onToggle={() => setOpenCard(openCard === c.key ? null : c.key)}
              onChallenge={() => challenge(c.key)}
            />
          ))}
        </div>
      </div>

      {msg && (
        <div data-testid="challenge-message" style={{ ...card(msg.kind === "ok" ? GC.green : GC.red), color: msg.kind === "ok" ? GC.green : GC.redL, fontSize: 12 }}>
          {msg.text}
        </div>
      )}

      {/* ── 結果 ＋ 賽前情報 vs 實際 ───────────────────────────────────── */}
      {detail && (
        <div data-testid="challenge-result-card" style={card(result ? (result.outcome === "challengerWin" ? GC.green : GC.red) : GC.gray)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={label}>挑戰結果</div>
            {detail.instance.kind === CHALLENGE_KINDS.retry && (
              <span data-testid="challenge-result-retry" style={{ ...chip(GC.gray), marginLeft: "auto" }}>再試一次・不計入紀錄</span>
            )}
            {/*  ── Slice 7：這一場算不算正式、有沒有獎勵資格 ────────────────
                 ⚠ 第一層只放**結論**（一個短標籤）。完整的重試／獎勵規則
                   走既有的 InfoHint 第二層，不在這裡展開成說明文。
                 ⚠ 狀態一律讀 Store 凍結的判定，畫面不自己推。 */}
            {detail.instance.settlement && detail.instance.kind !== CHALLENGE_KINDS.retry && (
              <span data-testid="challenge-settlement-class"
                data-class={detail.instance.settlement.settlementClass}
                data-eligible={detail.instance.settlement.rewardEligible ? "1" : "0"}
                style={{ ...chip(detail.instance.settlement.rewardEligible ? GC.green : GC.gray), marginLeft: "auto" }}>
                {detail.instance.settlement.rewardEligible ? "正式紀錄" : "不計入正式紀錄"}
              </span>
            )}
          </div>
          {busy === "run" && !result && (
            <div className="esmo-running" data-testid="challenge-running" style={{ color: GC.blueL, fontSize: 12, marginTop: 8 }}>模擬進行中…（約需數秒）</div>
          )}
          {result && (
            <>
              {/* ⚠ 模擬跑完是這一頁唯一真正的「事件」。給它一個短而明確的揭曉，
                  但**不慶祝**——挑戰失敗也走同一個動態，不然就變成只在贏的時候有回饋。 */}
              <div className="esmo-outcome" data-testid="challenge-outcome" style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: result.outcome === "challengerWin" ? GC.green : GC.redL }}>
                {result.outcome === "challengerWin" ? "挑戰成功" : result.outcome === "defenderWin" ? "挑戰失敗" : "未分勝負"}
              </div>
              <div className="esmo-score" data-testid="challenge-score" style={{ color: "#d4d4d8", fontSize: 12, marginTop: 6, fontFamily: MONO }}>
                擊殺 {result.score.challenger} : {result.score.defender}　時長 {Math.round(result.durationSec / 60)} 分
              </div>

              {/*  Slice 7：為什麼這一場算／不算，一行講完。理由字串來自
                   `challengeEligibility` 的常數，畫面不自己編。 */}
              {detail.instance.settlement && (
                <div data-testid="challenge-settlement-reason"
                  style={{ color: "#71717a", fontSize: 10.5, marginTop: 5, lineHeight: 1.6 }}>
                  {detail.instance.settlement.rewardReason}
                </div>
              )}

              <EvidenceTable testid="challenge-evidence-mine"
                title={`我方宣告 vs 實際（${myTactic?.name ?? detail.instance.challengerTacticId}）`}
                rows={tacticEvidenceRows(myTactic, result.tacticExec?.challenger)} />
              <EvidenceTable testid="challenge-evidence-opponent"
                title={`對手宣告 vs 實際（${oppTactic?.name ?? detail.instance.defenderTacticId}）`}
                rows={tacticEvidenceRows(oppTactic, result.tacticExec?.defender)} />

              <DraftPanel view={draftView} nameOf={heroNameOf} />

              <div style={{ ...label, color: "#52525b", marginTop: 10, fontFamily: MONO, wordBreak: "break-all" }}>
                {detail.instance.challengeId}
                <br />seed {result.matchSeed}　{result.simulationVersion}
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <button data-testid="challenge-retry-btn" onClick={() => retry(detail.instance.challengeId)} disabled={busy !== null} style={btn(false, busy !== null)}>
                  再試一次（同一份對手陣容・不計入紀錄）
                </button>
                <button data-testid="challenge-verify-btn" onClick={() => doVerify(detail.instance.challengeId)} style={btn(false)}>
                  重新計算並比對（驗證這場可重現）
                </button>
              </div>
              {verify && (
                <div data-testid="challenge-verify-result" style={{ marginTop: 8, fontSize: 12, color: verify.kind === "ok" ? GC.green : GC.redL, lineHeight: 1.6 }}>
                  {verify.text}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 我的防守陣容 ───────────────────────────────────────────────── */}
      {view.defense ? (
        <div data-testid="challenge-defense-card" style={card(GC.green)}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
            <div style={label}>我的防守陣容</div>
            <div data-testid="challenge-defense-published-at" style={{ ...label, color: "#a1a1aa", fontFamily: MONO }}>
              發布於生涯第 {view.defense.careerDay} 天
            </div>
          </div>
          <div data-testid="challenge-defense-lineup" style={{ marginTop: 8, display: "grid", gap: 4 }}>
            {view.defense.seats.map((s) => (
              <div key={s.seat} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#d4d4d8", minWidth: 0 }}>
                <span style={{ ...label, fontFamily: MONO, color: GC.blueL, minWidth: 22 }}>{s.seat}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.playerId}</span>
                <span style={{ ...label, marginLeft: "auto", color: GC.gray }}>熟練 Lv.{view.defense.combat.loadout[s.seat]?.level ?? "—"}</span>
              </div>
            ))}
          </div>
          <div data-testid="challenge-defense-tactic" style={{ marginTop: 8, color: "#d4d4d8", fontSize: 11 }}>
            預存戰術：<b style={{ color: GC.gold }}>{mobaTacticById(view.defense.standingOrders.tacticId)?.name ?? view.defense.standingOrders.tacticId}</b>
          </div>
          <div style={{ marginTop: 10 }}>
            <button data-testid="challenge-publish-btn" onClick={publish} disabled={!view.canPublish || busy !== null} style={btn(false, !view.canPublish || busy !== null)}>
              以目前陣容與戰術更新防守
            </button>
          </div>
          {!view.canPublish && (
            <div data-testid="challenge-throttle-note" style={{ color: GC.gold, fontSize: 11, marginTop: 8 }}>
              今天（生涯第 {view.careerDay} 天）已經更新過，明天才能再更新。
            </div>
          )}
        </div>
      ) : (
        <div data-testid="challenge-defense-empty" style={card()}>
          <div style={label}>我的防守陣容</div>
          <div style={{ color: "#a1a1aa", fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>
            尚未發布。發布之後，這份陣容就是別人挑戰你時會遇到的隊伍。
          </div>
          <div style={{ marginTop: 10 }}>
            <button data-testid="challenge-publish-btn" onClick={publish} disabled={busy !== null} style={btn(true, busy !== null)}>
              發布我的防守陣容
            </button>
          </div>
        </div>
      )}

      {/* ── 挑戰紀錄 ───────────────────────────────────────────────────── */}
      <div style={card()}>
        <div style={label}>挑戰紀錄</div>
        {view.history.length === 0 ? (
          <div style={{ color: "#a1a1aa", fontSize: 12, marginTop: 6 }}>還沒有挑戰過。</div>
        ) : (
          <div data-testid="challenge-history" style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {view.history.map((h) => {
              const opp = board.candidates.find((c) => c.key === h.opponentKey);
              return (
                <button key={h.challengeId} data-testid={`challenge-history-${h.challengeId}`}
                  onClick={() => { setOpenId(h.challengeId); setVerify(null); }}
                  style={{ ...btn(false), textAlign: "left", display: "grid", gap: 3, padding: "9px 11px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <span style={{ ...label, color: h.result?.outcome === "challengerWin" ? GC.green : GC.redL }}>
                      {h.result ? (h.result.outcome === "challengerWin" ? "勝" : "負") : "未完成"}
                    </span>
                    <span style={{ fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {opp?.team.teamName ?? h.opponentKey ?? "—"}
                    </span>
                    {h.kind === CHALLENGE_KINDS.retry && <span style={{ ...chip(GC.gray), marginLeft: "auto" }}>再試</span>}
                  </div>
                  <div style={{ ...label, color: "#71717a", fontWeight: 600 }}>
                    {mobaTacticById(h.challengerTacticId)?.name ?? h.challengerTacticId}
                    　對手陣容 生涯第 {useProfileStore.getState().challenge?.snapshots?.[h.defenderSnapshotHash]?.careerDay ?? "—"} 天
                    　{new Date(h.createdAt).toLocaleDateString()}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ⚠ 原本是 #52525b 的小灰字：對比不足，實際上等於沒人讀得到——
          而它講的正是「還沒有防作弊機制」這種**該讓人看到**的事。
          ⇒ 完整內容進「挑戰規則」，這裡只留一行對比足夠的狀態。 */}
      <div data-testid="challenge-authority-note" style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 2px 8px", flexWrap: "wrap" }}>
        <span style={{ ...label, color: "#a1a1aa" }}>本機結算・尚未連上伺服器</span>
        <InfoHint title="紀錄的範圍與限制" testid="challenge-authority-hint">
          <p>目前挑戰在<b>本機</b>結算（{SNAPSHOT_AUTHORITY.kind}），尚未連上伺服器，
            也還沒有防作弊機制。</p>
          <p>看板上的「你挑戰過幾次」只統計<b>這個存檔自己</b>的紀錄，不是全服資料。
            換一個存檔就會從零開始。</p>
        </InfoHint>
      </div>
    </ManageFrame>
  );
}
