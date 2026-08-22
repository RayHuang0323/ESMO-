// ============================================================================
//  screens/manage/CompetitionHubScreen.jsx — 賽事中心的殼（UI-2）
//
//  ── 這一支只做一件事：決定現在看的是哪一個項目的賽事 ─────────────────────
//  首頁「賽事」磚原本直接開 `CompetitionScreen`（MOBA 聯賽），CS 賽季則藏在
//  CS 賽前頁裡面 —— 玩家點「賽事」永遠看不到 CS。本檔把兩者收在同一個入口下，
//  上面加一排分頁，其餘**原封不動地重用既有畫面**：
//
//    [ MOBA ] → `CompetitionScreen mode="moba"`     （UI-1 已經接受 mode）
//    [ CS  ] → `CsCompetitionHubScreen`             （既有畫面，一行都沒改）
//
//  ── 刻意不做的事 ─────────────────────────────────────────────────────────
//  · **不複製 CS Hub**：CS 分頁掛的就是那一個元件本身。
//  · **不重算任何東西**：積分榜／對戰表／晉級線仍由各自的畫面從
//    `competitionView(mode)` 讀，本檔連 Store 都不碰。
//  · **不建立賽季**：本檔沒有任何 action。`CsCompetitionHubScreen` 本身是全唯讀
//    且自帶「還沒有 CS 賽季」的空狀態（`cs-hub-no-season`），所以**點進 CS 分頁
//    不會替玩家開季** —— CS 開季按鈕仍然只在 CS 賽前頁。
//  · **不抽共用元件**：StandingsTable／StageBar／FixtureList 的共用化是後續的事。
//    本輪是接線與殼，不是重構。
//
//  ── 分頁為什麼是可橫捲的 rail，而不是等分的兩格 ──────────────────────────
//  等分格子在加入第三款遊戲時一定要重排。rail ＋ 資料驅動的 `TABS` 讓那件事
//  變成「陣列多一筆」。`gameMode` 的擴充點在 Store 早就存在
//  （`competitionByMode`），畫面這一層不該是唯一擋住它的地方 —— UI-1 才剛把
//  `CompetitionScreen` 的 mode 寫死解掉，這裡不要重新種一個。
//
//  ── 分頁狀態是畫面狀態 ───────────────────────────────────────────────────
//  切分頁**不寫 Store、不存檔**。重整回到預設的 MOBA，這是刻意的：賽事中心
//  看哪一頁不是存檔該記的事，寫進去只會多一個要遷移的欄位。
// ============================================================================
import React, { useState } from "react";
import { GC, FONT } from "../../ui/theme.js";
import CompetitionScreen from "./CompetitionScreen.jsx";
import CsCompetitionHubScreen from "../fps/CsCompetitionHubScreen.jsx";

//  ⚠ 加第三款遊戲＝在這裡多一筆，不要改版面。
const TABS = [
  { mode: "moba", label: "MOBA", accent: GC.purp },
  { mode: "cs", label: "CS", accent: "#fb923c" },
];

const DEFAULT_MODE = "moba";

export default function CompetitionHubScreen({ onBack, onPlay, onResume, onCsRecap }) {
  const [mode, setMode] = useState(DEFAULT_MODE);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: GC.bg, fontFamily: FONT }}>
      {/*  ── 分頁列 ────────────────────────────────────────────────────────
           兩個子畫面各自帶著自己的標題與返回鍵（`ManageFrame` / CS Hub 的頁首），
           所以這裡刻意**不再加第三層頁首**——只放一排分頁，把垂直空間留給內容。 */}
      <div
        role="tablist"
        aria-label="賽事項目"
        data-testid="competition-hub-tabs"
        style={{
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          padding: "10px 12px 9px", borderBottom: `1px solid ${GC.line}`,
          overflowX: "auto", WebkitOverflowScrolling: "touch",
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900, flexShrink: 0 }}>賽事</span>
        {TABS.map((tab) => {
          const on = tab.mode === mode;
          return (
            <button
              key={tab.mode}
              role="tab"
              aria-selected={on}
              data-testid={`competition-hub-tab-${tab.mode}`}
              data-active={on ? "true" : "false"}
              onClick={() => setMode(tab.mode)}
              style={{
                flexShrink: 0, minHeight: 32, padding: "6px 18px", borderRadius: 999, cursor: "pointer",
                background: on ? `${tab.accent}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${on ? tab.accent : GC.line}`,
                color: on ? tab.accent : GC.gray,
                fontSize: 12.5, fontWeight: 900, letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/*  ⚠ `minHeight: 0` 是必要的：兩個子畫面都是 `height:100%` ＋ 自己捲，
           少了它 flex 子項不會收縮，內容會撐破 AppShell 的固定高度。 */}
      <div
        data-testid="competition-hub-panel"
        data-mode={mode}
        style={{ flex: 1, minHeight: 0 }}
      >
        {mode === "moba" && (
          <CompetitionScreen mode="moba" onBack={onBack} onPlay={onPlay} onResume={onResume} />
        )}
        {mode === "cs" && (
          //  ⚠ 就是既有的那一個元件，沒有包裝、沒有複製、沒有第二套資料流。
          //  UI-3：`onPlay` / `onResume` 與 MOBA 分頁**收到的是同一組 handler**
          //  ——出戰簽完指派單就交還既有的 CS 賽前流程（選圖／戰術在那裡），
          //    沒有第二條 MatchSession／Battle pipeline。
          <CsCompetitionHubScreen onBack={onBack} onRecap={onCsRecap} onPlay={onPlay} onResume={onResume} />
        )}
      </div>
    </div>
  );
}
