#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_team_development_uiux.mjs — TD-56 UI/UX Owner Review 量測
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_review_team_development_uiux.mjs --timeout 900000`
//
//  ⚠ 這**不是** gate，是一份量測報告器：它照
//    `docs/design/ESMO_UIUX設計原則.md` 的判準量出數字與截圖，供 Owner Review。
//    判準無法完全機器化的部分（「像不像遊戲」）只輸出證據，不下判定。
//
//  量什麼：
//    ① 文字密度      每張卡的字數、行數、整頁字數
//    ② 資訊層級      實際 render 出來的字級排序（誰最突出）
//    ③ 下一個發展點  是否存在、字級、位置
//    ④ locked reason 鎖住的節點說不說得出「為什麼」與「怎麼解鎖」
//    ⑤ 工程術語      玩家可見文字掃描
//    ⑥ 版面          390px 溢出、觸控目標
//    ⑦ 截圖          桌機 / 390px，存到 review/td56-uiux/
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
//  ⚠ 輸出目錄可覆寫。預設仍是 TD-56 的證據目錄（不動既有呼叫端），但後續
//    Sprint 跑這支時**必須**指定自己的目錄——否則會直接覆寫掉前一輪已經隨
//    release 交付出去的截圖與量測，把 baseline 洗掉（本輪實際踩到）。
//    例：`ESMO_REVIEW_OUT=review/tdx-expansion node tools/browser/run-gate.mjs …`
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/td56-uiux");
mkdirSync(SHOT_DIR, { recursive: true });

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const report = [];
const note = (line) => { report.push(line); console.log(line); };

/** 情境 A：全新存檔（1 點 Onboarding 點，什麼都還沒投入）。 */
const seedFresh = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  st().save();
  return "fresh";
`;

/**
 * 情境 B：**點數用完，但前置已完成** —— 最容易產生誤解的狀態。
 * ⚠ 每個情境都自成一個 evaluate（開新局＋覆寫一次做完），
 *   分成兩次呼叫會讓第二次踩到 startNewGame 還沒收斂的狀態。
 */
const seedBroke = `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  const { sanitizeTeamDevelopment } = await import(B + "/src/platform/development/teamDevelopment.js");
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 260));
  store.setState({ teamDevelopment: sanitizeTeamDevelopment({
    availablePoints: 0, ranks: { general_training_flow: 1 }, grants: { seed: 1 },
  }) });
  store.getState().save();
  return "broke";
`;

/** 情境 C：中期玩家（有點數、有已投入的路線）。 */
const seedMid = `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  const { sanitizeTeamDevelopment } = await import(B + "/src/platform/development/teamDevelopment.js");
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 260));
  store.setState({
    clubProgression: { schema: "ClubProgression.v1", xp: 9000 },
    meta: { ...store.getState().meta, days: 84 * 2 + 5 },
    teamDevelopment: sanitizeTeamDevelopment({
      availablePoints: 5,
      ranks: { general_training_flow: 2, general_data_analysis: 1, management_scout_network: 1 },
      grants: { seed: 1, "level:4": 1, "level:6": 1, "level:8": 1, "season:1": 2, "season:2": 2 },
    }),
  });
  store.getState().save();
  return "mid";
`;

/**
 * ⚠ 入口有三條路，缺一條就會把「產品沒有入口」誤判成「腳本沒找到」：
 *   ① 首頁待辦卡（**只有 availablePoints > 0 才存在**）
 *   ② 桌機管理工具磚（目前**沒有**戰隊發展 —— 見 Review 發現 ①）
 *   ③ 手機底部「戰隊」分頁（常駐）
 * 回傳值會說明是走哪一條到達的，讓報告分得出「有入口」與「入口只在某些狀態下存在」。
 */
const ENTER = `
  const direct = () => document.querySelector('[data-testid="home-utility-development"]')
    || document.querySelector('[data-testid="home-sheet-development"]')
    || [...document.querySelectorAll("button,[role=button]")].find((x) => (x.innerText || "").includes("戰隊發展"));
  const opened = () => (document.body.innerText || "").includes("可用發展點");
  let b = direct();
  if (b) { b.click(); await new Promise((r) => setTimeout(r, 900)); if (opened()) return "open:direct"; }
  for (const name of ["戰隊", "更多"]) {
    const tab = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === name);
    if (!tab) continue;
    tab.click();
    await new Promise((r) => setTimeout(r, 650));
    b = direct();
    if (!b) continue;
    b.click();
    await new Promise((r) => setTimeout(r, 900));
    if (opened()) return "open:" + name;
  }
  return "no-entry";
`;

/** 量測：字級排序、文字密度、locked 說明、溢出、觸控目標。 */
const MEASURE = `
  const root = document.querySelector('[data-development-card]')?.closest("div[style]")?.parentElement || document.body;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  //  ── 字級排序：只看「自己就有文字」的節點（不含容器）
  const leaves = [...document.body.querySelectorAll("*")].filter((el) => {
    if (!vis(el)) return false;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    return own.length > 0;
  });
  const sized = leaves.map((el) => {
    const s = getComputedStyle(el);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ");
    return { text: own.slice(0, 28), size: Math.round(parseFloat(s.fontSize) * 10) / 10, weight: Number(s.fontWeight) || 400 };
  }).sort((a, b) => b.size - a.size || b.weight - a.weight);

  //  ── 每張節點卡的文字量
  const cards = [...document.querySelectorAll("[data-development-card]")].map((el) => {
    const t = (el.innerText || "").trim();
    return {
      id: el.getAttribute("data-development-node-id"),
      chars: t.replace(/\\s/g, "").length,
      lines: t.split("\\n").filter((x) => x.trim()).length,
      height: Math.round(el.getBoundingClientRect().height),
      text: t,
    };
  });

  //  ── 鎖住的節點說了什麼
  const lockedCards = cards.filter((c) => c.text.includes("待解鎖"));

  //  ── 觸控目標
  const targets = [...document.querySelectorAll("button")].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: (el.innerText || "").trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) };
  });
  //  ── 主要 CTA（投入發展點）單獨量：它是這一頁唯一的主要行動
  const ctas = [...document.querySelectorAll("[data-development-cta]")].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { text: (el.innerText || "").trim(), w: Math.round(r.width), h: Math.round(r.height) };
  });
  //  ── 狀態自相矛盾偵測：同一張卡不可以同時說「不能投入」與「可以生效」
  const CONTRADICTIONS = [["待解鎖", "目前可生效"], ["點數不足", "目前可生效"], ["規劃中", "目前可生效"]];
  const contradictory = cards.filter((c) => CONTRADICTIONS.some(([a, b]) => c.text.includes(a) && c.text.includes(b)))
    .map((c) => c.id);
  //  ── 每張「不能投入」的卡有沒有說原因
  const blockedCards = cards.filter((c) => c.text.includes("待解鎖") || c.text.includes("點數不足")).map((c) => ({
    id: c.id,
    badge: c.text.includes("點數不足") ? "點數不足" : "待解鎖",
    reason: (document.querySelector('[data-development-blocked-reason="' + c.id + '"]')?.innerText || "").trim() || null,
  }));

  const body = document.body.innerText || "";
  const JARGON = ["ledger","reconcile","canonical","authority","derived","writer","settlement",
    "persistence","schema","consumer","reducer","grant","CBR","migration","idempotent","contract"];
  return JSON.stringify({
    topSizes: sized.slice(0, 12),
    availablePoints: (() => {
      const lab = leaves.find((el) => (el.textContent || "").trim() === "可用發展點");
      const val = lab?.parentElement?.querySelector("div:last-child");
      const s = val ? getComputedStyle(val) : null;
      return s ? { text: val.innerText.trim(), size: Math.round(parseFloat(s.fontSize) * 10) / 10, weight: Number(s.fontWeight) } : null;
    })(),
    cards,
    lockedCards: lockedCards.map((c) => ({ id: c.id, text: c.text })),
    totalChars: body.replace(/\\s/g, "").length,
    totalLines: body.split("\\n").filter((x) => x.trim()).length,
    jargonHits: JARGON.filter((w) => new RegExp(w, "i").test(body)),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    smallTargets: targets.filter((t) => t.h < 32 || t.w < 32),
    targetCount: targets.length,
    ctas,
    contradictory,
    blockedCards,
    detailOpen: document.querySelector('[data-testid="development-point-detail"]') !== null,
    hasNextHint: body.includes("下一個發展點"),
  });
`;

const shoot = async (chrome, name) => {
  const data = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  if (data?.data) {
    writeFileSync(resolve(SHOT_DIR, name), Buffer.from(data.data, "base64"));
    note(`   📸 review/td56-uiux/${name}`);
  }
};

const result = await runGate({
  name: "TD-56 UI/UX Owner Review 量測",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, slug, width, height, mobile] of [
      ["桌機 1366px", "desktop", 1366, 900, false],
      ["手機 390px", "mobile", 390, 844, true],
    ]) {
      note(`\n════ ${label} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      for (const [scenario, seed] of [["fresh", seedFresh], ["broke", seedBroke], ["mid", seedMid]]) {
        await chrome.navigate(url);
        await sleep(900);
        await chrome.evaluate(seed);
        await chrome.navigate(url);
        await sleep(1600);
        const entered = String(await chrome.evaluate(ENTER)).replace(/"/g, "");
        ck(`${label}/${scenario}｜進得了戰隊發展`, entered.startsWith("open"), `路徑=${entered}`);
        if (!entered.startsWith("open")) continue;
        note(`   入口路徑：${entered}`);
        const m = J(await chrome.evaluate(MEASURE));
        note(`\n── ${label} · 情境 ${scenario} ──`);
        note(`   整頁字數 ${m.totalChars}　可見行數 ${m.totalLines}`);
        if (m.availablePoints) {
          const bigger = m.topSizes.filter((t) => t.size > m.availablePoints.size);
          note(`   可用發展點「${m.availablePoints.text}」= ${m.availablePoints.size}px / w${m.availablePoints.weight}`);
          note(`   比它大的文字（${bigger.length} 個）：${bigger.map((t) => `"${t.text}"(${t.size}px)`).join("  ") || "無"}`);
          //  ⏸ Owner Review 發現 ③（hierarchy redesign）**本輪明確裁示不做**。
          //    數字繼續量、繼續印，但不列入 pass/fail —— gate 要反映「這一輪該做的事」，
          //    同時不讓這個已知落差從報告裡消失。要做的時候把 note 換回 ck 即可。
          note(`   ⏸ DEFERRED ③ 可用發展點不是最大的數字：${bigger.map((t) => `${t.text}=${t.size}px`).join(", ") || "已是最大"}`);
        }
        note(`   字級前 6：${m.topSizes.slice(0, 6).map((t) => `"${t.text}"${t.size}px`).join("  ")}`);
        const worst = [...m.cards].sort((a, b) => b.lines - a.lines)[0];
        note(`   節點卡：${m.cards.length} 張　字數 ${m.cards.map((c) => c.chars).join("/")}　最長 ${worst?.lines ?? 0} 行（${worst?.id ?? "-"}）`);
        note(`   節點卡高度：${m.cards.map((c) => c.height).join("/")}px`);
        //  Owner Review ④ 在 Expansion v1 **正式進入 scope**（不再 DEFERRED）。
        //  ⚠ 判準不是「追到某個絕對數字」，而是「加了 6 個節點之後，第一眼的
        //    資訊負擔沒有比 TD-56 baseline 更糟」。baseline 實測最長 11–13 行。
        const TD56_BASELINE_MAX_LINES = 13;
        ck(`${label}/${scenario}｜節點卡第一眼資訊沒有比 TD-56 baseline 惡化`,
          (worst?.lines ?? 0) <= TD56_BASELINE_MAX_LINES,
          `最長 ${worst?.lines ?? 0} 行（baseline ${TD56_BASELINE_MAX_LINES}）`);
        note(`   NODE_CARD_VISIBLE_TEXT_LINES = ${m.cards.map((c) => c.lines).join("/")}（最長 ${worst?.lines ?? 0}）`);
        ck(`${label}/${scenario}｜「下一個發展點」看得到`, m.hasNextHint === true);
        ck(`${label}/${scenario}｜完整規則預設收合`, m.detailOpen === false);
        ck(`${label}/${scenario}｜玩家端沒有工程術語`, m.jargonHits.length === 0, m.jargonHits.join(", "));
        ck(`${label}/${scenario}｜不水平溢出`, m.overflow === false, `${m.scrollWidth}/${m.innerWidth}`);
        if (mobile) {
          ck(`${label}/${scenario}｜觸控目標都 ≥32px`, m.smallTargets.length === 0,
            m.smallTargets.map((t) => `${t.label}(${t.w}×${t.h})`).join(" ") || `${m.targetCount} 個都合格`);
        }
        //  ── Owner Review 追加證明 ────────────────────────────────────────
        ck(`${label}/${scenario}｜沒有自相矛盾的狀態文字`, m.contradictory.length === 0,
          m.contradictory.join(", ") || "無");
        if (m.blockedCards.length) {
          note(`   不能投入的卡 ${m.blockedCards.length} 張：${m.blockedCards.map((b) => `${b.id}[${b.badge}] → ${JSON.stringify(b.reason)}`).join("  ")}`);
          ck(`${label}/${scenario}｜每張不能投入的卡都說得出原因`,
            m.blockedCards.every((b) => b.reason && b.reason.length > 0),
            m.blockedCards.filter((b) => !b.reason).map((b) => b.id).join(", ") || "");
          ck(`${label}/${scenario}｜原因與徽章一致（前置 vs 點數不足）`,
            m.blockedCards.every((b) => b.badge === "點數不足"
              ? /發展點/.test(b.reason ?? "")
              : /需先完成/.test(b.reason ?? "")),
            m.blockedCards.map((b) => `${b.badge}:${b.reason}`).join(" | "));
        }
        if (mobile && m.ctas.length) {
          note(`   主要 CTA：${m.ctas.map((c) => `${c.text} ${c.w}×${c.h}`).join("  ")}`);
          ck(`${label}/${scenario}｜主要 CTA 觸控目標 ≥44×44`,
            m.ctas.every((c) => c.h >= 44 && c.w >= 44),
            m.ctas.map((c) => `${c.w}×${c.h}`).join(" "));
        }

        //  ⚠ 這裡只印逐字內容備查。「說不說得出原因」由上面那兩條**嚴格**斷言負責
        //    （逐卡比對 badge 與 reason）；不要再放一條靠關鍵字猜的粗篩——
        //    文案一改它就會過時，而且會蓋掉嚴格斷言的訊號。
        if (m.lockedCards.length) {
          note(`   鎖住的節點 ${m.lockedCards.length} 個（逐字）：`);
          //  ⚠ 用 fromCharCode(10) 拆行，不寫跳脫字元——這一行被腳本改寫過好幾次，
          //    每次跳脫都可能被工具吃掉一層，結果是一個跨行的壞正則。
          const oneLine = (t) => t.split(String.fromCharCode(10)).join(" / ");
          for (const c of m.lockedCards) note(`     · ${c.id} → ${JSON.stringify(oneLine(c.text).slice(0, 160))}`);
        }
        const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
        const pageErrs = chrome.pageErrors ?? [];
        ck(`${label}/${scenario}｜console / page 錯誤 = 0`,
          errs.length === 0 && pageErrs.length === 0,
          [...errs, ...pageErrs].slice(0, 3).join(" ¦ ") || "clean");
        await shoot(chrome, `${slug}-${scenario}.png`);
      }
    }
  },
});

writeFileSync(resolve(SHOT_DIR, "measurements.txt"), report.join("\n"), "utf8");
console.log(`\n量測明細：review/td56-uiux/measurements.txt`);
finishGate(result);
