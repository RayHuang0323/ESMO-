#!/usr/bin/env node
// ============================================================================
//  tools/playtest_core_loop.mjs — 核心遊戲循環 Product Playtest（觀察用）
//
//  執行：`node tools/playtest_core_loop.mjs`（加 `--headed` 看畫面）
//
//  ⚠ **這不是 gate**。它不判對錯、不 exit 1，只把「一個新玩家從開檔到打完
//    兩場、推完時間、領完目標」沿路**真的看到什麼**倒出來：畫面上有哪些
//    可按的東西、數字怎麼變、每一步花多久。產品判斷由人做，本檔只負責取證。
//
//  ⚠ 正式站只能走 UI ＋ localStorage（TD-31）。除了「清檔」與「讀存檔看數字」
//    之外，一律點畫面——這樣量到的才是玩家真的走得到的路。
//
//  路線：Home → 今日目標 → 招募/球探 → 訓練 → 快速練習 → 一般對戰
//        → 成長/名單 → 推進世界時間 → 正式季賽 → 回首頁 → 領取目標 → CS 對照
// ============================================================================
import { launchChrome } from "./browser/cdp.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const CDP_PORT = 9397;
const HEADLESS = !process.argv.includes("--headed");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T0 = Date.now();
const clock = () => {
  const s = Math.round((Date.now() - T0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const step = (n) => console.log(`\n${"─".repeat(66)}\n[${clock()}] ${n}\n${"─".repeat(66)}`);
const note = (k, v) => console.log(`  · ${k}${v === undefined ? "" : "：" + v}`);

//  畫面上「玩家看得到、按得到」的東西。刻意連沒有 testid 的按鈕也收，
//  因為玩家不在乎有沒有 testid，他只看得到文字。
const SNAP = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const txt = (el) => (el?.textContent || "").trim().replace(/\\s+/g, " ");
  const btns = Array.from(document.querySelectorAll('button,[role="button"],a'))
    .filter((b) => !b.disabled && b.offsetParent !== null)
    .map((b) => ({ id: b.dataset?.testid ?? null, t: txt(b).slice(0, 26) }))
    .filter((b) => b.t.length > 0);
  const seen = new Set(); const uniq = [];
  for (const b of btns) { const k = (b.id ?? "") + "|" + b.t; if (!seen.has(k)) { seen.add(k); uniq.push(b); } }
  return {
    white: document.body.innerText.trim().length < 40,
    len: document.body.innerText.trim().length,
    head: document.body.innerText.trim().replace(/\\s+/g, " ").slice(0, 190),
    buttons: uniq.slice(0, 26),
    worldTime: txt(q("home-world-time")).slice(0, 70) || null,
    nextStop: txt(q("home-next-stop")).slice(0, 60) || null,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
`;

const SAVE = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return { exists: false };
  const s = JSON.parse(raw);
  return {
    exists: true,
    day: s.meta?.days ?? null, fans: s.meta?.fans ?? null,
    funds: s.finance?.funds ?? null,
    block: s.meta?.competitiveBlock ?? null,
    clubPoints: s.retention?.clubPoints ?? null,
    counters: s.retention?.counters ?? null,
    claims: s.retention?.claims ?? null,
    lv: (s.players ?? []).map((p) => p.id + ":Lv" + p.lv).join(" "),
    xp: (s.players ?? []).map((p) => p.xp).join("/"),
    energy: (s.players ?? []).map((p) => p.energy).join("/"),
    training: (s.players ?? []).map((p) => p.training?.course ?? "-").join("/"),
    scouted: (s.scouted ?? []).length,
  };
`;

const GATE_RE = String.raw`/Ban\/Pick|開始載入|開始比賽|開始對戰|進入對戰|開打|確認出戰/`;

const WHERE = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const act = q("prep-primary-action");
  const byText = (re) => Array.from(document.querySelectorAll("button"))
    .filter((b) => !b.disabled).find((b) => re.test((b.textContent || "").trim()));
  return {
    result: !!q("battle-result-continue"),
    speed: !!q("quick-finish-match"),
    heroChoose: document.querySelectorAll('[data-testid="hero-choose"]').length,
    confirmDraft: !!q("confirm-draft") && !q("confirm-draft").disabled,
    prepAction: act ? { key: act.dataset.action, disabled: act.disabled } : null,
    gateBtn: byText(${GATE_RE}) ? byText(${GATE_RE}).textContent.trim().slice(0, 18) : null,
    len: document.body.innerText.trim().length,
  };
`;

const READ_PREP = `
  const q = (s) => document.querySelector('[data-testid="' + s + '"]');
  const a = q("prep-primary-action");
  return {
    tier: q("prep-tier-banner")?.getAttribute("data-tier") ?? null,
    name: q("prep-tier-name")?.textContent?.trim() ?? null,
    capacity: q("prep-tier-capacity")?.textContent?.trim() ?? null,
    note: q("prep-tier-note")?.textContent?.trim() ?? null,
    practiceBtn: !!q("prep-start-practice"),
    action: a ? a.dataset.action + "／" + a.textContent.trim().replace(/\\s+/g, " ").slice(0, 20) : null,
  };
`;

/** 從賽前頁一路點到結算完成。回傳走過的骨架與耗時。 */
async function playMatch(chrome, { practice = false, budget = 320 } = {}) {
  const t = Date.now();
  const trail = [];
  if (practice) {
    await chrome.evaluate(`document.querySelector('[data-testid="prep-start-practice"]')?.click(); return 1;`);
    await sleep(1500);
  }
  let idle = 0;
  for (let i = 0; i < budget; i++) {
    const w = await chrome.evaluate(WHERE);
    if (w.result) { trail.push("result"); break; }
    if (w.speed) {
      trail.push("battle");
      await chrome.evaluate(`window.confirm = () => true; document.querySelector('[data-testid="quick-finish-match"]')?.click(); return 1;`);
      await sleep(3000); idle = 0; continue;
    }
    if (w.confirmDraft) {
      trail.push("confirmDraft");
      await chrome.evaluate(`document.querySelector('[data-testid="confirm-draft"]')?.click(); return 1;`);
      await sleep(2500); idle = 0; continue;
    }
    if (w.heroChoose > 0) {
      trail.push("draft");
      await chrome.evaluate(`const b=[...document.querySelectorAll('[data-testid="hero-choose"]')].find(x=>!x.disabled); b?.click(); return 1;`);
      await sleep(650); idle = 0; continue;
    }
    if (w.gateBtn) {
      trail.push("btn:" + w.gateBtn);
      await chrome.evaluate(`
        const re = ${GATE_RE};
        const b = [...document.querySelectorAll("button")].filter(x=>!x.disabled).find(x=>re.test((x.textContent||"").trim()));
        b?.click(); return 1;
      `);
      await sleep(2200); idle = 0; continue;
    }
    if (w.prepAction) {
      trail.push("prep:" + w.prepAction.key);
      if (!w.prepAction.disabled) {
        await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click(); return 1;`);
        idle = 0;
      } else idle++;
      await sleep(1200); continue;
    }
    if (++idle > 130) { trail.push("STUCK"); break; }
    await sleep(700);
  }
  //  結算畫面：玩家在這裡看到什麼？（有沒有明確的下一步）
  const resultScreen = await chrome.evaluate(`
    const txt = (el) => (el?.textContent || "").trim().replace(/\\s+/g, " ");
    return {
      text: document.body.innerText.trim().replace(/\\s+/g, " ").slice(0, 400),
      buttons: Array.from(document.querySelectorAll("button")).filter((b) => !b.disabled && b.offsetParent !== null)
        .map((b) => txt(b).slice(0, 22)).filter(Boolean).slice(0, 12),
    };
  `);
  await chrome.evaluate(`
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-testid="battle-result-continue"]')?.click(); await w(3000); return 1;
  `);
  const skel = trail.filter((x, i) => i === 0 || x !== trail[i - 1]).join(" → ");
  return { trail: skel, sec: Math.round((Date.now() - t) / 1000), resultScreen };
}

const home = async (chrome) => { await chrome.navigate(PROD); await sleep(2600); };
const clickText = (re, wait = 2200) => `
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const b = [...document.querySelectorAll('button,[role="button"],a')]
    .filter((x) => !x.disabled && x.offsetParent !== null)
    .find((x) => ${re}.test((x.textContent || "").trim()));
  const label = b ? (b.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24) : null;
  b?.click(); await w(${wait});
  return label;
`;
const clickId = (id, wait = 2200) => `
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const b = document.querySelector('[data-testid="${id}"]');
  b?.click(); await w(${wait});
  return !!b;
`;

async function main() {
  console.log(`══ ESMO 核心循環 Playtest ══\n${PROD}\n開始：${new Date().toISOString()}`);
  const chrome = await launchChrome({ url: PROD, port: CDP_PORT, headless: HEADLESS });
  const log = (o) => console.log(JSON.stringify(o));
  try {
    await sleep(2500);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(PROD);
    await sleep(3000);

    // ══ 1. 開新檔，第一眼 ═══════════════════════════════════════════════
    step("1) 全新存檔，第一次打開遊戲——我知道要做什麼嗎？");
    await chrome.evaluate(`try { localStorage.removeItem("esmo.profile.v1"); } catch (e) {} return 1;`);
    await home(chrome);
    const first = await chrome.evaluate(SNAP);
    note("白屏", first.white);
    note("世界時間", first.worldTime);
    note("下一站", first.nextStop);
    note("首頁文字量", first.len + " 字");
    note("第一屏文字", first.head);
    console.log("  · 可按的東西：");
    first.buttons.forEach((b) => console.log(`      ${b.id ? "#" + b.id : "（無 id）"}　${b.t}`));

    // ══ 2. 今日目標 ═════════════════════════════════════════════════════
    step("2) 今日目標——它像引導還是作業？");
    const objOpen = await chrome.evaluate(clickId("home-utility-objectives", 1800));
    if (!objOpen) await chrome.evaluate(clickText("/俱樂部目標|目標/", 1800));
    const obj = await chrome.evaluate(`
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      const cards = (g) => Array.from(document.querySelectorAll('[data-testid="objective-group-' + g + '"] [data-testid="objective-card"]'))
        .map((c) => (c.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60));
      return {
        screen: !!q("objectives-screen"),
        points: q("club-points")?.textContent?.trim() ?? null,
        tier: q("club-tier")?.textContent?.trim() ?? null,
        daily: cards("daily"), weekly: cards("weekly"), season: cards("season"),
        claimable: Array.from(document.querySelectorAll('[data-testid^="objective-claim-"]')).filter((b) => !b.disabled).length,
        //  Club Points 有沒有出口？畫面上找得到「兌換／商店／可用於」之類的字嗎
        spendHint: /兌換|商店|消費|可用於|花費|解鎖/.test(document.body.innerText) ? "有字樣" : "找不到任何出口字樣",
        pointsExplain: (document.body.innerText.match(/俱樂部點數[^\\n]{0,60}/) ?? [null])[0],
      };
    `);
    note("進得去", obj.screen);
    note("點數／等級", `${obj.points}｜${obj.tier}`);
    note("可領", obj.claimable);
    console.log("  · 日目標："); obj.daily.forEach((c) => console.log("      " + c));
    console.log("  · 週目標："); obj.weekly.forEach((c) => console.log("      " + c));
    console.log("  · 季目標："); obj.season.forEach((c) => console.log("      " + c));
    note("Club Points 出口", obj.spendHint);
    note("點數說明文字", obj.pointsExplain);

    // ══ 3. 招募 / 球探 ═══════════════════════════════════════════════════
    step("3) 招募 / 球探——看得到人，簽得下去嗎？");
    await home(chrome);
    let recruitLabel = await chrome.evaluate(clickText("/招募|球探|選秀/", 2400));
    if (!recruitLabel) {
      await chrome.evaluate(clickText("/經營|團隊|管理/", 1800));
      recruitLabel = await chrome.evaluate(clickText("/招募|球探|選秀/", 2400));
    }
    const recruit = await chrome.evaluate(SNAP);
    note("入口按鈕", recruitLabel ?? "（首頁找不到招募/球探字樣）");
    note("白屏", recruit.white);
    note("畫面", recruit.head);
    console.log("  · 可按的東西：");
    recruit.buttons.forEach((b) => console.log(`      ${b.id ? "#" + b.id : "（無 id）"}　${b.t}`));

    // ══ 4. 訓練 ═════════════════════════════════════════════════════════
    step("4) 訓練——安排一次，看得到回饋嗎？");
    await home(chrome);
    const trainLabel = await chrome.evaluate(clickText("/訓練/", 2400));
    const trainBefore = await chrome.evaluate(SAVE);
    const train = await chrome.evaluate(SNAP);
    note("入口按鈕", trainLabel ?? "（首頁找不到訓練字樣）");
    note("畫面", train.head);
    console.log("  · 可按的東西：");
    train.buttons.forEach((b) => console.log(`      ${b.id ? "#" + b.id : "（無 id）"}　${b.t}`));
    //  真的按一個課程下去
    const assigned = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const before = document.body.innerText.trim().length;
      const b = [...document.querySelectorAll("button")].filter((x) => !x.disabled && x.offsetParent !== null)
        .find((x) => /安排|指派|開始訓練|選擇課程|訓練/.test((x.textContent || "").trim()));
      const label = b ? (b.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24) : null;
      b?.click(); await w(1800);
      return { label, changed: document.body.innerText.trim().length !== before,
               after: document.body.innerText.trim().replace(/\\s+/g, " ").slice(0, 200) };
    `);
    note("按下的按鈕", assigned.label);
    note("畫面有變", assigned.changed);
    note("按完之後", assigned.after);
    const trainAfter = await chrome.evaluate(SAVE);
    note("存檔 training 欄位", `${trainBefore.training} → ${trainAfter.training}`);
    note("存檔 energy", `${trainBefore.energy} → ${trainAfter.energy}`);

    // ══ 5. 快速練習 ═════════════════════════════════════════════════════
    step("5) 快速練習——我看得懂它跟正式比賽的差別嗎？");
    await home(chrome);
    await chrome.evaluate(clickId("home-mode-moba", 2600));
    const prepA = await chrome.evaluate(READ_PREP);
    note("賽前頁層級", `${prepA.tier}／${prepA.name}`);
    note("容量", prepA.capacity);
    note("說明", prepA.note);
    note("主按鈕", prepA.action);
    note("有快速練習按鈕", prepA.practiceBtn);
    const m1 = await playMatch(chrome, { practice: true });
    note("練習耗時", m1.sec + " 秒");
    note("流程", m1.trail);
    note("結算畫面", m1.resultScreen.text.slice(0, 220));
    note("結算可按", m1.resultScreen.buttons.join("｜"));
    const afterPrac = await chrome.evaluate(SAVE);
    note("練習後：資金／粉絲／點數", `$${afterPrac.funds}／${afterPrac.fans}／${afterPrac.clubPoints}`);

    // ══ 6. 一般對戰 ═════════════════════════════════════════════════════
    step("6) 一般對戰——打完之後我拿到什麼、下一步是什麼？");
    await home(chrome);
    await chrome.evaluate(clickId("home-mode-moba", 2600));
    const prepB = await chrome.evaluate(READ_PREP);
    note("賽前頁層級", `${prepB.tier}／${prepB.name}｜${prepB.capacity}`);
    const before6 = await chrome.evaluate(SAVE);
    const m2 = await playMatch(chrome, { practice: false });
    note("一般對戰耗時", m2.sec + " 秒");
    note("流程", m2.trail);
    note("結算畫面", m2.resultScreen.text.slice(0, 260));
    note("結算可按", m2.resultScreen.buttons.join("｜"));
    const after6 = await chrome.evaluate(SAVE);
    note("資金", `$${before6.funds} → $${after6.funds}`);
    note("粉絲", `${before6.fans} → ${after6.fans}`);
    note("等級", `${before6.lv}　→　${after6.lv}`);
    note("XP", `${before6.xp} → ${after6.xp}`);
    note("今日容量", JSON.stringify(after6.block));
    note("目標進度", JSON.stringify(after6.counters));
    //  打完之後回首頁——首頁有沒有告訴我下一步？
    await home(chrome);
    const home2 = await chrome.evaluate(SNAP);
    note("打完一場之後的首頁", home2.head);

    // ══ 7. 成長 / 名單 ═══════════════════════════════════════════════════
    step("7) 成長 / 名單——我看得到剛剛那場帶來的變化嗎？");
    const rosterLabel = await chrome.evaluate(clickText("/查看名單|名單|陣容/", 2600));
    const roster = await chrome.evaluate(`
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      const txt = (el) => (el?.textContent || "").trim().replace(/\\s+/g, " ");
      const rows = Array.from(document.querySelectorAll('[data-testid^="roster-player-"]'))
        .map((r) => txt(r).slice(0, 70));
      return {
        rows, badge: txt(q("roster-career-badge")) || null,
        head: document.body.innerText.trim().replace(/\\s+/g, " ").slice(0, 200),
      };
    `);
    note("入口按鈕", rosterLabel);
    note("名單列數", roster.rows.length);
    roster.rows.slice(0, 5).forEach((r) => console.log("      " + r));
    //  點進一名選手看成長
    const profile = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      const byText = (re) => [...document.querySelectorAll("button")].find((b) => re.test(b.textContent || ""));
      document.querySelector('[data-testid^="roster-player-"]')?.click(); await w(1400);
      const opened = !!byText(/開啟完整選手檔案/);
      byText(/開啟完整選手檔案/)?.click(); await w(2000);
      q("player-profile-tab-career")?.click(); await w(1200);
      return {
        opened, tabs: !!q("player-profile-tabs"),
        stage: q("player-career-stage")?.textContent?.trim() ?? null,
        market: q("player-market-value")?.textContent?.trim() ?? null,
        growthVisible: /成長|XP|經驗|等級/.test(document.body.innerText),
        head: document.body.innerText.trim().replace(/\\s+/g, " ").slice(0, 220),
      };
    `);
    note("進得去選手檔案", `${profile.opened}／tabs=${profile.tabs}`);
    note("生涯階段／市值", `${profile.stage}｜${profile.market}`);
    note("看得到成長字樣", profile.growthVisible);
    note("畫面", profile.head);

    // ══ 8. 推進世界時間 ═════════════════════════════════════════════════
    step("8) 推進世界時間——好用還是把流程切碎？");
    await home(chrome);
    const t8 = await chrome.evaluate(SNAP);
    note("推進前", t8.worldTime);
    const adv1 = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      const before = q("home-world-time")?.textContent ?? "";
      q("home-advance-day")?.click(); await w(1600);
      return { before: before.replace(/\\s+/g," ").slice(0,60), after: (q("home-world-time")?.textContent ?? "").replace(/\\s+/g," ").slice(0,60),
               nextStop: (q("home-next-stop")?.textContent ?? "").replace(/\\s+/g," ").slice(0,60) };
    `);
    note("推 1 天", `${adv1.before}　→　${adv1.after}`);
    const adv7 = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      q("home-advance-days")?.click(); await w(2000);
      return { after: (q("home-world-time")?.textContent ?? "").replace(/\\s+/g," ").slice(0,60),
               nextStop: (q("home-next-stop")?.textContent ?? "").replace(/\\s+/g," ").slice(0,60),
               text: document.body.innerText.trim().replace(/\\s+/g," ").slice(0,220) };
    `);
    note("推 7 天", adv7.after);
    note("下一站", adv7.nextStop);
    const advNext = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      q("home-advance-next")?.click(); await w(2600);
      return { after: (q("home-world-time")?.textContent ?? "").replace(/\\s+/g," ").slice(0,60),
               text: document.body.innerText.trim().replace(/\\s+/g," ").slice(0,260) };
    `);
    note("前往下一站", advNext.after);
    note("到站之後畫面", advNext.text);
    const after8 = await chrome.evaluate(SAVE);
    note("推完之後的容量", JSON.stringify(after8.block));
    note("推完之後的目標進度", JSON.stringify(after8.counters));

    // ══ 9. 正式季賽 ═════════════════════════════════════════════════════
    step("9) 正式生涯季賽——找得到、進得去、看得懂嗎？");
    await home(chrome);
    await chrome.evaluate(clickId("home-mode-bracket", 2800));
    const hub = await chrome.evaluate(SNAP);
    note("賽事中心白屏", hub.white);
    note("畫面", hub.head);
    console.log("  · 可按的東西：");
    hub.buttons.forEach((b) => console.log(`      ${b.id ? "#" + b.id : "（無 id）"}　${b.t}`));
    //  正式季賽的賽前頁長什麼樣（層級是不是 official）
    await home(chrome);
    await chrome.evaluate(clickId("home-mode-moba", 2600));
    const prepC = await chrome.evaluate(READ_PREP);
    note("此時 MOBA 賽前頁層級", `${prepC.tier}／${prepC.name}｜${prepC.capacity}｜${prepC.action}`);

    // ══ 10. 回首頁領目標 ════════════════════════════════════════════════
    step("10) 回首頁領取目標——有沒有「被推著往下走」的感覺？");
    await home(chrome);
    const homeBadge = await chrome.evaluate(`
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      return { badge: q("home-utility-badge-objectives")?.textContent ?? null,
               badges: document.querySelectorAll('[data-testid^="home-utility-badge-"]').length,
               text: document.body.innerText.trim().replace(/\\s+/g," ").slice(0,200) };
    `);
    note("首頁徽章", `${homeBadge.badges} 個｜可領 ${homeBadge.badge ?? 0}`);
    const claim = await chrome.evaluate(`
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const q = (s) => document.querySelector('[data-testid="' + s + '"]');
      q("home-utility-objectives")?.click(); await w(1800);
      const before = q("club-points")?.textContent?.trim() ?? null;
      let n = 0;
      for (let i = 0; i < 6; i++) {
        const b = [...document.querySelectorAll('[data-testid^="objective-claim-"]')].find((x) => !x.disabled);
        if (!b) break;
        b.click(); n++; await w(900);
      }
      return { before, n, after: q("club-points")?.textContent?.trim() ?? null,
               toast: q("objective-toast")?.textContent?.trim() ?? null,
               left: [...document.querySelectorAll('[data-testid^="objective-claim-"]')].filter((x) => !x.disabled).length,
               text: document.body.innerText.trim().replace(/\\s+/g," ").slice(0,240) };
    `);
    note("領了幾個", claim.n);
    note("點數", `${claim.before} → ${claim.after}`);
    note("回饋", claim.toast);
    note("還剩可領", claim.left);
    note("領完之後畫面", claim.text);

    // ══ 11. CS 對照 ═════════════════════════════════════════════════════
    step("11) CS 對照——一般對戰的定位一致嗎？");
    await home(chrome);
    await chrome.evaluate(clickId("home-mode-cs", 2800));
    const prepCs = await chrome.evaluate(READ_PREP);
    const csSnap = await chrome.evaluate(SNAP);
    note("CS 賽前頁層級", `${prepCs.tier}／${prepCs.name}`);
    note("CS 容量", prepCs.capacity);
    note("CS 說明", prepCs.note);
    note("CS 主按鈕", prepCs.action);
    note("CS 有快速練習", prepCs.practiceBtn);
    note("CS 白屏", csSnap.white);

    // ══ 12. 收尾 ═══════════════════════════════════════════════════════
    step("12) 一輪玩下來的最終狀態");
    const fin = await chrome.evaluate(SAVE);
    note("第幾天", fin.day);
    note("資金／粉絲", `$${fin.funds}／${fin.fans}`);
    note("俱樂部點數", fin.clubPoints);
    note("選手等級", fin.lv);
    note("今日容量", JSON.stringify(fin.block));
    note("目標計數", JSON.stringify(fin.counters));
    note("球探名單", fin.scouted);

    const errs = (chrome.pageErrors ?? []).filter((e) => !/favicon|ResizeObserver/i.test(String(e)));
    note("page-origin 未捕捉錯誤", errs.length === 0 ? "無" : errs.slice(0, 3).join(" | "));
    console.log(`\n[${clock()}] 整輪 playtest 耗時（含腳本等待）`);
  } finally {
    await chrome.close?.().catch(() => {});
  }
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
