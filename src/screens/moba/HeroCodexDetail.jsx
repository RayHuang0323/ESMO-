// ============================================================================
//  screens/moba/HeroCodexDetail.jsx — Legacy Hero Detail 分頁（Sprint17 ①）
//  Presentation：完整恢復 Legacy Hero Detail（截圖2/3/7/8/10/11）——
//    標題(頭像/中英名/定位/難度★) + 分頁 tab：概覽 / 數據 / 技能 / 戰術
//    （Milestone K 追加第五頁「對位」，僅在 Hero Codex 開啟時出現）。
//  Architecture（Adapter）：資料全讀 heroDatabase（唯一來源，禁第二份）
//    + heroProgressStore（當前等級，供數據分頁顯示）
//    + heroMatchups（Milestone K：英雄關係的唯一來源，只透過純函式取用）。
//    不重新設計版面。
//  誠實標示：
//    · 勝率/選用率/禁用率 → 資料層不存在（Legacy 前端 flavor），顯示「—」。
//    · 技能類型 badge（傷害/控制）→ 資料層無，以描述關鍵字啟發式判定。
//    · 推薦出裝 → 資料層無裝備系統，誠實佔位（Legacy 該區本身亦為佔位）。
//    · 對位 → 只顯示 design / inferred，沒有勝率、場次、版本統計（資料層沒有）。
//
//  ── Milestone K 的兩個刻意設計 ────────────────────────────────────────────
//  1) `showMatchups` **預設 false**。BanPickScreen 也用這支元件（ⓘ 按鈕），
//     而 J-close Hotfix 2 已把「誰克制誰」從 Ban/Pick 移除；預設關閉 ⇒
//     Ban/Pick 這條路徑逐像素不變，不可能把對位資訊帶回選角流程。
//     只有 CodexScreen 傳 `showMatchups` 才會出現第五頁。
//  2) `tab` / `onTabChange` 是**選用的受控介面**。沒傳 ⇒ 沿用元件內部 state
//     （BanPickScreen 的舊呼叫方式完全不用改）；CodexScreen 傳進來，
//     才能做到「點對位卡開別隻英雄 → 返回時停在原英雄的『對位』頁」。
// ============================================================================
import React, { useState } from "react";
import { heroById } from "../../data/heroDatabase.js";
import {
  getHeroMatchups, MATCHUP_SECTIONS, MATCHUP_SECTION_LABEL,
  MATCHUP_SOURCE_LABEL, MATCHUP_CONFIDENCE_LABEL,
  MATCHUP_INFERRED_NOTICE, MATCHUP_EMPTY_TEXT,
} from "../../data/heroMatchups.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { useIsMobile } from "../../ui/useViewport.js";
import { GC, FONT, MONO } from "../../ui/theme.js";
import HeroPortrait from "../../ui/HeroPortrait.jsx";

const BASE_TABS = [["overview", "概覽"], ["stats", "數據"], ["skills", "技能"], ["tactics", "戰術"]];
const MATCHUP_TAB = ["matchups", "對位"];
const stars = (d) => "★".repeat(d) + "☆".repeat(3 - d);

//  三個區塊沿用本頁「概覽」既有的優勢／劣勢配色，維持 Hero Codex 的視覺語言。
const SECTION_COLOR = { strongAgainst: GC.green, weakAgainst: GC.red, synergies: GC.blue };
const SOURCE_COLOR = { design: GC.blue, inferred: "#e0a458", verified: GC.green };

// 屬性橫條正規化參考範圍
const RANGE = { hp: [500, 1200], mp: [0, 600], hpr: [0, 3], armor: [10, 60], mr: [20, 50], ad: [40, 120], as: [0.5, 0.9], range: [100, 650], ms: [320, 360] };
const bar = (k, v) => { const [lo, hi] = RANGE[k] || [0, 100]; return Math.max(6, Math.min(100, ((v - lo) / (hi - lo)) * 100)); };

// 技能類型啟發式（資料層無此欄，依描述關鍵字）
const skillKind = (s) => {
  const t = (s.name + s.desc);
  if (/嘲諷|束縛|擊暈|暈|根植|禁錮|定身|控制|沉默|恐懼/.test(t)) return { label: "控制", c: GC.purp };
  if (/治癒|回復|護盾|庇護|淨化|加速隊友|復活/.test(t)) return { label: "輔助", c: GC.green };
  return { label: "傷害", c: GC.red };
};

// 對戰節奏定位（依 arch，呈現層分類文字）
const TEMPO = {
  坦克: ["穩健發育，保護隊友建立視野", "開團先手，承擔傷害", "扛傷開團，保護後排C位"],
  戰士: ["線上壓制，穩定補刀", "遊走參團，建立優勢", "切入後排，撕裂陣型"],
  刺客: ["猥瑣發育，尋找機會", "抓單 gank，滾雪球", "收割落單，一波帶走"],
  法師: ["控線消耗，安全補刀", "支援控場，參與團戰", "團戰 AOE，後排輸出"],
  射手: ["補刀發育，避免消耗", "跟團站位，穩定輸出", "站樁輸出，團隊核心"],
  輔助: ["保護 ADC，換取資源", "布置視野，尋找開團", "保護 C 位，關鍵控制"],
};

function StatRow({ label, k, base, grow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <span style={{ width: 66, color: "#a1a1aa", fontSize: 12, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: bar(k, base) + "%", background: k === "ad" ? GC.red : k === "as" ? GC.gold : GC.green, borderRadius: 99 }} />
      </div>
      <span style={{ minWidth: 84, textAlign: "right", fontFamily: MONO, fontSize: 12, color: "#e5e7eb", flexShrink: 0 }}>
        {base}{grow != null && <span style={{ color: GC.gray, fontSize: 10 }}> (+{grow})</span>}
      </span>
    </div>
  );
}

export default function HeroCodexDetail({
  heroId, onClose,
  showMatchups = false,          // 見檔頭①：Ban/Pick 走預設 false
  tab: tabProp, onTabChange,     // 見檔頭②：選用的受控介面
  onOpenHero,                    // 有傳才讓對位卡可點（開另一隻英雄）
  onBack, backLabel,             // 有傳才顯示「← 上一隻」
}) {
  const [tabState, setTabState] = useState("overview");
  const isMobile = useIsMobile();
  const TABS = showMatchups ? [...BASE_TABS, MATCHUP_TAB] : BASE_TABS;
  const tabRaw = tabProp ?? tabState;
  //  受控端可能傳進「這個情境沒有的頁籤」（例如 Ban/Pick 路徑收到 matchups）⇒ 退回概覽
  const tab = TABS.some(([id]) => id === tabRaw) ? tabRaw : "overview";
  const setTab = (id) => { setTabState(id); onTabChange?.(id); };
  const h = heroById(heroId);
  const level = useHeroProgressStore((s) => s.progress[heroId]?.level);
  if (!h) return null;
  const s = h.stats;
  const laneColor = { 坦克: GC.blue, 戰士: "#fb923c", 刺客: GC.red, 法師: GC.purp, 射手: GC.green, 輔助: "#22d3ee" }[h.arch] || GC.gray;

  const body = () => {
    if (tab === "overview") return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[["勝率", GC.green], ["選用率", GC.blue], ["禁用率", GC.red]].map(([l, c]) => (
            <div key={l} style={{ background: GC.card2, borderRadius: 12, padding: "14px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: c }}>—</div>
              <div style={{ fontSize: 10, color: GC.gray, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, color: GC.gray, textAlign: "center", marginTop: -8, marginBottom: 12 }}>勝率/選用率/禁用率：資料層未提供（Legacy 為前端示意值）</div>
        <Section title="✓ 優勢" color={GC.green} items={h.strengths} />
        <Section title="✗ 劣勢" color={GC.red} items={h.weaknesses} />
      </>
    );
    if (tab === "stats") return (
      <>
        <div style={{ fontSize: 11, color: GC.gray, marginBottom: 6 }}>基礎屬性（括號為每級成長{level ? ` · 當前 Lv${level}` : ""}）</div>
        <Group title="生存能力" color={GC.green}>
          <StatRow label="生命值" k="hp" base={s.hp} grow={s.hpg} />
          <StatRow label="法力值" k="mp" base={s.mp} grow={s.mpg} />
          <StatRow label="生命回復" k="hpr" base={s.hpr} />
          <StatRow label="護甲" k="armor" base={s.armor} grow={s.armorg} />
          <StatRow label="魔抗" k="mr" base={s.mr} grow={s.mrg} />
        </Group>
        <Group title="攻擊能力" color={GC.red}>
          <StatRow label="攻擊力" k="ad" base={s.ad} grow={s.adg} />
          <StatRow label="攻擊速度" k="as" base={s.as} />
          <StatRow label="攻擊距離" k="range" base={s.range} />
          <StatRow label="移動速度" k="ms" base={s.ms} />
        </Group>
      </>
    );
    if (tab === "skills") return (
      <>
        <div style={{ fontSize: 11, color: GC.gray, marginBottom: 8 }}>技能等級成長（冷卻 / 傷害）</div>
        {["P", "Q", "W", "E", "R"].map((key) => {
          const sk = h.skills[key], sd = h.skillData[key];
          if (!sk?.name) return null;
          const kind = skillKind(sk);
          return (
            <div key={key} style={{ background: GC.card2, borderRadius: 12, padding: "12px 13px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: key === "P" ? "rgba(255,255,255,0.08)" : laneColor + "22", border: `1px solid ${laneColor}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: key === "P" ? GC.gray : laneColor, flexShrink: 0 }}>{key === "P" ? "被動" : key}</div>
                <span style={{ color: "white", fontSize: 14, fontWeight: 800 }}>{sk.name}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: kind.c, background: kind.c + "22", borderRadius: 5, padding: "2px 6px" }}>{kind.label}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#a1a1aa", lineHeight: 1.5 }}>{sk.desc}</div>
              {sd?.cd && (
                <div style={{ display: "flex", gap: 14, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${GC.line}` }}>
                  <Metric label={`冷卻 (Lv1→${sd.cd.length})`} v={`${sd.cd[0]}s → ${sd.cd[sd.cd.length - 1]}s`} c={GC.blueL} />
                  {sd.dmg && <Metric label="傷害成長" v={`${sd.dmg[0]} → ${sd.dmg[sd.dmg.length - 1]}`} c={GC.red} />}
                  {sd.ratio != null && <Metric label="加成" v={`${Math.round(sd.ratio * 100)}%`} c={GC.gold} />}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
    if (tab === "matchups") return <MatchupsTab heroId={h.id} isMobile={isMobile} onOpenHero={onOpenHero} />;
    // tactics
    const tempo = TEMPO[h.arch] || TEMPO["戰士"];
    return (
      <>
        <div style={{ fontSize: 11, color: GC.gray, marginBottom: 8 }}>對戰節奏定位</div>
        {[["前期", GC.blue], ["中期", GC.gold], ["後期", GC.red]].map(([ph, c], i) => (
          <div key={ph} style={{ display: "flex", alignItems: "stretch", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 4, background: c, borderRadius: 99, flexShrink: 0 }} />
            <div style={{ background: GC.card2, borderRadius: 10, padding: "10px 12px", flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: c, fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{ph}</span>
              <span style={{ color: "#d4d4d8", fontSize: 12 }}>{tempo[i]}</span>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: GC.gray, margin: "14px 0 6px" }}>推薦出裝（依職業核心 build）</div>
        <div style={{ background: GC.card2, borderRadius: 10, padding: "12px", fontSize: 10.5, color: GC.gray, textAlign: "center" }}>裝備系統尚未整合，資料層無出裝資料</div>
        <div style={{ fontSize: 11, color: GC.gray, margin: "14px 0 6px" }}>技能加點順序</div>
        <div style={{ background: GC.card2, borderRadius: 10, padding: "12px 13px" }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
            <PtOrder label="主升" k="Q" c={laneColor} /><PtOrder label="副升" k="E" c={GC.gray} /><PtOrder label="有大點大" k="R" c={GC.gold} />
          </div>
          <div style={{ fontSize: 10.5, color: GC.gray, lineHeight: 1.5 }}>Lv1-3 各技能點一級，之後優先升 Q，R 技能在 6/11/16 級點滿</div>
        </div>
        <div style={{ fontSize: 11, color: GC.gray, margin: "14px 0 6px" }}>推薦召喚師技能</div>
        <div style={{ display: "flex", gap: 10 }}>
          {[["✦", "閃現"], ["➤", "傳送"]].map(([i, n]) => (
            <div key={n} style={{ flex: 1, background: GC.card2, borderRadius: 10, padding: "11px", display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}><span style={{ fontSize: 15 }}>{i}</span><span style={{ color: "#d4d4d8", fontSize: 13, fontWeight: 700 }}>{n}</span></div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(4,8,16,0.75)", backdropFilter: "blur(5px)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FONT }}>
      {/*  Milestone K：唯一的縱向捲動軸就是這個面板本身（沒有巢狀捲動）；
           底部補 safe-area，最後一張對位卡不會被手機底部手勢列吃掉。 */}
      <div data-testid="codex-detail" data-hero={h.id} data-tab={tab}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "88%", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", background: `linear-gradient(180deg,${h.color}18,${GC.card} 22%)`, border: `1px solid ${h.color}55`, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: "18px 18px 26px", paddingBottom: "calc(26px + env(safe-area-inset-bottom, 0px))" }}>
        {/* 標題 */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
          {/* Sprint20：標題區 Legacy HERO_IMG 英雄圖；缺圖 → 原程序化色塊 */}
          <HeroPortrait heroId={h.id} size={60} radius={14} border={`2px solid ${h.color}`} alt={h.zh}
            fallback={<div style={{ width: 60, height: 60, borderRadius: 14, background: `radial-gradient(circle,${h.color}33,${GC.bg})`, border: `2px solid ${h.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🦸</div>} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontSize: 21, fontWeight: 900 }}>{h.zh}</div>
            <div style={{ color: h.color, fontSize: 11.5, marginBottom: 5 }}>{h.en} · {h.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: laneColor, background: laneColor + "22", borderRadius: 6, padding: "2px 8px" }}>{h.arch}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#a1a1aa", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 8px" }}>{h.lane}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: GC.gold }}>難度 {stars(h.diff)}</span>
            </div>
          </div>
          {/*  Milestone K：從對位卡跳到別隻英雄後，用這顆回到原本那隻（並停在原頁籤）。 */}
          {onBack && (
            <button data-testid="codex-detail-back" onClick={onBack} title={backLabel ? `返回 ${backLabel}` : "返回"}
              style={{ height: 34, minWidth: 34, padding: "0 10px", borderRadius: 17, background: "rgba(255,255,255,0.08)", border: `1px solid ${GC.line}`, color: "#e5e7eb", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              ←{backLabel ? ` ${backLabel}` : ""}
            </button>
          )}
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>
        {/*  分頁 tab：五頁在 360px 仍排得下；排不下時橫向捲（不換行、不縮到看不見）。
             overflowY 明確關掉 ⇒ 這條不會變成第二個縱向捲動軸。 */}
        <div data-testid="codex-tabs" style={{ display: "flex", gap: 7, marginBottom: 16, overflowX: "auto", overflowY: "hidden", flexWrap: "nowrap", scrollbarWidth: "none", paddingBottom: 2 }}>
          {TABS.map(([id, label]) => (
            <button key={id} data-testid="codex-tab" data-tab={id} data-active={tab === id ? "1" : "0"}
              onClick={() => setTab(id)} style={{ flex: "1 0 auto", minWidth: 50, padding: "10px 4px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 800, background: tab === id ? GC.green : "rgba(255,255,255,0.05)", color: tab === id ? "#0a0b0f" : "#a1a1aa", transition: "all 0.15s", whiteSpace: "nowrap" }}>{label}</button>
          ))}
        </div>
        {body()}
      </div>
    </div>
  );
}

const Section = ({ title, color, items }) => (
  <div style={{ background: GC.card2, borderRadius: 12, padding: "13px 15px", marginBottom: 10 }}>
    <div style={{ color, fontSize: 14, fontWeight: 900, marginBottom: 7 }}>{title}</div>
    {(items || []).map((x, i) => <div key={i} style={{ display: "flex", gap: 7, fontSize: 12.5, color: "#d4d4d8", padding: "2px 0" }}><span style={{ color }}>·</span>{x}</div>)}
  </div>
);
const Group = ({ title, color, children }) => (
  <div style={{ background: GC.card2, borderRadius: 12, padding: "12px 15px", marginBottom: 10 }}>
    <div style={{ color, fontSize: 13, fontWeight: 900, marginBottom: 4 }}>{title}</div>
    {children}
  </div>
);
const Metric = ({ label, v, c }) => (
  <div><div style={{ fontSize: 9, color: GC.gray, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 12, fontWeight: 800, color: c, fontFamily: MONO }}>{v}</div></div>
);
const PtOrder = ({ label, k, c }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 10, color: GC.gray }}>{label}</span><span style={{ width: 26, height: 26, borderRadius: 7, background: c + "22", border: `1px solid ${c}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: c }}>{k}</span></div>
);

// ════ Milestone K：對位頁 ═══════════════════════════════════════════════════
//  資料全部經 data/heroMatchups.js 的純函式取得——本檔不碰原始表、不做推導、
//  不排序、不隨機、不看時間 ⇒ 同一隻英雄每次 render 的內容完全一樣。
function MatchupsTab({ heroId, isMobile, onOpenHero }) {
  const data = getHeroMatchups(heroId);
  const total = MATCHUP_SECTIONS.reduce((n, k) => n + data[k].length, 0);
  const hasInferred = MATCHUP_SECTIONS.some((k) => data[k].some((e) => e.source === "inferred"));

  if (total === 0) {
    return (
      <div data-testid="matchup-empty" style={{ background: GC.card2, borderRadius: 12, padding: "26px 16px", textAlign: "center", color: GC.gray, fontSize: 12.5, lineHeight: 1.7 }}>
        {MATCHUP_EMPTY_TEXT}
        <div style={{ fontSize: 10.5, marginTop: 6, color: "rgba(255,255,255,0.35)" }}>對位資料由設計端逐隻整理，尚未涵蓋全部英雄。</div>
      </div>
    );
  }

  return (
    <div data-testid="codex-matchups">
      {hasInferred && (
        <div data-testid="matchup-inferred-note" style={{ display: "flex", gap: 7, background: "rgba(224,164,88,0.10)", border: "1px solid rgba(224,164,88,0.35)", borderRadius: 10, padding: "9px 11px", marginBottom: 12, fontSize: 11, lineHeight: 1.6, color: "#e0a458" }}>
          <span style={{ flexShrink: 0 }}>⚠</span><span>{MATCHUP_INFERRED_NOTICE}</span>
        </div>
      )}
      {MATCHUP_SECTIONS.map((k) => (
        <MatchupSection key={k} section={k} entries={data[k]} isMobile={isMobile} onOpenHero={onOpenHero} />
      ))}
      <div data-testid="matchup-disclaimer" style={{ fontSize: 9.5, color: GC.gray, lineHeight: 1.7, marginTop: 4, textAlign: "center" }}>
        設計資料＝依雙方技能組寫明的互動；系統推測＝依定位與技能特性推論。<br />
        本作沒有真實對局樣本，因此不顯示勝率、場次或版本統計。
      </div>
    </div>
  );
}

function MatchupSection({ section, entries, isMobile, onOpenHero }) {
  const c = SECTION_COLOR[section];
  return (
    <div data-testid="matchup-section" data-section={section} data-count={entries.length} style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 3, height: 13, background: c, borderRadius: 99 }} />
        <span style={{ color: c, fontSize: 13.5, fontWeight: 900 }}>{MATCHUP_SECTION_LABEL[section]}</span>
        <span style={{ fontSize: 10, color: GC.gray, fontFamily: MONO }}>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <div data-testid="matchup-section-empty" style={{ background: GC.card2, borderRadius: 10, padding: "14px 12px", textAlign: "center", fontSize: 11.5, color: GC.gray }}>
          {MATCHUP_EMPTY_TEXT}
        </div>
      ) : (
        //  手機單欄；桌機兩欄。分歧唯一來源是 useViewport（≤700px ⇒ 手機）。
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
          {entries.map((e) => <MatchupCard key={e.heroId} entry={e} accent={c} onOpenHero={onOpenHero} />)}
        </div>
      )}
    </div>
  );
}

function MatchupCard({ entry, accent, onOpenHero }) {
  const t = heroById(entry.heroId);
  if (!t) return null;   // 資料驗證已擋掉，這裡只是不讓 UI 因為髒資料整頁炸掉
  const sc = SOURCE_COLOR[entry.source] || GC.gray;
  const clickable = typeof onOpenHero === "function";
  return (
    <button data-testid="matchup-card" data-hero={t.id} data-source={entry.source} data-confidence={entry.confidence}
      onClick={clickable ? () => onOpenHero(t.id) : undefined} disabled={!clickable}
      style={{ textAlign: "left", width: "100%", background: GC.card2, border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "10px 11px", cursor: clickable ? "pointer" : "default", display: "flex", gap: 10, alignItems: "flex-start", font: "inherit" }}>
      <HeroPortrait heroId={t.id} size={38} radius="50%" border={`2px solid ${t.color}`} alt={t.zh}
        fallback={<div style={{ width: 38, height: 38, borderRadius: "50%", background: `radial-gradient(circle,${t.color}44,${GC.bg})`, border: `2px solid ${t.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>🦸</div>} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "white", fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}>{t.zh}</div>
        <div style={{ color: GC.gray, fontSize: 9.5, marginBottom: 4 }}>
          {t.en !== t.zh ? `${t.en} · ` : ""}{t.arch} · {t.lane}
        </div>
        <div style={{ color: "#d4d4d8", fontSize: 11, lineHeight: 1.55, marginBottom: 6 }}>{entry.reason}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <span data-testid="matchup-source" style={{ fontSize: 9, fontWeight: 800, color: sc, background: sc + "1f", border: `1px solid ${sc}55`, borderRadius: 5, padding: "1px 6px" }}>{MATCHUP_SOURCE_LABEL[entry.source]}</span>
          <span data-testid="matchup-confidence" style={{ fontSize: 9, fontWeight: 700, color: GC.gray, border: `1px solid ${GC.line}`, borderRadius: 5, padding: "1px 6px" }}>{MATCHUP_CONFIDENCE_LABEL[entry.confidence]}</span>
        </div>
      </div>
    </button>
  );
}
