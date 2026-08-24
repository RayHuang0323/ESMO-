// ============================================================================
//  debug/DevQuickRecovery/ — DEV 快速恢復／快速推進（開發測試便利功能）
//
//  ⚠⚠ **這不是正式遊戲設計。** 這是「尚未正式上線」期間的測試工具。
//      **正式商業上線前必須關閉或移除**
//      （release checklist 見 `docs/handoff/08_目前待辦與風險.md`）。
//
//  ── 移除方式（刻意做成三步）──────────────────────────────────────────────
//      1. `rm -rf src/debug/DevQuickRecovery/`
//      2. 刪 `screens/manage/TrainingScreen.jsx` 的 1 個 import 與 1 行 JSX
//      3. 刪 `featureFlags.js` 的 `devQuickRecovery`
//  只要關閉不要移除：把旗標改成 `false`（單一位置，畫面不必動）。
//
//  ── 三個原則（違反任一條就失去存在意義）──────────────────────────────────
//  ① **不另寫第二套日期／恢復邏輯。** 推進 1／3 天呼叫既有的
//     `profileStore.advanceDay()`——同一個時鐘、同一套週結算、同一套賽季日曆。
//     推不動時（今天有還沒收尾的比賽）**照實顯示原因，不強推**：
//     DEV 工具是快轉鍵，不是規則豁免權。
//  ② **不寫死體力數字。** 恢復目標由 `logic.js → energyToMatchFit()` 向
//     condition 層推導，門檻改了自動跟著改。
//  ③ **不放寬正式玩法。** condition / fatigue / exhausted / 輪休規則一律照舊，
//     本資料夾一個費率、一個門檻都沒有動。
//
//  ── 正式玩法沒有 soft-lock（本工具不是用來蓋住死局的）────────────────────
//  即使全隊體力見底且沒錢：「休息調整」課程 `energyCost: 0`、1 天，UI 與 Store
//  **都明確豁免體力檢查**（`c.id !== "rest"`），完成回 +30 體力，而門檻只有
//  `CONDITION.unfitBelow`。被比賽日擋住時 `CompetitionScreen` 有正式的棄權按鈕。
//  ⇒ 玩家永遠能免費脫困。這條由 `tools/check_dev_quick_recovery.mjs` **實跑**證明，
//    不是靠這段註解宣稱。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { CONDITION, conditionText } from "../../platform/condition/playerCondition.js";
import { GC } from "../../ui/theme.js";
import { devQuickRecoveryEnabled, energyToMatchFit, unfitPlayers } from "./logic.js";

export default function DevQuickRecovery() {
  //  閘門在最前面且**不呼叫任何 hook** ⇒ 正式模式下這個元件等於不存在。
  if (!devQuickRecoveryEnabled()) return null;
  return <DevQuickRecoveryPanel />;
}

function DevQuickRecoveryPanel() {
  const players = useProfileStore((s) => s.players) ?? [];
  const advanceDay = useProfileStore((s) => s.advanceDay);
  const patchPlayer = useProfileStore((s) => s._patchPlayer);
  const [msg, setMsg] = useState(null);

  const unfit = unfitPlayers(players);

  //  推進 n 天：走既有時鐘。回傳陣列上掛著 `.daysAdvanced` / `.stoppedBy`
  //  （見 profileStore.advanceDay 的註解），推不滿就照實說，不繞過。
  const advance = (n) => {
    const res = advanceDay(n);
    const moved = res?.daysAdvanced ?? n;
    const stopped = res?.stoppedBy ?? null;
    setMsg({
      ok: moved > 0,
      text: stopped
        ? `推進 ${moved}/${n} 天後停下：${stopped.message ?? "賽程未收尾"}（DEV 工具不強推，請先出賽或棄權）`
        : `已推進 ${moved} 天`,
    });
  };

  //  全隊恢復至可出賽：逐人算目標體力，用 Store 既有的單人寫入口寫回。
  //  已經可出賽的人不動——這是「解除封鎖」，不是「一鍵滿血」。
  const recoverAll = () => {
    if (unfit.length === 0) { setMsg({ ok: false, text: "全隊本來就都可出賽，沒有東西要恢復" }); return; }
    const names = [];
    for (const p of unfit) {
      const energy = energyToMatchFit(p);
      patchPlayer(p.id, (x) => ({ ...x, energy, condition: conditionText(energy) }));
      names.push(`${p.name}→${Math.round(energy)}`);
    }
    //  用 Store 的**寫入後真值**再問一次，不相信迴圈裡的預期值。
    const after = unfitPlayers(useProfileStore.getState().players ?? []);
    setMsg({
      ok: after.length === 0,
      text: after.length === 0
        ? `${names.length} 人恢復為可出賽（${names.join("、")}）`
        : `仍有 ${after.length} 人不可出賽——請檢查 condition 門檻`,
    });
  };

  const btn = (accent) => ({
    flex: "1 1 30%", minWidth: 0, borderRadius: 10, padding: "9px 6px",
    border: `1px solid ${accent}55`, background: `${accent}1f`, color: accent,
    fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div
      data-testid="dev-quick-recovery"
      style={{
        borderRadius: 12, padding: "10px 12px", marginBottom: 12,
        background: "rgba(0,0,0,0.35)", border: "1px dashed rgba(167,139,250,0.45)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 13 }}>🛠</span>
        <span style={{ color: "white", fontSize: 11.5, fontWeight: 800 }}>DEV 快速恢復</span>
        <span style={{
          fontSize: 8.5, fontWeight: 800, borderRadius: 5, padding: "1px 6px",
          background: "rgba(167,139,250,0.18)", color: GC.purp, whiteSpace: "nowrap",
        }}>僅測試模式</span>
        <span data-testid="dev-unfit-count"
          style={{ marginLeft: "auto", color: GC.gray, fontSize: 9, whiteSpace: "nowrap" }}>
          不可出賽 {unfit.length} / {players.length} 人
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button data-testid="dev-advance-1" type="button" onClick={() => advance(1)} style={btn(GC.purp)}>推進 1 天</button>
        <button data-testid="dev-advance-3" type="button" onClick={() => advance(3)} style={btn(GC.purp)}>推進 3 天</button>
        <button data-testid="dev-recover-all" type="button" onClick={recoverAll} style={btn(GC.green)}>全隊恢復至可出賽</button>
      </div>

      {msg && (
        <div data-testid="dev-quick-recovery-msg"
          style={{ marginTop: 6, fontSize: 10, lineHeight: 1.7, color: msg.ok ? GC.green : GC.gray }}>
          {msg.ok ? "✅ " : "· "}{msg.text}
        </div>
      )}

      <div style={{ marginTop: 5, fontSize: 8.5, color: GC.gray, lineHeight: 1.6 }}>
        開發測試便利功能，不是正式遊戲設計。推進走既有的每日結算（賽程未收尾一樣會被擋）；
        恢復目標由 condition 門檻推導（體力 &lt; {CONDITION.unfitBelow} 不可出賽），
        不改任何恢復費率、訓練或年齡規則。
      </div>
    </div>
  );
}
