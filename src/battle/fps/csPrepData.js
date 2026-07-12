// ============================================================================
//  battle/fps/csPrepData.js — CS 賽前流程資料（Sprint23）
//
//  兩種來源，誠實分開：
//
//  1) CS_TEAM_TACTICS / FPS_TACTIC_TYPE = Legacy EsportsGame.jsx 逐字抽取：
//     · TACTICS_LIB.fps（line 7007-7016，f1–f8 八個團隊戰術，欄位一字不改）。
//     · FPS_TACTIC_TYPE（line 153，戰術 id → 引擎 tacticType 對照）。
//     引擎吃法與 Legacy fpsRouter 相同（EsportsGame.jsx:7629）：
//     tactic=id + tacticType=對照值 → 引擎在該地圖 TACTICS_DB 挑同 type 戰術執行。
//
//  2) CS_MAPS = 最小地圖常數（⚠ 非 Legacy 資料）：
//     · key / name 唯一來源 = 引擎 MAPS（EsportsFPS3D.jsx:128；CS_MAP_KEYS 對齊）。
//     · Legacy 沒有選圖 UI（fpsRouter 賽前隨機挑圖），type/style/diff/favors/
//       oppRisk 為本 Sprint 新增的最小賽前展示 flavor，只供選圖畫面呈現，
//       不進引擎、不影響 Balance。oppNote 引用的是引擎內建 Compulsary
//       真實隊員定位（EsportsFPS3D.jsx:231-236），非虛構對手。
//     · 我方適性（mapFit）用真實 16 項能力計算，純展示。
// ============================================================================

/** Legacy TACTICS_LIB.fps 逐字（f1–f8） */
export const CS_TEAM_TACTICS = [
  { id: "f1", name: "預設配置", emoji: "📋", risk: "低", desc: "標準分兵控圖蒐集資訊", boost: ["tacticalIQ", "comms"], focus: "指揮", detail: "標準站位控制中路與兩點資訊，依情報靈活轉點" },
  { id: "f2", name: "快攻rush", emoji: "💨", risk: "高", desc: "開局集火單點突破", boost: ["courage", "reflex"], focus: "突破手", detail: "全隊集中一點rush，閃光煙霧開路，速戰速決" },
  { id: "f3", name: "夾擊split", emoji: "✂️", risk: "中", desc: "兵分兩路夾擊同點", boost: ["synergy", "positioning"], focus: "隊長", detail: "兩組從不同方向夾擊，製造交叉火力" },
  { id: "f4", name: "狙擊架點", emoji: "🎯", risk: "低", desc: "AWP卡關鍵通道控節奏", boost: ["accuracy", "focus"], focus: "狙擊手", detail: "主狙卡住關鍵長道，封鎖進攻路線" },
  { id: "f5", name: "道具強攻", emoji: "💣", risk: "中", desc: "道具配合強行進點", boost: ["tacticalIQ", "synergy"], focus: "道具手", detail: "完整道具組合強行進點壓制架槍" },
  { id: "f6", name: "誘敵fake", emoji: "🎭", risk: "中", desc: "假打一點實攻另一點", boost: ["decision", "adaptability"], focus: "指揮", detail: "製造假進攻吸引旋轉，實打空虛點" },
  { id: "f7", name: "殘局處理", emoji: "🎲", risk: "高", desc: "保槍打殘局靠個人翻盤", boost: ["clutch", "reflex"], focus: "clutch手", detail: "前期保守保槍，靠頂尖選手殘局1vN翻盤" },
  { id: "f8", name: "經濟壓制", emoji: "💰", risk: "低", desc: "穩健運營壓制對手經濟", boost: ["decision", "tacticalIQ"], focus: "指揮", detail: "穩健交換逼對手eco滾雪球" },
];

/** Legacy FPS_TACTIC_TYPE 逐字：團隊戰術 id → 引擎 tacticType（引擎依此在地圖庫挑執行戰術） */
export const FPS_TACTIC_TYPE = { f1: "default", f2: "rush", f3: "execute", f4: "default", f5: "execute", f6: "default", f7: "default", f8: "default" };

/** 引擎 tacticType 中文標籤（對齊引擎 TAC_TYPE 用語） */
export const TACTIC_TYPE_ZH = { default: "標準", rush: "強攻", execute: "執行" };

/**
 * 三張現役地圖的賽前展示卡（key/name = 引擎 MAPS；其餘為最小 flavor，見檔頭）。
 * favors = 該圖吃重的能力（16 項長鍵），供「我方適性」與提示用，不進引擎。
 */
export const CS_MAPS = [
  {
    key: "dust2", name: "Dust II", type: "對稱標準圖", style: "長槍線對決 · 狙擊強勢", diff: "低",
    favors: ["accuracy", "clutch"],
    oppRisk: "中", oppNote: "對手狙擊手 Oniheavy 擅長長距離架槍（A 長 / 中門）",
    desc: "經典雙爆點沙漠圖：A 長道與中門是狙擊戰場，B 點靠隧道快攻。",
  },
  {
    key: "mirage", name: "Mirage", type: "攻守平衡圖", style: "中路控制 · 道具執行", diff: "中",
    favors: ["tacticalIQ", "synergy"],
    oppRisk: "中", oppNote: "對手指揮 orgaNick 中路資訊掌控力強（窗口 / 連接）",
    desc: "以中路為軸的執行圖：煙牆與夾擊路線多，考驗團隊道具協同。",
  },
  {
    key: "inferno", name: "Inferno", type: "巷戰圖", style: "近身巷戰 · 道具消耗", diff: "高",
    favors: ["reflex", "courage"],
    oppRisk: "高", oppNote: "對手突破手 b3autiFul 前壓兇悍（香蕉道 / 公寓遭遇戰多）",
    desc: "狹窄巷道與香蕉道拉鋸：火焰彈消耗戰頻繁，遭遇戰反應定生死。",
  },
];

export const csMapByKey = (key) => CS_MAPS.find((m) => m.key === key) || null;

/**
 * 我方適性（純展示）：先發 5 人在該圖 favors 能力上的平均值 → 高/中/低。
 * 用真實 profileStore.players stats（16 項長鍵），不進引擎。
 */
export function mapFit(starters = [], map) {
  if (!map || !starters.length) return { score: null, grade: "—" };
  let t = 0, n = 0;
  for (const p of starters) for (const k of map.favors) { const v = p?.stats?.[k]; if (v != null) { t += v; n++; } }
  if (!n) return { score: null, grade: "—" };
  const score = Math.round(t / n);
  return { score, grade: score >= 80 ? "高" : score >= 70 ? "中" : "低" };
}
