#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_club_identity_ui.mjs — 俱樂部識別的真實瀏覽器驗證
//
//  執行：`node tools/browser_check_club_identity_ui.mjs [--headed]`；失敗 exit 1。
//
//  ⚠ 驗的是**外觀真的變了**，不是「型錄卡片畫得出來」。
//    三種型別各自要有一個真實的呈現消費端：
//      · clubTheme  → Dashboard 的 `--club-accent` 真的換值
//      · clubTitle  → 戰隊名稱旁真的出現稱號
//      · clubBanner → 隊徽的 `data-banner` 真的變成該紋樣
//    少驗任何一個，這個系統就只是一本會扣點數的收藏冊。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5383;
const CDP_PORT = 9423;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

const seed = (points) => `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  profile.useProfileStore.setState({
    retention: { ...st().retention, clubPoints: ${points}, clubPointsLifetime: ${points} },
  });
  st().save();
  return "seeded";
`;

/**
 * 走首頁進俱樂部資產（桌機常駐磚；手機在底部 sheet）。
 *
 * ⚠ **要輪詢，不能只試一次。** 手機的入口住在底部導覽的「更多」sheet 裡，
 *   而底部導覽比 dashboard 本體晚一點才掛上。單試一次會在「頁面已經在了、
 *   導覽還沒到」的空窗期拿到 `no-entry`——那不是產品缺入口，是量太早。
 */
const ENTER = `
  const w = (ms) => new Promise(r => setTimeout(r, ms));
  const find = () => document.querySelector('[data-testid="home-utility-equip"]')
    || document.querySelector('[data-testid="home-sheet-equip"]');
  const deadline = Date.now() + 12000;
  let b = null;
  while (Date.now() < deadline) {
    b = find();
    if (b) break;
    const more = [...document.querySelectorAll("button")].find(x => (x.innerText || "").trim() === "更多");
    if (more) { more.click(); await w(520); b = find(); if (b) break; }
    await w(250);
  }
  if (!b) return "no-entry";
  b.click();
  //  同樣輪詢等目標畫面掛上，而不是猜一個秒數。
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    if (document.querySelector('[data-testid="club-assets-screen"]')) return "open";
    await w(200);
  }
  return "not-open";
`;

/** 回首頁量外觀有沒有真的生效。 */
const HOME_LOOK = `
  const root = document.querySelector(".esmo-dashboard");
  const crest = document.querySelector(".esmo-hero__crest") || document.querySelector(".esmo-mobile-header__crest");
  const title = document.querySelector('[data-testid="club-identity-title"]');
  const cs = root ? getComputedStyle(root) : null;
  return JSON.stringify({
    hasRoot: Boolean(root),
    themeAttr: root ? root.dataset.clubTheme : null,
    accent: cs ? cs.getPropertyValue("--club-accent").trim() : null,
    ring: cs ? cs.getPropertyValue("--club-ring").trim() : null,
    banner: crest ? (crest.dataset.banner ?? null) : null,
    titleText: title ? title.textContent.trim() : null,
  });
`;

/**
 * 等 app 真的掛上（而不是等一個猜出來的秒數）。
 * 回傳實際等了幾毫秒——逾時會讓後續斷言帶著這個數字紅，而不是無聲失敗。
 */
async function waitForApp(chrome, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const ready = String(await chrome.evaluate(`
      const root = document.querySelector(".esmo-dashboard");
      const crest = document.querySelector(".esmo-hero__crest") || document.querySelector(".esmo-mobile-header__crest");
      return String(Boolean(root && crest));
    `));
    if (ready.includes("true")) return Date.now() - (until - timeoutMs);
    await sleep(250);
  }
  return -1;
}

const SAVE = `
  const raw = localStorage.getItem("esmo.profile.v1");
  const s = JSON.parse(raw);
  return JSON.stringify({
    clubPoints: s.retention?.clubPoints ?? null,
    lifetime: s.retention?.clubPointsLifetime ?? null,
    owned: Object.keys(s.clubAssets?.owned ?? {}),
    equipped: s.clubAssets?.equippedIdentity ?? null,
    headCoach: s.clubAssets?.headCoachId ?? null,
    lastChangeWeek: s.clubAssets?.lastCoachChangeWeek ?? null,
  });
`;

let server = null, chrome = null;
try {
  server = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
    console.log(`\n── ${label} ──`);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await chrome.navigate(server.url);
    await sleep(900);
    await chrome.evaluate(seed(4000));
    await chrome.navigate(server.url);
    await sleep(1400);

    //  ① 基準：完全沒裝備時，外觀變數應該是「沒有被注入」。
    const base = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜首頁渲染得出來`, base.hasRoot === true);
    ck(`${label}｜未裝備時沒有主題標記`, base.themeAttr === "none", String(base.themeAttr));
    ck(`${label}｜未裝備時隊徽沒有紋樣`, base.banner === null, String(base.banner));
    ck(`${label}｜未裝備時沒有稱號`, base.titleText === null, String(base.titleText));

    //  ② 進資產頁，三種型別的卡片都在
    const entered = await chrome.evaluate(ENTER);
    ck(`${label}｜點得進俱樂部資產頁`, String(entered).includes("open"), String(entered).replace(/"/g, ""));
    const cards = J(await chrome.evaluate(`
      const q = (t) => document.querySelector('[data-testid="' + t + '"]');
      return JSON.stringify({
        theme: Boolean(q("identity-card-theme_ember")),
        title: Boolean(q("identity-card-title_ironclad")),
        banner: Boolean(q("identity-card-banner_laurel")),
        buyEnabled: Boolean(q("identity-buy-theme_ember") && !q("identity-buy-theme_ember").disabled),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    `));
    ck(`${label}｜三種型別的外觀卡都在`, cards.theme && cards.title && cards.banner);
    ck(`${label}｜「取得」可按`, cards.buyEnabled === true);
    ck(`${label}｜資產頁無橫向溢出`, cards.overflowX <= 1, `overflow=${cards.overflowX}`);

    //  ③ 購買主題：扣點、lifetime 不變、進收藏、空槽自動裝上
    const before = J(await chrome.evaluate(SAVE));
    await chrome.evaluate(`document.querySelector('[data-testid="identity-buy-theme_ember"]').click(); await new Promise(r => setTimeout(r, 900)); return "ok";`);
    const after = J(await chrome.evaluate(SAVE));
    ck(`${label}｜購買主題扣掉 700`, after.clubPoints === before.clubPoints - 700, `${before.clubPoints} → ${after.clubPoints}`);
    ck(`${label}｜clubPointsLifetime 逐值不變`, after.lifetime === before.lifetime, `${before.lifetime} → ${after.lifetime}`);
    ck(`${label}｜主題進入收藏`, after.owned.includes("theme_ember"));
    ck(`${label}｜空槽自動裝上`, after.equipped?.themeId === "theme_ember", String(after.equipped?.themeId));
    //  ⚠ 外觀不得動到教練的任何欄位。
    ck(`${label}｜外觀購買不動總教練`, after.headCoach === null && after.lastChangeWeek === null);

    //  ④ 再買稱號與隊徽框
    await chrome.evaluate(`
      document.querySelector('[data-testid="identity-buy-title_ironclad"]').click();
      await new Promise(r => setTimeout(r, 800));
      document.querySelector('[data-testid="identity-buy-banner_laurel"]').click();
      await new Promise(r => setTimeout(r, 800));
      return "ok";
    `);
    const three = J(await chrome.evaluate(SAVE));
    ck(`${label}｜三件外觀都進收藏`,
      ["theme_ember", "title_ironclad", "banner_laurel"].every((id) => three.owned.includes(id)),
      three.owned.join(","));
    ck(`${label}｜三個槽各自裝上`,
      three.equipped?.themeId === "theme_ember" && three.equipped?.titleId === "title_ironclad"
      && three.equipped?.bannerId === "banner_laurel", JSON.stringify(three.equipped));

    //  ⑤ **外觀真的改變首頁**——這是這支 gate 的重點
    await chrome.navigate(server.url);
    await sleep(1500);
    const look = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜主題色真的套用到首頁`, look.accent === "#fb923c", `--club-accent=${look.accent}`);
    ck(`${label}｜主題標記寫在 DOM 上`, look.themeAttr === "theme_ember", String(look.themeAttr));
    ck(`${label}｜稱號真的出現在戰隊名稱旁`, look.titleText === "鐵壁", String(look.titleText));
    ck(`${label}｜隊徽框真的套用`, look.banner === "laurel", String(look.banner));
    ck(`${label}｜隊徽環色來自該框`, look.ring === "#fbbf24", String(look.ring));

    //  ⑥ reload 後仍在
    //  ⚠ 這裡不能用固定 sleep：連續兩次導覽時，第二次可能在 dev server 還在
    //    轉譯模組時就被量到，量到的是還沒掛上的空殼（三條 look 斷言會全紅，
    //    而且下一個 evaluate 會撞上模組載入失敗）。改成**輪詢等 app 真的就緒**。
    await chrome.navigate(server.url);
    await waitForApp(chrome);
    const persisted = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜reload 後主題仍生效`, persisted.accent === "#fb923c");
    ck(`${label}｜reload 後稱號仍在`, persisted.titleText === "鐵壁");
    ck(`${label}｜reload 後隊徽框仍在`, persisted.banner === "laurel");

    //  ⑦ 換外觀免費、無冷卻；換回預設
    //  ⚠ 一定要確認**真的回到資產頁**再往下量：⑧ 的 reduced-motion 量的是
    //    `.ca__card`，人不在那一頁就會量到 undefined 而不是量到問題。
    const back = await chrome.evaluate(ENTER);
    ck(`${label}｜量動效前確實回到資產頁`, String(back).includes("open"), String(back).replace(/"/g, ""));
    const swapped = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const p0 = st().retentionView().clubPoints;
      st().buyClubAsset("theme_verdant");
      const a = st().equipClubIdentity("theme_verdant");
      const b = st().equipClubIdentity("theme_ember");   // 立刻再換一次
      const c = st().equipClubIdentity(null, "titleId"); // 卸回預設
      return JSON.stringify({
        aOk: a.ok, bOk: b.ok, cOk: c.ok,
        equipped: st().clubAssets.equippedIdentity,
        lastChangeWeek: st().clubAssets.lastCoachChangeWeek,
        spentOnEquip: p0 - 700 - st().retentionView().clubPoints,
      });
    `);
    const S = J(swapped);
    ck(`${label}｜換外觀沒有冷卻（連換兩次都成功）`, S.aOk === true && S.bOk === true);
    ck(`${label}｜可以卸回預設`, S.cOk === true && S.equipped.titleId === null);
    ck(`${label}｜換外觀完全不花點數`, S.spentOnEquip === 0, `多花了 ${S.spentOnEquip}`);
    ck(`${label}｜換外觀不影響教練週鎖`, S.lastChangeWeek === null, String(S.lastChangeWeek));

    //  ⑧ 版面與動態
    const layout = J(await chrome.evaluate(`
      const de = document.documentElement;
      window.scrollTo(0, 999999);
      await new Promise(r => setTimeout(r, 300));
      const reached = Math.abs((window.scrollY + de.clientHeight) - de.scrollHeight) <= 3;
      const tall = de.scrollHeight > de.clientHeight + 4;
      window.scrollTo(0, 0);
      return JSON.stringify({ overflowX: de.scrollWidth - de.clientWidth, tall, reached, docH: de.scrollHeight });
    `));
    ck(`${label}｜無頁面級橫向捲動`, layout.overflowX <= 1, `overflow=${layout.overflowX}`);
    ck(`${label}｜內容超過一頁時捲得到最底`, !layout.tall || layout.reached === true, `docH=${layout.docH}`);

    await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await sleep(400);
    const rm = J(await chrome.evaluate(`
      const card = document.querySelector(".ca__card");
      if (!card) return JSON.stringify({ found: false });
      const c = getComputedStyle(card);
      return JSON.stringify({ found: true, anim: c.animationName, opacity: Number(c.opacity) });
    `));
    ck(`${label}｜reduced-motion 下動畫全停`, rm.found && rm.anim === "none", String(rm.anim));
    ck(`${label}｜reduced-motion 下內容仍是完成狀態`, rm.found && rm.opacity === 1, String(rm.opacity));
    await chrome.send("Emulation.setEmulatedMedia", { features: [] });
  }
} catch (e) {
  ck("harness", false, String(e?.message ?? e));
} finally {
  try { await chrome?.close?.(); } catch { /* 收尾失敗不影響判定 */ }
  try { await server?.close?.(); } catch { /* 同上 */ }
}

console.log(`\n俱樂部識別 UI：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
