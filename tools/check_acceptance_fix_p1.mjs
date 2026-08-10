#!/usr/bin/env node
// ============================================================================
//  tools/check_acceptance_fix_p1.mjs — 集中驗收修正包（五項 UI／流程問題）
//
//  執行：repo 根目錄 `node tools/check_acceptance_fix_p1.mjs`；**失敗時 exit 1**。
//
//  §1 MOBA／CS 只有一個主要配對入口，且它隨流程改變身分
//  §2 內部識別資訊不在正式主畫面直接顯示（展開／debug 才看得到）
//  §3 測試資金：Store、畫面、財務帳本三者一致
//  §4 MOBA 與 CS 共用同一套賽前元件
//  §5 CS 五席缺員狀態正確（缺人不得整列消失）
//  §6 天賦入口能到真正的天賦樹（且沒有第二套天賦系統）
//  §7 UI 未定義識別字掃描（build 抓不到的白畫面 bug）
//  §8 沒有動到既有契約、驗證邏輯與戰鬥平衡
// ============================================================================
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default ?? _traverse;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const FRAME = "src/screens/common/MatchPrepFrame.jsx";
const QUEUE = "src/screens/common/MatchQueuePanel.jsx";
const ENTRY = "src/screens/common/MatchEntryPanel.jsx";
const LINEUP = "src/screens/moba/LineupScreen.jsx";
const CSPREP = "src/screens/fps/CsPrepScreen.jsx";
const ROSTER = "src/screens/manage/RosterScreen.jsx";
const FINANCE = "src/screens/manage/FinanceScreen.jsx";
const APPSHELL = "src/AppShell.jsx";
const DASH = "src/screens/DashboardScreen.jsx";

//  主按鈕邏輯抽成純 .js 才驗得到——放在 .jsx 裡 Node 匯入不了，
//  驗證就只能用正則猜，那等於沒驗。
const { primaryActionFor } = await import("../src/screens/common/matchPrepAction.js");

/**
 * 去掉註解再做字串比對。
 * ⚠ 第一版直接對原始碼 includes("隊伍版本")，結果抓到**我自己寫的說明註解**
 *   （「隊伍版本…移到展開區」）——跟 P1 §7a 同一種錯。註解不是畫面。
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §1 只有一個主要配對入口 ══");
{
  const frame = read(FRAME);
  const queue = read(QUEUE);

  //  兩個賽前頁都必須用共用外框，且外框只有一顆主按鈕
  ck("§1a MOBA 與 CS 都使用共用外框 MatchPrepFrame",
    read(LINEUP).includes("MatchPrepFrame") && read(CSPREP).includes("MatchPrepFrame"));

  const primaryCount = (frame.match(/data-testid="prep-primary-action"/g) ?? []).length;
  ck("§1b 共用外框只有一顆主按鈕", primaryCount === 1, `找到 ${primaryCount} 顆`);

  //  ⚠ 2026-08-07：`statusOnly` 這個開關已被**更強的做法**取代——
  //  狀態卡現在根本不含任何推進流程的按鈕，也不呼叫任何 store action，
  //  不需要開關來「關掉」它們。以下斷言照新機制寫，強度不低於舊版。
  const noAdvance = ["enqueueMatch", "confirmMatchReady", "launchMatchSession", "requeueMatch", "resetMatchmaking"];
  ck("§1c 狀態卡只吃 flow，不自己訂閱 store",
    /MatchQueuePanel\(\{ mode = "moba", flow \}\)/.test(queue) && !/useProfileStore/.test(queue));
  ck("§1d 狀態卡不呼叫任何推進流程的 store action",
    noAdvance.every((a) => !queue.includes(a)), "無");
  ck("§1e 狀態卡沒有「開始配對」按鈕", !/開始配對/.test(queue.replace(/\/\/.*$/gm, "")));
  ck("§1f 狀態卡沒有「我方確認」「進入對戰」按鈕（那些在底部唯一主按鈕上）",
    !/<button[^>]*>\s*我方確認/.test(queue) && !/<button[^>]*>\s*進入對戰/.test(queue));

  //  ── 主按鈕的身分要涵蓋任務單列的每一個狀態 ──
  if (!primaryActionFor) {
    ck("§1g 主按鈕邏輯可獨立驗證（純函式匯出）", false, "primaryActionFor 匯入失敗");
  } else {
    const A = (o) => primaryActionFor(o);
    ck("§1g 尚未配對且陣容合法 ⇒ 開始配對",
      A({ entryOk: true, view: { state: "idle" }, room: {}, session: {} }).key === "enqueue");
    ck("§1h 陣容不合法 ⇒ 停用並說明原因",
      (() => { const r = A({ entryOk: false, view: { state: "idle" }, room: {}, session: {} });
        return r.disabled && /陣容尚未完成/.test(r.label); })());
    ck("§1i 配對中 ⇒ 停用並顯示等待時間",
      (() => { const r = A({ entryOk: true, view: { state: "queued", waitedSec: 75 }, room: {}, session: {} });
        return r.disabled && r.label.includes("01:15"); })(), "01:15");
    ck("§1j 已配對 ⇒ 停用（等待開房）",
      A({ entryOk: true, view: { state: "matched" }, room: {}, session: {} }).disabled);
    ck("§1k 雙方確認階段且我方未確認 ⇒ 我方確認",
      A({ entryOk: true, view: { state: "matched" }, room: { state: "ready_check", usReady: false }, session: {} }).key === "confirm");
    ck("§1l 我方已確認 ⇒ 停用並等待對手",
      A({ entryOk: true, view: { state: "matched" }, room: { state: "ready_check", usReady: true }, session: {} }).disabled);
    //  ⚠ 2026-08-07：進場改為**自動**（雙方確認後不需玩家再按），key 由 launch → launching
    ck("§1m 場次可進場 ⇒ 自動進入 Ban/Pick",
      A({ entryOk: true, view: { state: "matched" }, room: { state: "confirmed" }, session: { canLaunch: true } }).key === "launching");
    //  ⚠ key 由 reset → requeue：現在是「作廢並重新排隊」，不只是回到起點
    ck("§1n 已取消 ⇒ 重新配對",
      A({ entryOk: true, view: { state: "cancelled" }, room: {}, session: {} }).key === "requeue");
    //  ⚠ key 由 reset → requeue：現在是「作廢並重新排隊」，不只是回到起點
    ck("§1o 被拒絕 ⇒ 重新配對",
      A({ entryOk: true, view: { state: "rejected" }, room: {}, session: {} }).key === "requeue");
    //  ⚠ key 由 reset → requeue：現在是「作廢並重新排隊」，不只是回到起點
    ck("§1p 房間逾期 ⇒ 重新配對",
      A({ entryOk: true, view: { state: "matched" }, room: { state: "expired" }, session: {} }).key === "requeue");
  }

  //  ⚠ 不得建立第二條配對邏輯：外框只能呼叫既有 store action
  const actions = ["enqueueMatch", "confirmMatchReady", "launchMatchSession", "resetMatchmaking"];
  ck("§1q 外框只呼叫既有的 store action（沒有第二條配對邏輯）",
    actions.every((a) => frame.includes(a)) &&
    !/createTicket|makeTicket|new MatchmakingTicket|createAssignment/.test(frame));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §2 主畫面不顯示內部識別資訊 ══");
{
  //  ⚠ 2026-08-07：出賽卡已重寫。舊版把工程資訊放進「查看提交內容」展開區，
  //  新版**在正式模式完全不出現**（只有 ?debug=1 才有，且預設收合）——比舊版嚴格。
  const entry = read(ENTRY);
  const entryCode = stripComments(entry);
  const queueCode = stripComments(read(QUEUE));

  ck("§2a 主畫面顯示陣容完整度（n/5）",
    /check\.filled\}\/\{check\.required\}/.test(entryCode));
  ck("§2b 陣容完整度讀契約算好的 filled／required（畫面不自己數）",
    /check\.filled/.test(entryCode) && !/players\.filter\([\s\S]{0,40}length === 5/.test(entryCode));

  const dbg = entryCode.indexOf("{debug && ok && req && (");
  const main = entryCode.slice(0, dbg > 0 ? dbg : entryCode.length);
  ck("§2c 隊伍版本／申請識別整區都在 debug 之後", dbg > 0);
  ck("§2d 正式區塊沒有 rosterVersion / transactionId",
    !main.includes("rosterVersion") && !main.includes("transactionId"));
  ck("§2e debug 區塊預設收合（查看技術內容）",
    /useState\(false\)/.test(entryCode) && /查看技術內容/.test(entryCode));
  ck("§2f 「出賽申請」這個內部詞彙已從正式標題移除",
    !/出賽申請/.test(main) && /出賽陣容/.test(main));
  ck("§2g 缺人時顯示契約產生的中文原因", /e\.message/.test(entryCode));

  const qdbg = queueCode.indexOf("{debug && (");
  const qmain = queueCode.slice(0, qdbg > 0 ? qdbg : queueCode.length);
  const secrets = ["rosterVersion", "transactionId", "ticketId", "roomId", "seed", "issuedBy"];
  ck("§2h 狀態卡正式區塊沒有任何內部識別",
    !secrets.some((k) => qmain.includes(k)),
    secrets.filter((k) => qmain.includes(k)).join(",") || "無");
  ck("§2i 追蹤鏈只在 debug 顯示且預設收合",
    qdbg > 0 && /查看技術內容/.test(queueCode) && /data-testid="flow-internals"/.test(queueCode));

  const req = read("src/platform/contracts/matchEntry.js");
  ck("§2j 契約欄位未被刪除（rosterVersion / transactionId / submittedAt 都還在）",
    req.includes("rosterVersion") && req.includes("transactionId") && req.includes("submittedAt"));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §3 測試資金：Store／畫面／帳本一致 ══");
{
  const { useProfileStore } = await import("../src/platform/profileStore.js");
  const st = useProfileStore.getState();
  st.reset?.();

  const before = useProfileStore.getState().finance.funds;
  const txBefore = (useProfileStore.getState().finance.transactions ?? []).length;
  const r = useProfileStore.getState().grantTestFunds(100_000_000);

  ck("§3a 補充成功", r.ok === true, `+$${r.granted?.toLocaleString?.()}`);
  const after = useProfileStore.getState().finance;
  ck("§3b Store 資金 = 1 億", after.funds === 100_000_000, `$${after.funds.toLocaleString()}`);
  ck("§3c 回傳值與 Store 一致（畫面顯示的就是 Store 的值）", r.funds === after.funds);
  ck("§3d 補的金額 = 目標 − 補之前（不多不少）", r.granted === 100_000_000 - before,
    `${r.granted} = 100000000 − ${before}`);

  const tx = (after.transactions ?? [])[0];
  ck("§3e 帳本最上方是這筆測試資金", !!tx && tx.cat === "test", tx?.label);
  ck("§3f 帳本金額 = 實際補充金額（帳目對得起來）", tx?.amount === r.granted);
  ck("§3g 帳本筆數 +1", (after.transactions ?? []).length === txBefore + 1);
  ck("§3h 帳本標示為可追蹤的測試資金", /測試資金/.test(tx?.label ?? ""));

  //  重複點：不得灌爆帳本，也不得再加錢
  const r2 = useProfileStore.getState().grantTestFunds(100_000_000);
  const after2 = useProfileStore.getState().finance;
  ck("§3i 重複補充被擋下", r2.ok === false, r2.reason);
  ck("§3j 重複補充不改資金", after2.funds === 100_000_000);
  ck("§3k 重複補充不新增帳本紀錄",
    (after2.transactions ?? []).length === (after.transactions ?? []).length);

  //  入口必須是 debug-only
  const fin = read(FINANCE);
  ck("§3l 測試資金入口只在 debug 模式顯示",
    /const debug = isDebugMode\(\)/.test(fin) && /\{debug && \(/.test(fin) &&
    fin.includes('data-testid="test-funds-panel"'));
  ck("§3m 入口按鈕呼叫 store 的 grantTestFunds（畫面不自己改錢）",
    /grantTestFunds\(100_000_000\)/.test(fin) && !/funds:\s*100_000_000/.test(fin));

  //  ⚠ 不得改動經濟平衡
  const econ = read("src/platform/economy/economyConfig.js");
  ck("§3n 經濟設定檔未被本修正包改動（無測試資金相關字樣）",
    !/grantTestFunds|測試資金|100_000_000/.test(econ));
  const salary = read("src/platform/economy/salary.js");
  ck("§3o 薪資公式未被改動", !/grantTestFunds|測試資金/.test(salary));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §4 MOBA 與 CS 共用同一套賽前元件 ══");
{
  const lineup = read(LINEUP), cs = read(CSPREP), frame = read(FRAME);
  const shared = ["MatchPrepFrame", "SquadSeatRow"];
  ck("§4a 兩邊都匯入共用外框與共用席位列",
    shared.every((k) => lineup.includes(k) && cs.includes(k)));

  //  共用外框負責的七件事
  const parts = [
    ["頁首", (f) => f.includes("{onBack &&") && f.includes("{icon}") && f.includes("{title}")],
    ["五人陣容席位", /\{seats && </],
    ["出賽申請卡", /<MatchEntryPanel/],
    ["配對狀態", /<MatchQueuePanel/],
    ["底部主按鈕", /data-testid="prep-primary-action"/],
  ];
  for (const [name, m] of parts) ck(`§4b 共用外框負責「${name}」`, typeof m === "function" ? m(frame) : m.test(frame));
  //  ⚠ 2026-08-07：確認**動作**已收斂到底部唯一主按鈕；狀態卡只顯示確認**狀態**。
  ck("§4c 房間確認：動作在唯一主按鈕，狀態在共用狀態卡",
    /key: "confirm"/.test(read("src/screens/common/matchPrepAction.js")) &&
    /我方/.test(read(QUEUE)) && /對手/.test(read(QUEUE)) && /已確認/.test(read(QUEUE)));

  //  兩邊都不得再自己組出賽卡／配對卡
  ck("§4d CS 不再自己放 MatchEntryPanel／MatchQueuePanel（改由外框統一）",
    !cs.includes("<MatchEntryPanel") && !cs.includes("<MatchQueuePanel"));
  ck("§4e MOBA 不再自己放 MatchEntryPanel／MatchQueuePanel",
    !lineup.includes("<MatchEntryPanel") && !lineup.includes("<MatchQueuePanel"));

  //  模式差異只允許名稱／圖示／位置名／色彩
  ck("§4f CS 只客製名稱、圖示、色彩與五個位置名",
    /title="CS 賽前準備"/.test(cs) && /icon="🎯"/.test(cs) && /accent=\{ACC\}/.test(cs) &&
    /SEAT_STYLE/.test(cs));
  ck("§4g MOBA 同樣只客製那幾項",
    /title="MOBA 賽前配置"/.test(lineup) && /accent=\{PURP\}/.test(lineup));

  //  沿用既有流程，不得有第二套
  //  ⚠ 2026-08-07：契約 view 改由 useMatchFlow 統一取得（單一狀態來源），
  //  外框不再各自訂閱——那正是按鈕凍結的根因。
  ck("§4h 兩邊沿用同一組既有契約流程（經由 useMatchFlow 單一來源）",
    (() => { const h = read("src/screens/common/useMatchFlow.js");
      return /matchEntry/.test(h) && /squadCheck/.test(h) && /matchmakingView/.test(h)
        && /matchRoomView/.test(h) && /matchSessionView/.test(h) && /useMatchFlow/.test(frame); })());
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §5 CS 五席缺員狀態 ══");
{
  const cs = read(CSPREP);
  //  ⚠ 根因：舊版 `.filter(Boolean)` 讓缺人的席位整列消失
  ck("§5a CS 席位不再被 filter 掉（五席一定都算進來）",
    /CS_SEATS\.map\(\(seat\) => \{/.test(cs) &&
    !/const seats = [\s\S]{0,200}\.filter\(Boolean\)/.test(cs));
  ck("§5b 缺員時仍建立席位列（seated 用 !!p 表示，不 return null）",
    /seated=\{!!p\}/.test(cs));

  const frame = read(FRAME);
  ck("§5c 共用席位列在缺員時顯示「未指派」與該席位名稱",
    frame.includes("未指派") && /\{label\} 沒有指派選手/.test(frame));
  ck("§5d 缺員席位以紅色標示（不只靠文字）",
    /seated \? "rgba\(147,197,253,0.18\)" : "rgba\(248,113,113/.test(frame));
  ck("§5e 缺員席位仍可直接指派（🔁 一律渲染）", /onSwap && \(/.test(frame));
  ck("§5f CS 每一席都給了指派入口", /onSwap=\{\(\) => setBench\(seat\)\}/.test(cs));
  ck("§5g CS 指派用既有的 store action（setCsSeat），不另建流程",
    /setCsSeat/.test(cs) && !/csLineup:\s*\{/.test(cs));
  //  席位列有可測試的標記
  ck("§5h 席位列可被自動化辨識（data-testid / data-seated）",
    frame.includes('data-testid="squad-seat"') && frame.includes('data-seated='));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §6 天賦入口 ══");
{
  const dash = read(DASH), shell = read(APPSHELL), roster = read(ROSTER);
  ck("§6a 首頁「天賦」不再導向一般名單", !/talent: "roster"/.test(dash));
  ck("§6b 首頁「天賦」導向天賦選擇頁", /talent: "talentPick"/.test(dash));
  ck("§6c AppShell 有 talentPick 畫面", /screen === "talentPick"/.test(shell));
  ck("§6d 選擇頁點選手 → **直接進天賦樹**（不是選手詳情）",
    /talentPick[\s\S]{0,200}setScreen\("playerTalent"\)/.test(shell));
  ck("§6e 天賦樹仍是既有的 PlayerTalentScreen（沒有第二套天賦系統）",
    /screen === "playerTalent" && <PlayerTalentScreen/.test(shell) &&
    fs.existsSync(resolve(ROOT, "src/screens/manage/PlayerTalentScreen.jsx")));
  ck("§6f 選手詳情的天賦入口仍在（兩條路都通）",
    /onTalent=\{\(id\) =>[\s\S]{0,80}setScreen\("playerTalent"\)/.test(shell));

  ck("§6g 中介頁標題為「選擇要培養的選手」", /"選擇要培養的選手"/.test(roster));
  ck("§6h 每位選手有清楚的「查看天賦」入口",
    roster.includes('data-testid="talent-open"') && roster.includes("查看天賦"));
  ck("§6i 中介頁顯示可用天賦點（玩家知道有沒有東西可花）",
    /可用天賦點/.test(roster));
  ck("§6j 中介頁點卡片直達天賦樹", /if \(talentMode\) \{ onPlayer\?\.\(p\.id\); return; \}/.test(roster));
  ck("§6k 一般名單模式行為不變（仍開內嵌詳情）",
    /setSelId\(p\.id\); setEditName\(false\);/.test(roster));

  //  不得改天賦資料與購買規則
  const defs = read("src/platform/talents/talentDefinitions.js");
  ck("§6l 天賦定義未被改動（無本修正包字樣）", !/talentPick|purpose/.test(defs));
  const buy = read("src/platform/talents/purchasePlayerTalent.js");
  ck("§6m 天賦購買規則未被改動", !/talentPick|purpose/.test(buy));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §7 UI 未定義識別字掃描 ══");
//  ⚠ `npm run build` 只做打包，**不做作用域分析**。O 系列 RecruitScreen 那次
//    白畫面就是 build 全綠、一點就炸。這一段補上那個缺口。
{
  const FILES = [FRAME, QUEUE, ENTRY, LINEUP, CSPREP, ROSTER, FINANCE, APPSHELL, DASH];
  const GLOBALS = new Set([
    "React", "window", "document", "console", "Math", "JSON", "Object", "Array", "Number",
    "String", "Boolean", "Date", "Map", "Set", "Promise", "parseInt", "parseFloat",
    "isNaN", "isFinite", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "navigator",
    "Error", "TypeError", "RangeError", "Symbol", "BigInt", "Intl", "performance",
    "structuredClone", "queueMicrotask", "globalThis", "undefined", "NaN", "Infinity",
    "fetch", "URL", "Blob", "FileReader", "Image", "CustomEvent", "Event", "AbortController",
    "WebSocket", "TextEncoder", "TextDecoder", "crypto", "process",
  ]);
  const bad = [];
  for (const f of FILES) {
    const ast = parse(read(f), {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator"],
    });
    traverse(ast, {
      ReferencedIdentifier(path) {
        const n = path.node.name;
        if (GLOBALS.has(n)) return;
        if (path.scope.hasBinding(n, true)) return;
        bad.push(`${f}:${path.node.loc?.start.line} → ${n}`);
      },
    });
  }
  ck("§7a 本修正包觸及的畫面全部沒有未定義識別字", bad.length === 0,
    bad.length ? bad.slice(0, 8).join("　") : `掃描 ${FILES.length} 個檔`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §8 沒有動到契約、驗證邏輯與戰鬥平衡 ══");
{
  const squad = read("src/platform/contracts/matchSquad.js");
  ck("§8a validateSquad 仍回傳 filled／required（本包只是讀它）",
    /return \{ ok: errors\.length === 0, errors, warnings, filled, required: required\.length \}/.test(squad));
  const mm = read("src/platform/contracts/matchmaking.js");
  ck("§8b 配對契約未被放寬（對手仍不得夾帶數值）",
    /對手資料不得夾帶數值/.test(mm));
  const eng = read("src/LogicEngine.js");
  ck("§8c 戰鬥傷害式未被動過", /const dmgAmt = p\.power \* dt \* R\.dmgK/.test(eng));
  const mps = read("src/battle/moba/mobaPlayerStats.js");
  ck("§8d P0-3 品質係數限幅未被動過",
    /xpRateScale:\s*\[0\.94,\s*1\.06\]/.test(mps) &&
    /focusRate:\s*\{\s*dir:\s*"bonus",\s*hi:\s*0\.35\s*\}/.test(mps));
  const lg = read("src/platform/progress/levelGrowth.js");
  ck("§8e 成長費率未被動過", /pointsPerLevel:\s*3\.0/.test(lg) && /perStatCap:\s*1\.5/.test(lg));
}

console.log(`\n${fail === 0 ? "🟢" : "🔴"} 集中驗收修正包：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
