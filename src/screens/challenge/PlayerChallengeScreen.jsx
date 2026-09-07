// ============================================================================
//  玩家挑戰（Player Challenge Slice 2）——第一個玩家看得到的線上挑戰畫面
//
//  ── 這一頁刻意很小 ────────────────────────────────────────────────────────
//  只做五件事：發布防守陣容／看目前防守／對練習對手發起挑戰／看結果／重播驗證。
//  **不做**挑戰看板、五候選探索、獎勵、排位。
//
//  ── 三條誠實規則（架構文件 §6.2）──────────────────────────────────────────
//  ① **不得假裝對面有真人在線。** Slice 2 的對手是決定性的練習對手，
//     畫面就寫「練習對手」，不寫隊名假裝是玩家、不跑假的等待倒數。
//  ② **不得宣稱有防作弊能力。** 目前是本機權威層（`trusted: false`）。
//  ③ **把「不影響生涯」講清楚。** 玩家判斷「打這個會不會弄壞我的隊伍」
//     的唯一依據就是這一頁寫了什麼。
//
//  ── 畫面不組任何數值 ──────────────────────────────────────────────────────
//  ⚠ 本檔**只送身分與選擇**（tacticId / opponentKey），從不組 final stats。
//    快照的值一律由權威層自己查（`challenge/snapshotAuthority.js`）。
//    所有讀取都走 `store.challengeView()` 這個唯一入口，畫面不自己拼資料。
// ============================================================================
import React, { useMemo, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { MOBA_TACTICS, mobaTacticById } from "../../platform/contracts/MobaTacticConfig.js";
import { MATCH_SOURCE, MATCH_TIER_LABELS } from "../../platform/progress/matchSource.js";
import { SNAPSHOT_AUTHORITY } from "../../platform/challenge/snapshotAuthority.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import ManageFrame from "../manage/ManageFrame.jsx";

const card = (accent = null) => ({
  background: GC.card, border: `1px solid ${accent ? `${accent}44` : GC.line}`,
  borderRadius: 12, padding: "12px 14px", marginBottom: 10, minWidth: 0,
});
//  ⚠ 所有可點擊元素 ≥44px（UI/UX 規範 §7 的觸控下限）。
const btn = (primary = false, disabled = false) => ({
  minHeight: 44, padding: "11px 16px", borderRadius: 10, width: "100%",
  background: disabled ? "rgba(255,255,255,0.04)" : primary ? `linear-gradient(135deg,${GC.blue},#1d4ed8)` : "rgba(255,255,255,0.06)",
  border: `1px solid ${disabled ? GC.line : primary ? GC.blueL : GC.line}`,
  color: disabled ? GC.gray : "#fff", fontSize: 13, fontWeight: 900,
  cursor: disabled ? "not-allowed" : "pointer",
});
const label = { color: GC.gray, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em" };

/**
 * 這一層不影響生涯的**逐條**保證。
 *
 * ⚠ 每一條都對應一個真的被驗證器釘住的行為，不是行銷文案：
 *   成長倍率 0（`careerGrowth`）／不耗體力（不呼叫 `applyMatchWear`）／
 *   世界時間 0（`WORLD_TIME_COST.challenge`）／不進賽季帳本／沒有 Ladder。
 */
const CAREER_SAFE = [
  "不增加生涯成長",
  "不消耗選手體力",
  "不推進生涯日期",
  "不影響正式賽季",
  "沒有排位分數",
];

function TierBanner() {
  const tier = MATCH_TIER_LABELS[MATCH_SOURCE.challenge];
  return (
    <div data-testid="challenge-tier-banner" style={{ ...card(GC.purp), background: "rgba(167,139,250,0.10)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 13 }}>🤝</span>
        <span data-testid="challenge-tier-name" style={{ color: GC.purp, fontSize: 13, fontWeight: 900 }}>{tier.name}</span>
        <span style={{ ...label, color: GC.gold, border: `1px solid ${GC.gold}55`, borderRadius: 5, padding: "1px 6px" }}>非排位</span>
      </div>
      <div style={{ color: "#d4d4d8", fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>{tier.note}</div>
      <div data-testid="challenge-career-safe" style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
        {CAREER_SAFE.map((t) => (
          <span key={t} style={{ ...label, color: GC.green, border: `1px solid ${GC.green}44`, borderRadius: 5, padding: "3px 7px" }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** 目前的防守快照摘要。⚠ 只顯示快照裡真的有的東西，不補值。 */
function DefenseCard({ defense }) {
  if (!defense) {
    return (
      <div data-testid="challenge-defense-empty" style={card()}>
        <div style={label}>我的防守陣容</div>
        <div style={{ color: "#a1a1aa", fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>
          尚未發布。發布之後，這份陣容就是別人挑戰你時會遇到的隊伍。
        </div>
      </div>
    );
  }
  const tactic = mobaTacticById(defense.standingOrders.tacticId);
  const when = new Date(defense.issuedAt);
  const stamp = Number.isFinite(defense.issuedAt)
    ? `${when.getFullYear()}/${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
    : "—";
  return (
    <div data-testid="challenge-defense-card" style={card(GC.green)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
        <div style={label}>我的防守陣容</div>
        <div data-testid="challenge-defense-published-at" style={{ ...label, color: "#a1a1aa", fontFamily: MONO }}>
          發布於 {stamp}（生涯第 {defense.careerDay} 天）
        </div>
      </div>
      <div data-testid="challenge-defense-lineup" style={{ marginTop: 8, display: "grid", gap: 4 }}>
        {defense.seats.map((s) => (
          <div key={s.seat} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#d4d4d8", minWidth: 0 }}>
            <span style={{ ...label, fontFamily: MONO, color: GC.blueL, minWidth: 22 }}>{s.seat}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.playerId}</span>
            <span style={{ ...label, marginLeft: "auto", color: GC.gray }}>
              熟練 Lv.{defense.combat.loadout[s.seat]?.level ?? "—"}
            </span>
          </div>
        ))}
      </div>
      <div data-testid="challenge-defense-tactic" style={{ marginTop: 8, color: "#d4d4d8", fontSize: 11, lineHeight: 1.6 }}>
        預存戰術：<b style={{ color: GC.gold }}>{tactic?.name ?? defense.standingOrders.tacticId}</b>
        {tactic?.focus ? `　${tactic.focus}` : ""}
      </div>
      <div style={{ ...label, color: "#52525b", marginTop: 8, fontFamily: MONO }}>
        快照 {defense.hash}　簽發 {defense.issuedBy}
      </div>
    </div>
  );
}

export default function PlayerChallengeScreen({ onBack, onReplay }) {
  //  ── 訂閱：一個**穩定字串**，不是每次都新建的物件 ────────────────────────
  //  ⚠ 直接 `useProfileStore((s) => s.challengeView())` 會每次回傳新物件
  //    ⇒ React 認為每次都變了，而且 `getSnapshot` 不穩定。
  //  ⚠ 更重要的是**它必須涵蓋「結算」這件事**：瀏覽器 smoke 抓到的第一個
  //    真 bug 就是這裡——原本只看 `history.length`，而結算不會改變長度
  //    ⇒ 跑完模擬之後結果**永遠不顯示**，要重整才看得到。
  //    所以簽章把每一場的 `status` 也編進去。
  const sig = useProfileStore((s) => {
    const c = s.challenge;
    const order = c?.order ?? [];
    return [
      s.meta?.days ?? 0,
      c?.lastPublishedCareerDay ?? "-",
      c?.defense?.hash ?? "-",
      order.length,
      order.map((id) => `${id}:${c.instances[id]?.status ?? ""}`).join(","),
    ].join("|");
  });
  const view = useMemo(() => useProfileStore.getState().challengeView(), [sig]);

  const [tacticId, setTacticId] = useState(() => view.defense?.standingOrders?.tacticId ?? MOBA_TACTICS[0].tacticId);
  const [busy, setBusy] = useState(null);       // "publish" | "run" | null
  const [msg, setMsg] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [verify, setVerify] = useState(null);

  const detail = useMemo(
    () => (openId ? useProfileStore.getState().challengeDetail(openId) : null),
    [openId, sig],
  );

  const publish = () => {
    setMsg(null); setBusy("publish");
    //  ⚠ 英雄熟練住在另一個 store ⇒ 由這裡注入（profileStore 不依賴 hero 進度）。
    const heroProgress = useHeroProgressStore.getState().progress;
    const r = useProfileStore.getState().publishDefenseSnapshot(tacticId, { heroProgress });
    setBusy(null);
    setMsg(r.ok ? { kind: "ok", text: "防守陣容已更新" } : { kind: "err", text: r.errors[0]?.message ?? "發布失敗" });
  };

  const challenge = (opponentKey) => {
    setMsg(null); setVerify(null);
    const started = useProfileStore.getState().startFixtureChallenge(opponentKey);
    if (!started.ok) { setMsg({ kind: "err", text: started.errors[0]?.message ?? "無法發起挑戰" }); return; }
    setOpenId(started.challengeId);
    setBusy("run");
    //  ⚠ 模擬是同步的、要跑幾秒。先讓瀏覽器畫出「模擬中」再開跑，
    //    否則玩家只會看到畫面凍住。**不是**為了假裝有網路延遲。
    setTimeout(() => {
      const r = useProfileStore.getState().runChallengeById(started.challengeId);
      setBusy(null);
      if (!r.ok) setMsg({ kind: "err", text: r.errors[0]?.message ?? "模擬失敗" });
    }, 30);
  };

  const doVerify = (id) => {
    const r = useProfileStore.getState().verifyChallengeReplay(id);
    setVerify(r.ok && r.match
      ? { kind: "ok", text: "重播結果與當初完全一致" }
      : { kind: "err", text: r.reason ?? "重播對不上" });
  };

  const result = detail?.instance?.result ?? null;

  return (
    <ManageFrame title="玩家挑戰" subtitle="ASYNC UNRANKED" onBack={onBack}>
      <TierBanner />

      {/* ── A/B：發布與顯示我的防守陣容 ───────────────────────────────── */}
      <DefenseCard defense={view.defense} />

      <div style={card()}>
        <div style={label}>預存戰術（別人挑戰你時，你的隊伍會用這一套）</div>
        <select
          data-testid="challenge-tactic-select"
          value={tacticId}
          onChange={(e) => setTacticId(e.target.value)}
          style={{ width: "100%", minHeight: 44, marginTop: 8, background: GC.card2, color: "#fff", border: `1px solid ${GC.line}`, borderRadius: 10, padding: "0 10px", fontSize: 13, fontFamily: FONT }}
        >
          {MOBA_TACTICS.map((t) => <option key={t.tacticId} value={t.tacticId}>{t.emoji} {t.name}</option>)}
        </select>
        <div style={{ marginTop: 10 }}>
          <button
            data-testid="challenge-publish-btn"
            onClick={publish}
            disabled={!view.canPublish || busy !== null}
            style={btn(true, !view.canPublish || busy !== null)}
          >
            {view.defense ? "更新我的防守陣容" : "發布我的防守陣容"}
          </button>
        </div>
        {!view.canPublish && (
          <div data-testid="challenge-throttle-note" style={{ color: GC.gold, fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
            今天（生涯第 {view.careerDay} 天）已經更新過，明天才能再更新。
          </div>
        )}
      </div>

      {msg && (
        <div data-testid="challenge-message" style={{ ...card(msg.kind === "ok" ? GC.green : GC.red), color: msg.kind === "ok" ? GC.green : GC.redL, fontSize: 12 }}>
          {msg.text}
        </div>
      )}

      {/* ── C：練習對手 ───────────────────────────────────────────────── */}
      <div style={card()}>
        <div style={label}>練習對手</div>
        {/* ⚠ 誠實：Slice 2 還沒有其他玩家，不得寫成「真人玩家」。 */}
        <div data-testid="challenge-fixture-disclaimer" style={{ color: "#a1a1aa", fontSize: 11, marginTop: 6, lineHeight: 1.7 }}>
          目前是**固定的練習對手**，不是其他玩家的戰隊。對手不會即時反應，
          他們用的是預先設定好的陣容與戰術。
        </div>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {view.opponents.map((o) => (
            <div key={o.key} style={{ background: GC.card2, border: `1px solid ${GC.line}`, borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ ...label, color: GC.purp, fontFamily: MONO }}>{o.tag}</span>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.teamName}</span>
              </div>
              {/* ⚠ 只寫看得出來的事實，不寫「較弱／較強」——我們沒有可信的戰力定價。 */}
              <div style={{ color: "#a1a1aa", fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>{o.note}</div>
              <div style={{ marginTop: 9 }}>
                <button
                  data-testid={`challenge-start-${o.key}`}
                  onClick={() => challenge(o.key)}
                  disabled={!view.defense || busy !== null}
                  style={btn(false, !view.defense || busy !== null)}
                >
                  {busy === "run" ? "模擬中…" : "發起挑戰"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {!view.defense && (
          <div style={{ color: GC.gold, fontSize: 11, marginTop: 8 }}>請先發布你的防守陣容，才能發起挑戰。</div>
        )}
      </div>

      {/* ── D/E：結果與重播 ───────────────────────────────────────────── */}
      {detail && (
        <div data-testid="challenge-result-card" style={card(result ? (result.outcome === "challengerWin" ? GC.green : GC.red) : GC.gray)}>
          <div style={label}>挑戰結果</div>
          {busy === "run" && !result && (
            <div data-testid="challenge-running" style={{ color: GC.blueL, fontSize: 12, marginTop: 8 }}>模擬進行中…（約需數秒）</div>
          )}
          {result && (
            <>
              <div data-testid="challenge-outcome" style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: result.outcome === "challengerWin" ? GC.green : GC.redL }}>
                {result.outcome === "challengerWin" ? "挑戰成功" : result.outcome === "defenderWin" ? "挑戰失敗" : "未分勝負"}
              </div>
              <div data-testid="challenge-score" style={{ color: "#d4d4d8", fontSize: 12, marginTop: 6, fontFamily: MONO }}>
                擊殺 {result.score.challenger} : {result.score.defender}　時長 {Math.round(result.durationSec / 60)} 分
              </div>
              <div style={{ ...label, color: "#52525b", marginTop: 8, fontFamily: MONO, wordBreak: "break-all" }}>
                {detail.instance.challengeId}
                <br />seed {result.matchSeed}　{result.simulationVersion}
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <button data-testid="challenge-verify-btn" onClick={() => doVerify(detail.instance.challengeId)} style={btn(false)}>
                  重新計算並比對（驗證這場可重現）
                </button>
                {onReplay && (
                  <button data-testid="challenge-replay-btn" onClick={() => onReplay(detail.instance.challengeId)} style={btn(false)}>
                    開啟重播
                  </button>
                )}
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

      {/* ── F：reload 後找得回來 ──────────────────────────────────────── */}
      <div style={card()}>
        <div style={label}>挑戰紀錄</div>
        {view.history.length === 0 ? (
          <div style={{ color: "#a1a1aa", fontSize: 12, marginTop: 6 }}>還沒有挑戰過。</div>
        ) : (
          <div data-testid="challenge-history" style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {view.history.map((h) => (
              <button
                key={h.challengeId}
                data-testid={`challenge-history-${h.challengeId}`}
                onClick={() => { setOpenId(h.challengeId); setVerify(null); }}
                style={{ ...btn(false), textAlign: "left", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
              >
                <span style={{ ...label, color: h.result?.outcome === "challengerWin" ? GC.green : GC.redL }}>
                  {h.result ? (h.result.outcome === "challengerWin" ? "勝" : "負") : "未完成"}
                </span>
                <span style={{ ...label, color: "#a1a1aa", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.challengeId.slice(0, 22)}…
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ⚠ 誠實邊界：不得宣稱已有防作弊伺服器。 */}
      <div data-testid="challenge-authority-note" style={{ ...label, color: "#52525b", lineHeight: 1.7, padding: "0 2px 8px" }}>
        目前挑戰在本機結算（{SNAPSHOT_AUTHORITY.kind}），尚未連上伺服器，
        也還沒有防作弊機制。結果只影響這一頁的紀錄。
      </div>
    </ManageFrame>
  );
}
