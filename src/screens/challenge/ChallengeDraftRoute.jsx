//  ════════════════════════════════════════════════════════════════════════
//   Slice 6：挑戰的手動選角路由
//
//   這一支**沒有任何選角邏輯**，只做三件事：
//     · 讀 `pendingChallengeDraftView()`（Store 唯一讀取點）
//     · 把玩家的一手送回 `recordChallengeDraftAction()`（Store 判合法性）
//     · 選滿後呼叫 `startFixtureChallenge(..., { challengerActions })`
//
//   ⚠ 唯一那份 `DraftResult.v1` 由 Store 的 `createDraftResult` 算一次然後凍結。
//     這裡不算、不存、也不快取任何選角結果——UI 一份、runner 一份，
//     正是本輪最不能發生的事。
//   ⚠ 畫面用的是**既有的** `BanPickScreen`，只是傳入 adapter。
//     複製一份 ChallengeBanPickScreen 會讓上一輪剛修好的捲動契約分岔成兩份。
//  ════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import BanPickScreen from "../moba/BanPickScreen.jsx";

export default function ChallengeDraftRoute({ onBack, onDone }) {
  //  訂閱 pendingDraft 本身：玩家每落一手，Store 換一個新物件 ⇒ 這裡重畫。
  const pending = useProfileStore((s) => s.challenge?.pendingDraft ?? null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const view = useProfileStore.getState().pendingChallengeDraftView();

  //  沒有進行中的選角（例如直接輸入網址、或已經送出）⇒ 回挑戰看板，
  //  不要停在一個空畫面讓玩家以為當掉了。
  useEffect(() => { if (!pending) onBack?.(); }, [pending, onBack]);
  if (!pending || !view) return null;

  const onAction = ({ act, heroId }) => {
    const r = useProfileStore.getState().recordChallengeDraftAction({ act, heroId });
    setError(r.ok ? null : (r.errors?.[0]?.message ?? "這一手不合法"));
    return r;
  };

  const onConfirm = () => {
    if (busy) return;
    setBusy(true);
    //  ⚠ 送出的是玩家的**輸入**。對手的回應與最終席位在 Store 裡一次解出。
    const r = useProfileStore.getState().startFixtureChallenge(view.opponentKey, {
      tacticId: view.tacticId,
      challengerActions: view.actions,
    });
    setBusy(false);
    if (!r.ok) { setError(r.errors?.[0]?.message ?? "無法建立這場挑戰"); return; }
    onDone?.(r.challengeId);
  };

  return (
    <BanPickScreen
      onBack={() => { useProfileStore.getState().cancelChallengeDraft(); onBack?.(); }}
      challengeDraft={{ view, onAction, onConfirm, error, busy }}
    />
  );
}
