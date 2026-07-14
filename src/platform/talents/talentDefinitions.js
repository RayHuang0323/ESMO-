// ============================================================================
//  talents/talentDefinitions.js — 選手天賦定義（Sprint27，四類 × 三節點 = 12）
//
//  與 Legacy TalentModule 的刻意差異（Audit 結論，不是照搬）：
//    · Legacy 是「全隊」加成且 allocateTalent **直接改 base stats**
//      （setRoster 寫 stats[statKey]+1，單一團隊點數池）。
//    · S27 是**每位選手獨立**、效果走 **derived 層**（base stats 永不被寫），
//      點數 = S25 發放的 players[].talentPoints。
//
//  stat 鍵一律用 playerModel.STAT_DEF 的 16 項長鍵（平台唯一能力鍵空間）；
//  CS 引擎的短鍵（rxn/acc/…）由 fpsRoster.STAT_L2S 轉換，本檔不重複造鍵。
//  任務單的分類對應：操作=reflex/accuracy/apm/positioning、
//  戰術=mapAware/tacticalIQ/decision/adaptability、心理=courage/clutch/focus/
//  resilience、團隊=comms/leadership/synergy/learning。
//
//  數值紅線：每 rank 合計只 +1~2 點既有能力；無傷害/勝率/金錢/XP/獎勵倍率；
//  最終值由 playerDerivedStats clamp 到 1–99。
//  滿配上限：12 節點 × 3 rank × cost1 = 36 點；單項能力加成最高 +6。
// ============================================================================

export const TALENT_CATEGORIES = [
  { id: "operation", zh: "操作", emoji: "⚔️", color: "#f87171" },
  { id: "tactics",   zh: "戰術", emoji: "🧠", color: "#60a5fa" },
  { id: "mental",    zh: "心理", emoji: "🔥", color: "#a78bfa" },
  { id: "team",      zh: "團隊", emoji: "🤝", color: "#34d399" },
];

const T = (id, category, name, description, effects, prerequisites = []) => ({
  id, category, name, description,
  maxRank: 3, costPerRank: 1,
  prerequisites,                       // [{ talentId, minRank }]
  effects,                             // [{ stat: 長鍵, perRank: 1|2 }]
});

export const TALENT_DEFINITIONS = [
  // ── 操作 ──────────────────────────────────────────────────────────────
  T("operation_1", "operation", "基礎操作訓練", "反覆的槍法與補刀基本功：反應速度、精準度每級 +1。",
    [{ stat: "reflex", perRank: 1 }, { stat: "accuracy", perRank: 1 }]),
  T("operation_2", "operation", "手速強化", "高強度 APM 特訓：操作速度每級 +2。",
    [{ stat: "apm", perRank: 2 }], [{ talentId: "operation_1", minRank: 2 }]),
  T("operation_3", "operation", "走位精修", "站位與撤退路線的肌肉記憶：走位每級 +2。",
    [{ stat: "positioning", perRank: 2 }], [{ talentId: "operation_2", minRank: 2 }]),
  // ── 戰術 ──────────────────────────────────────────────────────────────
  T("tactics_1", "tactics", "戰術基礎課", "地圖資訊與輪轉觀念：視野意識、戰術理解每級 +1。",
    [{ stat: "mapAware", perRank: 1 }, { stat: "tacticalIQ", perRank: 1 }]),
  T("tactics_2", "tactics", "決策訓練", "限時決策演練：決策力每級 +2。",
    [{ stat: "decision", perRank: 2 }], [{ talentId: "tactics_1", minRank: 2 }]),
  T("tactics_3", "tactics", "臨場應變", "逆風局與突發狀況復盤：應變力每級 +2。",
    [{ stat: "adaptability", perRank: 2 }], [{ talentId: "tactics_2", minRank: 2 }]),
  // ── 心理 ──────────────────────────────────────────────────────────────
  T("mental_1", "mental", "抗壓訓練", "賽點模擬與冥想課程：抗壓、專注力每級 +1。",
    [{ stat: "clutch", perRank: 1 }, { stat: "focus", perRank: 1 }]),
  T("mental_2", "mental", "膽識培養", "主動開局的心理建設：勇氣每級 +2。",
    [{ stat: "courage", perRank: 2 }], [{ talentId: "mental_1", minRank: 2 }]),
  T("mental_3", "mental", "韌性打磨", "連敗後的恢復訓練：韌性每級 +2。",
    [{ stat: "resilience", perRank: 2 }], [{ talentId: "mental_2", minRank: 2 }]),
  // ── 團隊 ──────────────────────────────────────────────────────────────
  T("team_1", "team", "溝通默契", "報點用語與同步演練：溝通、配合度每級 +1。",
    [{ stat: "comms", perRank: 1 }, { stat: "synergy", perRank: 1 }]),
  T("team_2", "team", "領導養成", "輪值 IGL 與復盤主持：領導力每級 +2。",
    [{ stat: "leadership", perRank: 2 }], [{ talentId: "team_1", minRank: 2 }]),
  T("team_3", "team", "學習方法", "版本研究與筆記系統：學習力每級 +2。",
    [{ stat: "learning", perRank: 2 }], [{ talentId: "team_2", minRank: 2 }]),
];

const BY_ID = new Map(TALENT_DEFINITIONS.map((t) => [t.id, t]));
export const talentById = (id) => BY_ID.get(id) ?? null;
export const talentsByCategory = (cat) => TALENT_DEFINITIONS.filter((t) => t.category === cat);
