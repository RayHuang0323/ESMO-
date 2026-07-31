#!/usr/bin/env node
// ============================================================================
//  tools/check_hero_matchups_k.mjs — Milestone K 資料層安全網
//
//  驗四件事：
//    §1 Matchup Contract v1 的結構與完整性（heroId 存在／無自指／無重複／enum）
//    §2 空資料、非法輸入、決定性、唯讀
//    §3 沒有污染 heroDatabase / CHAMPIONS_100，也沒有虛構統計
//    §4 inferred 條目的方向性，用**現行 BanPickScreen 的 archCounterScore 重算**
//       （不是把它接回 Ban/Pick，是拿它當審稿工具；規則被改動時本檔會紅燈）
//    §5 UI 原始碼的結構性保證（版面事實由 shot_hero_matchups_k.mjs 在瀏覽器驗）
//
//  ⚠ 斷言原則：能驗行為就驗行為。純 JSX 版面（誰在誰上面、捲不捲得動、
//    點下去會不會開）Node 驗不了 ⇒ 一律交給 shot 腳本，本檔不假裝驗過。
// ============================================================================
import fs from "node:fs";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  getHeroMatchups, getStrongAgainst, getWeakAgainst, getSynergies,
  hasMatchupData, listMatchupHeroIds, validateHeroMatchups,
  MATCHUP_CONTRACT_VERSION, MATCHUP_SECTIONS, MATCHUP_SECTION_LABEL,
  MATCHUP_SOURCES, MATCHUP_CONFIDENCES, MATCHUP_SOURCE_LABEL,
  MATCHUP_CONFIDENCE_LABEL, MATCHUP_INFERRED_NOTICE, MATCHUP_EMPTY_TEXT,
} from "../src/data/heroMatchups.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const src = (p) => fs.readFileSync(p, "utf8");
const MATCHUP_SRC = src("src/data/heroMatchups.js");
const DETAIL = src("src/screens/moba/HeroCodexDetail.jsx");
const CODEX = src("src/screens/moba/CodexScreen.jsx");
const BP = src("src/screens/moba/BanPickScreen.jsx");

const ids = listMatchupHeroIds();
const allEntries = ids.flatMap((id) => MATCHUP_SECTIONS.flatMap((k) =>
  getHeroMatchups(id)[k].map((e) => ({ owner: id, section: k, ...e }))));

console.log("── §1 Matchup Contract v1 結構 ──");
{
  ck(`1) 契約版本常數存在（${MATCHUP_CONTRACT_VERSION}）`, MATCHUP_CONTRACT_VERSION === "HeroMatchups.v1", MATCHUP_CONTRACT_VERSION);
  ck("2) 三個區塊、順序固定，且常數是凍結的",
    Object.isFrozen(MATCHUP_SECTIONS)
    && JSON.stringify(MATCHUP_SECTIONS) === JSON.stringify(["strongAgainst", "weakAgainst", "synergies"]),
    MATCHUP_SECTIONS);
  ck("3) source / confidence 的 enum 就是規格那三個 / 三個",
    JSON.stringify(MATCHUP_SOURCES) === JSON.stringify(["design", "inferred", "verified"])
    && JSON.stringify(MATCHUP_CONFIDENCES) === JSON.stringify(["low", "medium", "high"])
    && Object.isFrozen(MATCHUP_SOURCES) && Object.isFrozen(MATCHUP_CONFIDENCES),
    { MATCHUP_SOURCES, MATCHUP_CONFIDENCES });
  ck("4) 三個區塊與兩個 enum 都有顯示文案（UI 不用自己另寫一份）",
    MATCHUP_SECTIONS.every((k) => !!MATCHUP_SECTION_LABEL[k])
    && MATCHUP_SOURCES.every((s) => !!MATCHUP_SOURCE_LABEL[s])
    && MATCHUP_CONFIDENCES.every((c) => !!MATCHUP_CONFIDENCE_LABEL[c])
    && MATCHUP_SOURCE_LABEL.design === "設計資料" && MATCHUP_SOURCE_LABEL.inferred === "系統推測"
    && MATCHUP_SOURCE_LABEL.verified === "實戰驗證",
    MATCHUP_SOURCE_LABEL);
  ck(`5) 每筆關係都有完整四欄位（實測 ${allEntries.length} 筆）`,
    allEntries.length > 0 && allEntries.every((e) =>
      typeof e.heroId === "string" && typeof e.reason === "string"
      && typeof e.source === "string" && typeof e.confidence === "string"),
    allEntries.filter((e) => !e.heroId || !e.reason || !e.source || !e.confidence));
  {
    const known = new Set(CHAMPIONS_100.map((c) => c.id));
    const bad = allEntries.filter((e) => !known.has(e.heroId));
    ck("6) 所有關聯英雄都存在於 heroDatabase（沒有幽靈 heroId）", bad.length === 0, bad);
    const badOwner = ids.filter((id) => !known.has(id));
    ck("7) 所有「有資料的英雄」本身也存在於 heroDatabase", badOwner.length === 0, badOwner);
  }
  {
    const self = allEntries.filter((e) => e.heroId === e.owner);
    ck("8) 沒有任何英雄克制／搭配自己", self.length === 0, self);
  }
  {
    const dup = [];
    for (const id of ids) for (const k of MATCHUP_SECTIONS) {
      const list = getHeroMatchups(id)[k].map((e) => e.heroId);
      if (new Set(list).size !== list.length) dup.push(`${id}.${k}`);
    }
    ck("9) 同一區塊內沒有重複英雄", dup.length === 0, dup);
  }
  {
    const bad = allEntries.filter((e) => !MATCHUP_SOURCES.includes(e.source) || !MATCHUP_CONFIDENCES.includes(e.confidence));
    ck("10) source / confidence 全部落在 enum 內", bad.length === 0, bad.map((e) => [e.owner, e.heroId, e.source, e.confidence]));
  }
  {
    //  reason 不可以只寫定位名稱敷衍過去；要求 12 字以上且不等於任一定位名。
    const ARCH = new Set(["坦克", "戰士", "刺客", "法師", "射手", "輔助"]);
    const thin = allEntries.filter((e) => !e.reason.trim() || e.reason.trim().length < 12 || ARCH.has(e.reason.trim()));
    ck("11) 每筆 reason 都非空且有實質說明（≥12 字、不是只寫定位）", thin.length === 0, thin.map((e) => [e.owner, e.heroId, e.reason]));
  }
  {
    const v = validateHeroMatchups();
    ck("12) 內建 validateHeroMatchups() 自己也是全綠", v.ok, v.errors);
  }
}

console.log("\n── §2 空資料、非法輸入、決定性、唯讀 ──");
{
  const EMPTY_SHAPE = (r, id) => r && r.heroId === id && MATCHUP_SECTIONS.every((k) => Array.isArray(r[k]) && r[k].length === 0);
  const noData = CHAMPIONS_100.map((c) => c.id).filter((id) => !ids.includes(id));
  ck(`13) 沒整理的英雄（${noData.length} 隻）一律回傳穩定空結構，不 throw、不回 null`,
    noData.every((id) => { try { return EMPTY_SHAPE(getHeroMatchups(id), id); } catch { return false; } }),
    noData.filter((id) => !EMPTY_SHAPE(getHeroMatchups(id), id)).slice(0, 5));
  {
    const weird = [undefined, null, 0, 42, "", "nope", "constructor", "__proto__", "toString", {}, [], NaN];
    let threw = null, shaped = true;
    for (const w of weird) {
      try {
        const r = getHeroMatchups(w);
        if (!r || !MATCHUP_SECTIONS.every((k) => Array.isArray(r[k]) && r[k].length === 0)) { shaped = false; threw = String(w); }
      } catch (e) { threw = `${String(w)} → ${e.message}`; shaped = false; }
    }
    ck("14) 非法／原型鏈輸入（null/數字/constructor/__proto__…）不 throw 也不漏資料", shaped && threw === null, threw);
  }
  ck("15) 四個 getter 與 getHeroMatchups 完全一致",
    CHAMPIONS_100.every((c) => {
      const m = getHeroMatchups(c.id);
      return getStrongAgainst(c.id) === m.strongAgainst && getWeakAgainst(c.id) === m.weakAgainst && getSynergies(c.id) === m.synergies;
    }));
  ck("16) hasMatchupData 與實際資料一致（有資料 10 隻、其餘 90 隻沒有）",
    ids.length === 10 && ids.every((id) => hasMatchupData(id))
    && CHAMPIONS_100.filter((c) => hasMatchupData(c.id)).length === ids.length,
    { withData: ids.length });
  ck("17) 同一輸入決定性：連續 3 次呼叫逐值相同（有資料者連參考都相同）",
    CHAMPIONS_100.every((c) => {
      const a = getHeroMatchups(c.id), b = getHeroMatchups(c.id), d = getHeroMatchups(c.id);
      const same = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(d);
      return same && (!hasMatchupData(c.id) || (a === b && b === d));
    }));
  ck("18) 回傳的資料是凍結的（UI 拿到手也改不動）",
    ids.every((id) => {
      const m = getHeroMatchups(id);
      if (!Object.isFrozen(m)) return false;
      return MATCHUP_SECTIONS.every((k) => Object.isFrozen(m[k]) && m[k].every((e) => Object.isFrozen(e)));
    }));
  {
    //  真的去改改看：不可以改得動（嚴格模式下 push 會 throw ⇒ 兩種結果都算擋住）
    const before = JSON.stringify(getHeroMatchups("ironclad"));
    try { getHeroMatchups("ironclad").strongAgainst.push({ heroId: "x" }); } catch { /* frozen */ }
    try { getStrongAgainst("ironclad")[0].reason = "改掉"; } catch { /* frozen */ }
    ck("19) 實際嘗試竄改後資料原封不動", JSON.stringify(getHeroMatchups("ironclad")) === before);
  }
  ck("20) 原始 HERO_MATCHUPS 物件沒有 export（UI 只能走純函式）",
    !/export\s+(const|let|var|function)?\s*HERO_MATCHUPS/.test(MATCHUP_SRC)
    && !/export\s*\{[^}]*HERO_MATCHUPS/.test(MATCHUP_SRC));
}

console.log("\n── §3 沒有污染既有資料，也沒有虛構統計 ──");
{
  ck("21) CHAMPIONS_100 仍是 100 隻，且沒有被塞進任何 matchup 欄位",
    CHAMPIONS_100.length === 100
    && CHAMPIONS_100.every((c) => !("matchups" in c) && !("strongAgainst" in c) && !("weakAgainst" in c) && !("synergies" in c)),
    CHAMPIONS_100.length);
  ck("22) heroDatabase 的既有欄位形狀不變（抽驗 ironclad 的關鍵欄位）",
    (() => {
      const h = heroById("ironclad");
      return h && h.zh === "鋼鐵衛士" && h.arch === "坦克" && h.stats?.hp === 667
        && Array.isArray(h.strengths) && Array.isArray(h.weaknesses) && !!h.skills?.R?.name;
    })());
  ck("23) 相依方向正確：heroMatchups → heroDatabase，heroDatabase 不反過來 import",
    !src("src/data/heroDatabase.js").includes("heroMatchups")
    && MATCHUP_SRC.includes('from "./heroDatabase.js"'));
  {
    //  誠實邊界：不得出現勝率／場次／版本統計。連 reason 裡的百分比都要查——
    //  技能敘述本身的百分比（減傷 25%）是允許的，但「勝率 / 場 / 版本 / patch」不行。
    const BANNED = /勝率|勝場|敗率|場次|對局數|樣本數|版本\s*\d|patch|pick\s*率|ban\s*率|選用率|禁用率|段位|排名第/i;
    const hits = allEntries.filter((e) => BANNED.test(e.reason));
    ck("24) 沒有任何 reason 出現勝率／場次／版本／選用率等不存在的統計", hits.length === 0, hits.map((e) => [e.owner, e.heroId, e.reason]));
  }
  ck("25) 本輪沒有任何 verified 條目（專案沒有真實對局樣本，寫了就是編的）",
    allEntries.every((e) => e.source !== "verified")
    && allEntries.some((e) => e.source === "design") && allEntries.some((e) => e.source === "inferred"),
    { design: allEntries.filter((e) => e.source === "design").length, inferred: allEntries.filter((e) => e.source === "inferred").length, verified: allEntries.filter((e) => e.source === "verified").length });
  ck("26) 資料層沒有隨機、沒有時間相依（不可能每次 render 變一次）",
    !/Math\.random|Date\.now|new Date\(|performance\.now/.test(MATCHUP_SRC));
  ck("27) 對位資料沒有被任何引擎／戰鬥／選角流程 import（純圖鑑呈現）",
    (() => {
      const offenders = [];
      const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = `${dir}/${f.name}`;
          if (f.isDirectory()) { walk(p); continue; }
          if (!/\.(js|jsx)$/.test(f.name)) continue;
          if (p.endsWith("src/data/heroMatchups.js")) continue;
          if (!fs.readFileSync(p, "utf8").includes("heroMatchups")) continue;
          if (!/screens\/moba\/(HeroCodexDetail|CodexScreen)\.jsx$/.test(p)) offenders.push(p);
        }
      };
      walk("src");
      return offenders.length === 0 ? true : (console.log("   →", offenders), false);
    })());
  ck("28) 引擎仍然決定性，且本輪沒有動到戰鬥數值（同 seed 兩次逐值相同）",
    (() => {
      const run = (s) => { const e = new LogicEngine(s); for (let i = 0; i < 3000 && !e.over; i++) e.tick(0.5); return JSON.stringify({ t: Math.round(e.t * 100), k: e.players.map((p) => p.k), g: e.players.map((p) => Math.round(p.g ?? 0)) }); };
      return run(42) === run(42) && run(7) === run(7);
    })());
}

console.log("\n── §4 inferred 的方向性：用現行 archCounterScore 重算 ──");
{
  //  為什麼用抽原始碼的方式：archCounterScore 住在 .jsx 裡（Node 不能直接 import），
  //  但那兩支是純 JS、零 React 相依。抽出來 new Function 執行 ⇒ 測的是**現行規則**，
  //  規則被改動時這一節會立刻紅燈，而不是對著一份複製品自我感覺良好。
  let fns = null, why = null;
  try {
    const a = BP.indexOf("function analyzeChamp(champ)");
    const r = BP.indexOf("return score;", a);
    const end = BP.indexOf("}", r);                        // `return score;` 之後的第一個 } 就是函式收尾
    const code = BP.slice(a, end + 1).replace(/export\s+function/g, "function");
    fns = new Function(`${code}\nreturn { analyzeChamp, archCounterScore };`)();
    if (typeof fns.archCounterScore !== "function") { fns = null; why = "抽不到 archCounterScore"; }
  } catch (e) { why = e.message; }
  ck("29) 成功從 BanPickScreen 原始碼抽出現行的 analyzeChamp / archCounterScore", !!fns, why);
  if (fns) {
    ck("30) 抽出來的函式行為與 Legacy 規則一致（已知取樣值）",
      fns.archCounterScore(heroById("ravager"), heroById("maestro")) === 7
      && fns.archCounterScore(heroById("maestro"), heroById("ravager")) === 0,
      [fns.archCounterScore(heroById("ravager"), heroById("maestro")), fns.archCounterScore(heroById("maestro"), heroById("ravager"))]);
    const inferred = allEntries.filter((e) => e.source === "inferred");
    const delta = (strongId, weakId) =>
      fns.archCounterScore(heroById(strongId), heroById(weakId)) - fns.archCounterScore(heroById(weakId), heroById(strongId));
    const bad = [];
    for (const e of inferred) {
      if (e.section === "synergies") continue;               // 搭配不是克制，方向性不適用
      const d = e.section === "strongAgainst" ? delta(e.owner, e.heroId) : delta(e.heroId, e.owner);
      if (d < 3) bad.push([e.owner, e.section, e.heroId, d]);
    }
    ck(`31) 每一筆 inferred 克制條目的定位相性方向差都 ≥3（共 ${inferred.length} 筆）`, bad.length === 0, bad);
    ck("32) 而且不是全部條目都靠推測（design 仍是主體）",
      allEntries.filter((e) => e.source === "design").length > inferred.length,
      { design: allEntries.length - inferred.length, inferred: inferred.length });
  }
  ck("33) archCounterScore 沒有被本輪改動（仍是 export 的純函式，AI 選角照用）",
    /export function archCounterScore\(a, b\)/.test(BP)
    && BP.includes("archCounterScore(c, rc)") && BP.includes("archCounterScore(c, bc)"));
  //  ⚠ 要比對的是**程式碼**，不是註解。BanPickScreen 的註解裡留著「（克制你的 XXX）」
  //    當作 Hotfix 2 的移除紀錄；拿原始檔直接 includes 會把那行註解當成違規。
  ck("34) Ban/Pick 仍然沒有任何「誰克制誰」的玩家呈現（J-close Hotfix 2 不被推翻）",
    (() => {
      const code = BP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return !code.includes("draft-plan-counter") && !code.includes("data-counter") && !code.includes("克制你的");
    })());
  //  Ray 於 Milestone K 收尾裁決：ⓘ 開的就是 Hero Codex，五頁都要有。
  //  但這是**呼叫端**傳進去的，不是元件的全域預設——這兩件事要分開驗，
  //  否則「Ban/Pick 也要五頁」會被誤讀成「元件預設打開」，
  //  將來任何新呼叫端就會莫名其妙多出一頁。
  ck("35) Ban/Pick 的 ⓘ 有明確傳入 showMatchups（呼叫端選擇，不是全域預設）",
    /<HeroCodexDetail heroId=\{detailId\} showMatchups onClose=\{\(\) => setDetailId\(null\)\}\s*\/>/.test(BP));
  ck("36) 元件的全域預設仍是 false（沒傳的呼叫端不會被影響）",
    /showMatchups = false,/.test(DETAIL));
  ck("37) Ban/Pick 仍然沒有自己去讀對位資料（資料只從 Hero Codex 元件流入）",
    !BP.includes("heroMatchups") && !BP.includes("getHeroMatchups"));
}

console.log("\n── §5 UI 原始碼結構（版面／互動由 shot 腳本在瀏覽器驗）──");
{
  ck("38)〔原始碼〕Hero Codex 是五個頁籤，第五個是「對位」",
    DETAIL.includes('const MATCHUP_TAB = ["matchups", "對位"]')
    && /BASE_TABS = \[\["overview", "概覽"\], \["stats", "數據"\], \["skills", "技能"\], \["tactics", "戰術"\]\]/.test(DETAIL)
    && DETAIL.includes("showMatchups ? [...BASE_TABS, MATCHUP_TAB] : BASE_TABS"));
  ck("39)〔原始碼〕UI 只透過純函式取資料，沒有碰原始表",
    DETAIL.includes("getHeroMatchups(heroId)") && !DETAIL.includes("HERO_MATCHUPS")
    && !CODEX.includes("HERO_MATCHUPS"));
  ck("40)〔原始碼〕警語與空狀態文案來自資料層常數，不是 UI 各寫一份",
    DETAIL.includes("MATCHUP_INFERRED_NOTICE") && DETAIL.includes("MATCHUP_EMPTY_TEXT")
    && !DETAIL.includes("不代表真實玩家勝率") && !DETAIL.includes("目前尚無已整理的對位資料"));
  ck("41) 警語與空狀態的文案就是規格指定的那兩句",
    MATCHUP_INFERRED_NOTICE === "此內容依英雄定位與技能特性推測，不代表真實玩家勝率。"
    && MATCHUP_EMPTY_TEXT === "目前尚無已整理的對位資料。",
    [MATCHUP_INFERRED_NOTICE, MATCHUP_EMPTY_TEXT]);
  ck("42)〔原始碼〕對位頁沒有隨機、沒有時間相依、沒有排序副作用",
    !/Math\.random|Date\.now|new Date\(/.test(DETAIL) && !/Math\.random|Date\.now/.test(CODEX));
  ck("43)〔原始碼〕手機單欄、桌機兩欄，分歧唯一來源是 useViewport",
    DETAIL.includes('import { useIsMobile } from "../../ui/useViewport.js"')
    && DETAIL.includes('gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr"'));
  ck("44)〔原始碼〕面板底部補了 safe-area（最後一張卡不會被手勢列吃掉）",
    /paddingBottom: "calc\(26px \+ env\(safe-area-inset-bottom/.test(DETAIL));
  ck("45)〔原始碼〕頁籤列是橫向捲，縱向明確關閉（不會變成第二條縱向捲動軸）",
    /data-testid="codex-tabs"[\s\S]{0,240}overflowX: "auto", overflowY: "hidden"/.test(DETAIL));
  ck("46)〔原始碼〕詳情的「看哪一隻／停在哪一頁」由 CodexScreen 單點持有",
    CODEX.includes("const [view, setView]") && CODEX.includes("const [stack, setStack]")
    && CODEX.includes("const [lastView, setLastView]")
    && CODEX.includes('setView({ heroId, tab: "matchups" })')
    && CODEX.includes("lastView?.heroId === heroId ? lastView.tab"));
  ck("47)〔原始碼〕對位卡與頁籤都有可驗收錨點（測試不靠 DOM 索引猜英雄）",
    DETAIL.includes('data-testid="matchup-card"') && DETAIL.includes("data-hero={t.id}")
    && DETAIL.includes('data-testid="codex-tab"') && DETAIL.includes('data-testid="matchup-section"')
    && DETAIL.includes('data-testid="matchup-empty"') && DETAIL.includes('data-testid="matchup-inferred-note"')
    && CODEX.includes('data-testid="codex-hero"'));
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
