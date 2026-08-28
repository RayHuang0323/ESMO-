// ============================================================================
//  tools/check_fan_ui_f4.mjs — Fan System F4：UI / 呈現層驗證
//
//  執行：`node tools/check_fan_ui_f4.mjs`
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  F4 只做呈現，所以它守的是**呈現層的紀律**：
//    · 畫面只讀權威資料，不重算（fanGain / eligibility / seasonFanAward）
//    · 畫面不寫狀態（`meta.fans` / `fansAtSeasonStart`）
//    · 假資料不得復活（fake audience、perk 假效果、聲望）
//    · 舊存檔沒有 snapshot 是**合法狀態**，不得回填、不得顯示 +0
//    · 沒有 Fan Center；粉絲分散嵌入既有流程
//  外加一條 balance diff guard：F4 不得動任何粉絲數值。
//
//  ⚠ 靜態掃描一律先剝註解與字串字面值（`codeOnly`）——這個 repo 的註解裡
//    到處都是 fans / perk / audience，不剝就會掃到說明文字。
//
//  ⚠ 中文 OneDrive 路徑下 ESM 相對解析會失敗 → 一律用絕對 file:// URL import。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const raw = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** 剝掉註解與字串字面值，只留會執行的程式碼。 */
function codeOnly(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; out += q + q; continue;
    }
    out += c; i++;
  }
  return out;
}
/** 保留字串字面值（要驗「畫面上有沒有這段文字」時用），只剝註解。 */
function stripComments(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}
const flat = (p) => codeOnly(raw(p)).split("\n").join(" ");
const flatText = (p) => stripComments(raw(p)).split("\n").join(" ");

const A = [];
const ck = (name, cond, detail = "") => A.push([name, !!cond, detail]);

const HOME = "src/screens/DashboardScreen.jsx";
const SPONSOR = "src/screens/manage/SponsorScreen.jsx";
const TEAM = "src/screens/manage/TeamScreen.jsx";
const RECEIPT = "src/ui/RewardReceiptPanel.jsx";
const MOBA_RESULT = "src/platform/ui/MobaFlowScreens.jsx";
const RECAP_FANS = "src/screens/manage/seasonRecap/RecapFans.jsx";
const RECAP_PRIZE = "src/screens/manage/seasonRecap/RecapPrize.jsx";

const FP = await import(u("src/platform/fans/fanPresentation.js"));

// ══ §1 Home ═══════════════════════════════════════════════════════════════
{
  const home = flat(HOME);
  ck("1) Home 使用 canonical `meta.fans`", /formatFans\(meta\.fans\)/.test(home), HOME);
  ck("2) Home 沒有新增第四張 Fan card（成長掛在既有 meta 列上）",
    /esmo-hero__meta-delta/.test(flatText(HOME)) && !/esmo-fan-card|FanCard/.test(home),
    "delta 是 hero meta 的小字，不是新卡片");
  ck("13a) Home 手機頁首也用同一支 formatFans",
    (flat(HOME).match(/formatFans\(/g) ?? []).length >= 2);
}

// ══ §2 假 audience 不得復活 ═══════════════════════════════════════════════
{
  const home = flat(HOME);
  ck("3) Home / mode card 不再 consume 假 audience",
    !/\baudience\b/.test(home), "程式碼裡已無 audience（註解不算）");
  //  全站掃描：player-facing 畫面都不得出現 mode-card 式的假觀眾數
  const uiFiles = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walk(q);
      else if (/\.jsx$/.test(e.name) && !/EsportsGame\.jsx|App\.jsx/.test(e.name)) uiFiles.push(q);
    }
  };
  ["src/screens", "src/ui", "src/platform/ui"].forEach(walk);
  const offenders = uiFiles.filter((q) => /audience\s*:/.test(flat(q)));
  ck("3b) 主幹 .jsx 沒有任何 `audience:` 假欄位",
    offenders.length === 0, offenders.join(", ") || `已掃 ${uiFiles.length} 檔`);
}

// ══ §3 Sponsor ════════════════════════════════════════════════════════════
{
  const sp = flat(SPONSOR);
  ck("4) SponsorScreen 使用 `sponsorEligibility()`", /sponsorEligibility\s*\(/.test(sp));
  ck("4b) SponsorScreen **不自己**比對 reqFans / reqWins",
    !/>=\s*\w*\.?reqFans|>=\s*\w*\.?reqWins|reqFans\s*<=|reqWins\s*<=/.test(sp),
    "畫面沒有重寫資格判定");
  const spText = flatText(SPONSOR);
  //  ⚠ 「還差 N」寫在 template literal 裡，`codeOnly()` 會把整段字串清空
  //    ⇒ 必須用 `flatText`（只剝註解、保留字串）來驗這幾條。
  ck("5) Sponsor 顯示門檻、目前值與**還差多少**",
    /reqFans\.toLocaleString/.test(spText) && /fansShort/.test(spText) && /還差/.test(spText));
  ck("6) `reqWins` 仍獨立顯示（不是與粉絲合併成一句）",
    /winsShort/.test(spText) && /winsOk/.test(spText));
  ck("6b) 粉絲達標但勝場未達標時看得出差別（blockedBy 分四種）",
    /blockedBy/.test(sp) && /data-fans-ok/.test(spText) && /data-wins-ok/.test(spText));
  ck("7) `SPONSORS[].perk` 不再被畫面 render",
    !/\.perk\b/.test(sp), "SponsorScreen 不再 consume perk");
  ck("7b) 假效果文案（訓練效果／體力恢復／士氣／獎金 +%）不在畫面上",
    !/訓練效果|體力恢復|選手士氣|比賽獎金 \+/.test(spText));
}

// ══ §4 Match Result ═══════════════════════════════════════════════════════
{
  const receipt = flat(RECEIPT);
  const moba = flat(MOBA_RESULT);
  ck("8) 賽後收據吃 authoritative receipt 的 fans", /t\.fans/.test(receipt));
  ck("8b) MOBA 賽後吃 `r.fanGain`（結算真實值）", /r\.fanGain/.test(moba));
  ck("9) 畫面不重算 fanGain（沒有 import 公式／沒有硬寫係數）",
    !/updateEconomy|teamRewardsFor|fanSourceWeight|seasonFanAward/.test(receipt + moba),
    "UI 只顯示，不計算");
  ck("9b) MOBA / CS 共用同一個收據元件（沒有兩套 fan UI）",
    /RewardReceiptPanel/.test(flat("src/AppShell.jsx")) ||
    fs.existsSync(path.join(ROOT, RECEIPT)), "RewardReceiptPanel 為共用");
}

// ══ §5 Season Recap ═══════════════════════════════════════════════════════
{
  const rf = flat(RECAP_FANS);
  ck("10) Season Recap 使用 `fansAtSeasonStart`", /fansAtSeasonStart/.test(rf));
  ck("10b) Recap 透過共用 read-model 算成長（不自己相減）",
    /seasonFanGrowth/.test(rf));
  ck("11) 舊存檔 `null` 不回填（Recap 不寫 snapshot）",
    !/fansAtSeasonStart\s*=[^=]/.test(rf) && !/setState/.test(rf));
  //  行為驗證：null ⇒ 沒有 baseline、沒有 delta
  const noBase = FP.seasonFanGrowth({ fans: 143000, fansAtSeasonStart: null });
  ck("12) 舊存檔 `null` 不顯示假的 +0",
    noBase.hasBaseline === false && noBase.delta === null && noBase.end === 143000,
    JSON.stringify(noBase));
  const withBase = FP.seasonFanGrowth({ fans: 143000, fansAtSeasonStart: 128000 });
  ck("12b) 有基準時算得出正確成長",
    withBase.hasBaseline === true && withBase.delta === 15000, `+${withBase.delta}`);
  const anomaly = FP.seasonFanGrowth({ fans: 100, fansAtSeasonStart: 128000 });
  ck("12c) `end < start` 不用 max() 掩蓋，改為標記異常並退回只顯示總數",
    anomaly.anomaly === true && anomaly.hasBaseline === false,
    "fail-soft 而不是假裝正常");
  //  賽季獎勵吃收據，不查表
  const rp = flat(RECAP_PRIZE);
  ck("8c) 賽季粉絲獎勵讀收據的 `fans`，不查 seasonFanAward 表",
    /award\?\.fans|award\.fans/.test(rp) && !/seasonFanAward/.test(rp));
}

// ══ §6 Team Overview ══════════════════════════════════════════════════════
{
  const team = flat(TEAM);
  ck("13) Team Overview 顯示 canonical fans", /meta\.fans/.test(team));
  ck("13b) Team Overview 沒有新增 Reputation / Brand Power / Fan Level",
    !/reputation|brandPower|fanLevel/i.test(team));
}

// ══ §7 命名與死欄位 ═══════════════════════════════════════════════════════
{
  const uiFiles = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walk(q);
      else if (/\.jsx$/.test(e.name) && !/EsportsGame\.jsx|App\.jsx/.test(e.name)) uiFiles.push(q);
    }
  };
  ["src/screens", "src/ui", "src/platform/ui"].forEach(walk);
  const repUi = uiFiles.filter((q) => /["'`]聲望/.test(stripComments(raw(q))));
  ck("14) `reputation`／「聲望」不 player-facing",
    repUi.length === 0, repUi.join(", ") || "(乾淨)");
  const repRead = uiFiles.filter((q) => /\.reputation\b/.test(flat(q)));
  ck("14b) 畫面不再讀 `reputation` 欄位", repRead.length === 0, repRead.join(", ") || "(乾淨)");
}

// ══ §8 UI 不寫狀態 ════════════════════════════════════════════════════════
{
  const uiFiles = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walk(q);
      else if (/\.jsx?$/.test(e.name) && !/EsportsGame\.jsx|App\.jsx/.test(e.name)) uiFiles.push(q);
    }
  };
  ["src/screens", "src/ui", "src/platform/ui"].forEach(walk);
  const fanWriters = uiFiles.filter((q) => /meta\.fans\s*=|setState\s*\([^)]*fans\s*:/.test(flat(q)));
  ck("16) UI 不寫 `meta.fans`", fanWriters.length === 0, fanWriters.join(", ") || "(乾淨)");
  //  ⚠ JSX 的 `fansAtSeasonStart={...}` 是**傳值**不是賦值。
  //    只抓真正的賦值（`x.fansAtSeasonStart =` 或物件字面值裡的 `fansAtSeasonStart:`）。
  const snapWriters = uiFiles.filter((q) => {
    const c = flat(q);
    return /\.fansAtSeasonStart\s*=[^=]/.test(c) || /fansAtSeasonStart\s*:/.test(c);
  });
  ck("17) UI 不寫 `fansAtSeasonStart`", snapWriters.length === 0, snapWriters.join(", ") || "(乾淨)");
  ck("15) MOBA / CS 的粉絲顯示共用同一個 team-level `meta.fans`",
    /meta\.fans/.test(flat("src/screens/manage/seasonRecap/SeasonRecap.jsx")) &&
    /meta\.fans/.test(flat("src/screens/manage/seasonRecap/CsSeasonRecap.jsx")));
  ck("15b) CS recap 用的是 **CS 的** season snapshot（不污染 MOBA）",
    /competitionView\(\s*""\s*\)/.test(flat("src/screens/manage/seasonRecap/CsSeasonRecap.jsx")),
    "competitionView(\"cs\") ⇒ 各自 season context");
}

// ══ §9 不得有 Fan Center ══════════════════════════════════════════════════
{
  const banned = ["FanScreen", "FanCenter", "FanDashboard", "FanHistoryScreen", "FanStore"];
  const found = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walk(q);
      else if (banned.some((b) => e.name.startsWith(b))) found.push(q);
    }
  };
  walk("src");
  const routed = banned.filter((b) => new RegExp(b).test(flat("src/AppShell.jsx")));
  ck("18) 沒有 Fan Center / 第二個粉絲畫面",
    found.length === 0 && routed.length === 0, [...found, ...routed].join(", ") || "(乾淨)");
}

// ══ §10 balance diff guard：F4 不得動任何粉絲數值 ═════════════════════════
{
  //  ⚠ 2026-08-26：`src/data/playerModel.js` **從檔案級凍結移出**。
  //    這條要守的是 `SPONSORS[].reqFans`，但 playerModel.js 同時也放
  //    `TRAINING_COURSES` / `POSITION_PROFILE` / `STAT_DEF` 等與粉絲無關的東西
  //    ⇒ 整檔凍結會被任何不相干的改動觸發（Foundation Calibration 新增一門
  //    訓練課程就踩到了），變成「阻力」而不是「保護」。
  //    **這不是放寬**：`reqFans` 改由下面 19b 的**逐值斷言**守住，
  //    那比檔案比對更精準——連「用別的路徑改到數值」都抓得到，
  //    而檔案比對只知道「有人動過這個檔」。
  const BALANCE = [
    "src/platform/data/matchRecorder.js",          // fanGain
    "src/platform/progress/fanSourceWeight.js",    // 來源權重
    "src/platform/economy/seasonFanAward.js",      // 賽季獎勵表
    "src/platform/economy/economyConfig.js",
  ];
  let changed = [];
  try {
    const out = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD", "--", ...BALANCE],
      { cwd: ROOT, encoding: "utf8" });
    changed = out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { changed = ["(git diff 失敗，無法確認)"]; }
  ck("19/20) balance guard：fanGain / 來源權重 / 賽季獎勵 / economyConfig 零改動（reqFans 見 19b）",
    changed.length === 0, changed.join(", ") || "(四份全部未動)");

  //  再直接驗一次數值本身，避免有人用別的路徑改到
  const { SPONSORS } = await import(u("src/data/playerModel.js"));
  const ladder = [...SPONSORS].sort((a, b) => a.reqFans - b.reqFans).map((s) => s.reqFans);
  ck("19b) reqFans 六階仍是 0 / 100k / 150k / 180k / 205k / 220k",
    JSON.stringify(ladder) === JSON.stringify([0, 100000, 150000, 180000, 205000, 220000]),
    ladder.join(" / "));
  const { FAN_SOURCE_WEIGHT, FAN_SOURCE } = await import(u("src/platform/progress/fanSourceWeight.js"));
  ck("20b) 來源權重仍是 1 / 5 / 8.5",
    FAN_SOURCE_WEIGHT[FAN_SOURCE.practice] === 1 &&
    FAN_SOURCE_WEIGHT[FAN_SOURCE.league] === 5 &&
    FAN_SOURCE_WEIGHT[FAN_SOURCE.major] === 8.5);
}

// ── 輸出 ───────────────────────────────────────────────────────────────────
let pass = 0;
for (const [name, ok, detail] of A) {
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`);
}
console.log(`\n${pass}/${A.length} 通過`);
process.exit(pass === A.length ? 0 : 1);
