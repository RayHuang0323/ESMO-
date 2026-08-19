#!/usr/bin/env node
// ============================================================================
//  Team Development / 天賦系統 版本保護 gate
//
//  守的是一個**版本降級**，不是一個功能缺陷：2026-08 正式站部署了較舊的 main
//  之後，首頁又出現舊的「天賦」磚與舊天賦樹，而較新的「戰隊發展」整套 UI
//  在 branch 上活得好好的。build 全綠、既有 verifier 全綠——因為沒有任何一支
//  在問「首頁的主要投資入口現在是哪一個」。
//
//  ⚠ 這支**刻意不做 E2E**，也**刻意不 import** `teamDevelopment.js`：
//    它必須能在「那個模組根本不存在」的樹上跑完並**如實說不存在**，
//    而不是自己 crash。全部用檔案內容判定。
//
//  ⚠ 三段輸出是分開的，因為它們是三件不同的事：
//      UI Recovery Contract   ← 契約。違反 = 降級 = exit 非 0
//      Persistence Integration ← 路線圖。沒做完不是降級，只回報現況
//      Gameplay Consumers      ← 同上
//    把後兩段算成 PASS 會讓「UI 恢復了」被讀成「R59–R62 完成了」，
//    那正是這支 gate 要防的誤讀。
//
//  執行：node tools/check_team_development_recovery.mjs
//        node tools/check_team_development_recovery.mjs --root=<另一棵 worktree>
//
//  `--root` 是給**跨樹稽核**用的：同一支契約可以直接指向 recovery staging 或
//  release worktree，不必把腳本複製過去、也就不必弄髒那棵樹。
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootArg = (process.argv.slice(2).find((a) => a.startsWith("--root=")) ?? "").replace("--root=", "");
const ROOT = rootArg ? resolve(rootArg) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = (file) => resolve(ROOT, file);
const has = (file) => existsSync(path(file));
const read = (file) => (has(file) ? readFileSync(path(file), "utf8") : null);

const F = {
  screen: "src/screens/manage/TeamDevelopmentScreen.jsx",
  domain: "src/platform/development/teamDevelopment.js",
  shell: "src/AppShell.jsx",
  dashboard: "src/screens/DashboardScreen.jsx",
  talent: "src/screens/manage/PlayerTalentScreen.jsx",
  frame: "src/screens/manage/ManageFrame.jsx",
  profileFoundation: "src/ui/playerProfileFoundation.js",
  playerDetail: "src/screens/manage/PlayerDetailScreen.jsx",
  store: "src/platform/profileStore.js",
};

const contract = [];
const ck = (label, ok, detail = "") => {
  contract.push({ label, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail && !ok ? `　${detail}` : ""}`);
};

console.log("══ Team Development / 天賦系統 版本保護 ══");
console.log(`受檢樹：${ROOT}\n`);

// ── ① UI Recovery Contract ────────────────────────────────────────────────
console.log("── UI Recovery Contract ──");

const screen = read(F.screen);
const dashboard = read(F.dashboard);
const shell = read(F.shell);

// 沒有新版畫面就沒有契約可談：這棵樹要嘛在 recovery 之前，要嘛被降級回去了。
// 兩種都不是 PASS。
const uiPresent = screen != null;
ck("TeamDevelopmentScreen 存在（新版 UI baseline）", uiPresent, F.screen);

if (uiPresent) {
  ck("戰隊發展領域模組存在", has(F.domain), F.domain);

  //  4 分類 / 20 節點 / Lv.0–3：用文字判定，不 import。
  const domain = read(F.domain) ?? "";
  const nodeCount = (domain.match(/^ {2}NODE\(/gm) ?? []).length;
  const categoryCount = (domain.match(/\{ id: "(general|moba|cs|management)",/g) ?? []).length;
  ck("4 分類 / 20 節點", nodeCount === 20 && categoryCount === 4, `nodes=${nodeCount} categories=${categoryCount}`);
  ck("節點等級上限為 3（Lv.0/3）", /maxRank: options\.maxRank \?\? 3/.test(domain));
  ck("節點具備 prerequisites 與 levelEffects（下一級效果）",
    /prerequisites: options\.prerequisites/.test(domain) && /levelEffects: options\.levelEffects/.test(domain));
  ck("規劃中（planned/future）狀態存在且不產生效果",
    /future: options\.future/.test(domain) && /activeLevelCap/.test(domain));

  //  ⚠ 這條是整支 gate 的核心：首頁主要投資入口。
  //    降級的長相就是這裡從「戰隊發展」變回「天賦」。
  const devTile = /<Tile[^>]*label="戰隊發展"/.test(dashboard ?? "");
  const talentTile = /<Tile[^>]*label="天賦"/.test(dashboard ?? "");
  ck("首頁主要入口磚為「戰隊發展」", devTile);
  ck("首頁不再以「天賦」作為主要入口磚", !talentTile,
    "偵測到 <Tile label=\"天賦\">——這正是 2026-08 降級的長相");
  ck("首頁 NAV 將 development 導向 teamDevelopment",
    /development: "teamDevelopment"/.test(dashboard ?? ""));

  ck("AppShell 有 teamDevelopment 路由指向 TeamDevelopmentScreen",
    /screen === "teamDevelopment"/.test(shell ?? "") && /<TeamDevelopmentScreen/.test(shell ?? ""));

  //  相容性是**保留**，不是恢復成主要入口。兩件事分開驗。
  ck("舊天賦畫面仍保留（legacy compatibility，未被刪除）", has(F.talent), F.talent);
  ck("talentPick 路由仍保留給相容流程", /talent: "talentPick"/.test(dashboard ?? ""));

  //  R61 / R62 已列入 recovery baseline 的 UI 元件。
  const frame = read(F.frame) ?? "";
  ck("R61：共用返回鍵具備手機觸控目標（minWidth 40 ＋ aria-label）",
    /minWidth: 40/.test(frame) && /aria-label="返回"/.test(frame));
  const foundation = read(F.profileFoundation) ?? "";
  const detail = read(F.playerDetail) ?? "";
  ck("R62：Player Profile 四分頁 overview/abilities/growth/career",
    /"overview"[\s\S]{0,400}"abilities"[\s\S]{0,400}"growth"[\s\S]{0,400}"career"/.test(foundation)
    && /player-profile-tabs/.test(detail));
} else {
  console.log("  ⚠ 新版 UI 不在這棵樹上 ⇒ 其餘 UI 契約無從驗起（不視為通過）。");
}

// ── ② Persistence Integration（回報現況，不判定契約）────────────────────
const store = read(F.store) ?? "";
const schemaMatch = store.match(/PROFILE_SCHEMA_VERSION\s*=\s*(\d+)/);
const schemaVersion = schemaMatch ? Number(schemaMatch[1]) : null;
const persistence = {
  schemaVersion,
  hydrate: /teamDevelopment: sanitizeTeamDevelopment/.test(store),
  writeHook: /purchaseTeamDevelopment\(nodeId\)/.test(store),
};
const persistenceDone = persistence.hydrate && persistence.writeHook;

console.log("\n── Persistence Integration（R59 / R59.1）──");
console.log(`  PROFILE_SCHEMA_VERSION = ${schemaVersion ?? "讀不到"}`);
console.log(`  profileStore teamDevelopment 初始化／migration：${persistence.hydrate ? "有" : "無"}`);
console.log(`  purchaseTeamDevelopment 寫入口：${persistence.writeHook ? "有" : "無"}`);

// ── ③ Gameplay Consumers（回報現況，不判定契約）──────────────────────────
const CONSUMERS = {
  "MOBA BanPick": "src/screens/moba/BanPickScreen.jsx",
  "MOBA Tactic": "src/screens/moba/TacticScreen.jsx",
  "CS Tactic": "src/screens/fps/CsTacticScreen.jsx",
  "Roster": "src/screens/manage/RosterScreen.jsx",
  "Recruit": "src/screens/manage/RecruitScreen.jsx",
};
const consumers = Object.entries(CONSUMERS).map(([name, file]) => {
  const src = read(file) ?? "";
  return { name, file, wired: /teamDevelopmentEffects|hasTeamDevelopment/.test(src) };
});
const consumersDone = consumers.length > 0 && consumers.every((c) => c.wired);

console.log("\n── Gameplay Consumers（R60）──");
for (const c of consumers) console.log(`  ${c.wired ? "已接線" : "未接線"}　${c.name}　${c.file}`);

// ── 總結 ──────────────────────────────────────────────────────────────────
const uiFailed = contract.filter((c) => !c.ok);
const uiState = !uiPresent ? "NOT PRESENT"
  : uiFailed.length ? "VIOLATED"
  : "PASS";

console.log("\n════════════════════════════════════════");
console.log(`UI Recovery Contract:    ${uiState}${uiPresent ? `　(${contract.length - uiFailed.length}/${contract.length})` : ""}`);
console.log(`Persistence Integration: ${persistenceDone ? "INTEGRATED" : "NOT YET INTEGRATED"}`);
console.log(`Gameplay Consumers:      ${consumersDone ? "INTEGRATED" : "NOT YET INTEGRATED"}`);
console.log("");

//  ⚠ 只有 UI 契約決定 exit code。persistence / consumers 是**已知未完成**的
//    路線圖項目，讓它們把 gate 染紅只會訓練人忽略紅燈。
//    但它們也**永遠不會**被印成 PASS——見檔頭。
if (uiState === "PASS") {
  console.log("Team Development recovery contract: PASS");
  console.log("⚠ UI 契約通過**不代表** R59–R62 完成；上面兩段才是產品整合狀態。");
  process.exit(0);
}
if (uiState === "NOT PRESENT") {
  console.log("Team Development recovery contract: NOT PRESENT");
  console.log("這棵樹沒有新版戰隊發展 UI。若它是 recovery 之後的樹 ⇒ **發生降級**；");
  console.log("若是 recovery 之前的基準 ⇒ 尚未恢復。兩者都不得當成通過。");
  process.exit(1);
}
console.log("Team Development recovery contract: VIOLATED");
console.log(`違反 ${uiFailed.length} 條：${uiFailed.map((c) => c.label).join("、")}`);
process.exit(1);
