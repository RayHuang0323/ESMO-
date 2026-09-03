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
  const bannerEl = document.querySelector('[data-testid="club-identity-banner"]');
  const skinEl = document.querySelector(".esmo-hero__skin") || document.querySelector(".esmo-mobile-header__skin");
  const auraEl = document.querySelector('[data-testid="club-identity-aura"]');
  const cs = root ? getComputedStyle(root) : null;
  //  ⚠ 皮膚與橫幅要量**實際畫出來的背景**，不是量 class 有沒有掛上。
  //    只量 class 的話，整段 CSS 被刪掉 gate 還是綠的。
  const skinBg = skinEl ? getComputedStyle(skinEl).backgroundImage : "";
  const bannerBg = bannerEl ? getComputedStyle(bannerEl).backgroundImage : "";
  const auraCs = auraEl ? getComputedStyle(auraEl) : null;
  return JSON.stringify({
    hasRoot: Boolean(root),
    themeAttr: root ? root.dataset.clubTheme : null,
    skinAttr: root ? (root.dataset.clubSkin ?? null) : null,
    accent: cs ? cs.getPropertyValue("--club-accent").trim() : null,
    ring: cs ? cs.getPropertyValue("--club-ring").trim() : null,
    crestPattern: crest ? (crest.dataset.crest ?? null) : null,
    bannerMotif: bannerEl ? (bannerEl.dataset.motif ?? null) : null,
    titleText: title ? title.textContent.trim() : null,
    titleEarned: title ? (title.dataset.earned ?? null) : null,
    skinBg: (skinBg && skinBg !== "none") ? skinBg : "",
    bannerBg: (bannerBg && bannerBg !== "none") ? bannerBg : "",
    auraAnim: auraCs ? auraCs.animationName : null,
    auraShown: Boolean(auraEl && auraCs && auraCs.display !== "none"),
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
    //  ⚠ 點數要**足夠買完整輪流程會用到的每一件**，而且要有餘裕。
    //    v1 種 4000 點剛好夠；v2 型錄變大之後同樣的 4000 會在中途用完，
    //    然後以「常青綠沒被裝上」「卡片被 `[data-affordable=0]` 調暗成 0.72」
    //    這種**看起來像視覺 bug 的樣子**紅掉——實際上是 gate 自己沒錢。
    await chrome.evaluate(seed(20000));
    await chrome.navigate(server.url);
    await sleep(1400);

    //  ① 基準：完全沒裝備時，外觀變數應該是「沒有被注入」。
    const base = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜首頁渲染得出來`, base.hasRoot === true);
    ck(`${label}｜未裝備時沒有主題標記`, base.themeAttr === "none", String(base.themeAttr));
    ck(`${label}｜未裝備時沒有皮膚`, base.skinAttr === "none", String(base.skinAttr));
    ck(`${label}｜未裝備時皮膚層不畫任何東西`, base.skinBg === "", base.skinBg.slice(0, 40));
    ck(`${label}｜未裝備時沒有大面積橫幅`, base.bannerMotif === null, String(base.bannerMotif));
    ck(`${label}｜未裝備時隊徽沒有紋樣`, base.crestPattern === null, String(base.crestPattern));
    ck(`${label}｜未裝備時沒有稱號`, base.titleText === null, String(base.titleText));
    ck(`${label}｜未裝備時隊徽光暈不顯示`, base.auraShown === false);

    //  ── ⓪ Dashboard Scroll P0：**真實滾輪**，不是量 CSS ──────────────
    //  ⚠ 這條是這一輪的 P0。之前的坑：`.esmo-dashboard` 是一個
    //    `overflow:auto` 但 scrollHeight === clientHeight 的容器，滾輪落在它
    //    身上被接走，`overscroll-behavior: contain` 又不還給 document
    //    ⇒ 桌機實測位移 0px，但每一條 CSS 單看都很合理。
    //    所以這裡**發真的 wheel 事件**再量位移。
    {
      const before = Number(await chrome.evaluate(`return String(document.scrollingElement.scrollTop);`));
      for (let i = 0; i < 8; i++) {
        await chrome.send("Input.dispatchMouseEvent", {
          type: "mouseWheel", x: Math.round(width / 2), y: Math.round(height / 2),
          deltaX: 0, deltaY: 140, pointerType: "mouse",
        });
        await sleep(90);
      }
      await sleep(450);
      const geo = J(await chrome.evaluate(`
        const de = document.documentElement;
        const dash = document.querySelector(".esmo-dashboard");
        const cs = dash ? getComputedStyle(dash) : null;
        return JSON.stringify({
          top: document.scrollingElement.scrollTop,
          scrollable: de.scrollHeight > de.clientHeight + 1,
          dashOverflowY: cs ? cs.overflowY : null,
          dashOverscroll: cs ? cs.overscrollBehaviorY : null,
        });
      `));
      ck(`${label}｜首頁內容超過一頁（有東西可以捲）`, geo.scrollable === true);
      ck(`${label}｜滑鼠滾輪真的捲得動首頁`, geo.top - before > 120, `位移 ${geo.top - before}px`);
      //  根因防呆：Dashboard 不得再自建捲動權威。
      ck(`${label}｜Dashboard 不是捲動容器`,
        geo.dashOverflowY === "visible", `overflow-y=${geo.dashOverflowY}`);
      ck(`${label}｜Dashboard 不吃捲動接力`,
        geo.dashOverscroll !== "contain" && geo.dashOverscroll !== "none", `overscroll=${geo.dashOverscroll}`);

      //  390px 要另外量**觸控**捲動：滾輪過不代表手指過（觸控走的是
      //  另一條路徑，會被 `touch-action` 與 overscroll 影響）。
      if (mobile) {
        //  ⚠ `gestureSourceType: "touch"` 需要目標頁**真的**收得到 touch 事件。
        //    只設 `setDeviceMetricsOverride({mobile:true})` 不會開啟觸控輸入，
        //    手勢會被靜默丟掉 ⇒ 量到 0px，看起來像產品捲不動，其實是 gate 沒開觸控。
        await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
        await chrome.evaluate(`window.scrollTo(0, 0); return "ok";`);
        await sleep(250);
        //  ⚠ **不要用 `Input.synthesizeScrollGesture` 搭 `gestureSourceType:"touch"`。**
        //    headless 下它會靜默回 0px（實測：同一頁 `default` 來源捲 228px、
        //    自己派 touch 事件也捲 228px，只有 `touch` 來源是 0）。
        //    那是 CDP 的限制，不是產品捲不動——照著它下結論會誤判成 390px 的 bug。
        //    改成自己派一串真實的 touchStart / touchMove / touchEnd。
        const finger = (y) => [{ x: Math.round(width / 2), y, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
        const y0 = Math.round(height * 0.72);
        await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: finger(y0) });
        for (let y = y0 - 40; y >= Math.round(height * 0.32); y -= 40) {
          await chrome.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: finger(y) });
          await sleep(16);
        }
        await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(900);
        const touchTop = Number(await chrome.evaluate(`return String(document.scrollingElement.scrollTop);`));
        ck(`${label}｜觸控也捲得動首頁`, touchTop > 100, `位移 ${touchTop}px`);

        //  底部導覽必須貼著 viewport，而且**捲到底之後**不遮住最後一段內容。
        //  ⚠ 一定要先捲到底再量。在頁面頂端量的話，最後一段本來就在視窗下方，
        //    會被誤判成「被導覽遮住」——那是量錯位置，不是產品問題。
        await chrome.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight); return "ok";`);
        await sleep(500);
        const nav = J(await chrome.evaluate(`
          const nav = document.querySelector(".esmo-mobile-nav");
          if (!nav) return JSON.stringify({ found: false });
          const r = nav.getBoundingClientRect();
          const sc = document.querySelector(".esmo-mobile-home__scroll");
          const last = sc ? sc.lastElementChild : null;
          const lr = last ? last.getBoundingClientRect() : null;
          return JSON.stringify({
            found: true, position: getComputedStyle(nav).position,
            bottom: Math.round(r.bottom), vh: window.innerHeight,
            navTop: Math.round(r.top),
            lastBottom: lr ? Math.round(lr.bottom) : null,
            covered: lr ? lr.bottom > r.top + 1 : null,
          });
        `));
        ck(`${label}｜底部導覽貼著 viewport`,
          nav.found && nav.position === "fixed" && nav.bottom <= nav.vh + 1,
          `${nav.position} bottom=${nav.bottom} vh=${nav.vh}`);
        ck(`${label}｜捲到底時底部導覽沒有遮住內容`, nav.covered === false,
          `lastBottom=${nav.lastBottom} navTop=${nav.navTop}`);
      }

      await chrome.evaluate(`window.scrollTo(0, 0); return "ok";`);
      await sleep(250);
    }

    //  ② 進資產頁，四種型別的卡片都在
    const entered = await chrome.evaluate(ENTER);
    ck(`${label}｜點得進俱樂部資產頁`, String(entered).includes("open"), String(entered).replace(/"/g, ""));
    const cards = J(await chrome.evaluate(`
      const q = (t) => document.querySelector('[data-testid="' + t + '"]');
      const champ = q("identity-card-title_champion");
      return JSON.stringify({
        theme: Boolean(q("identity-card-theme_ember")),
        title: Boolean(q("identity-card-title_ironclad")),
        crest: Boolean(q("identity-card-crest_laurel")),
        banner: Boolean(q("identity-card-banner_halo")),
        buyEnabled: Boolean(q("identity-buy-theme_ember") && !q("identity-buy-theme_ember").disabled),
        //  ⚠ 實績稱號**不得有購買鍵**（不是「有但按不下去」）。
        earnedCardShown: Boolean(champ),
        earnedHasBuyButton: Boolean(q("identity-buy-title_champion")),
        earnedLockShown: Boolean(q("identity-locked-title_champion")),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    `));
    ck(`${label}｜四種型別的外觀卡都在`, cards.theme && cards.title && cards.crest && cards.banner,
      JSON.stringify(cards));
    ck(`${label}｜「取得」可按`, cards.buyEnabled === true);
    ck(`${label}｜實績稱號有列出來`, cards.earnedCardShown === true);
    ck(`${label}｜實績稱號沒有購買鍵`, cards.earnedHasBuyButton === false);
    ck(`${label}｜實績稱號標成「打出來的」`, cards.earnedLockShown === true);
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

    //  ④ 再買稱號、隊徽框與大面積橫幅
    await chrome.evaluate(`
      const click = async (t) => {
        const b = document.querySelector('[data-testid="' + t + '"]');
        if (b) { b.click(); await new Promise(r => setTimeout(r, 800)); }
      };
      await click("identity-buy-title_ironclad");
      await click("identity-buy-crest_laurel");
      await click("identity-buy-banner_halo");
      return "ok";
    `);
    const four = J(await chrome.evaluate(SAVE));
    ck(`${label}｜四件外觀都進收藏`,
      ["theme_ember", "title_ironclad", "crest_laurel", "banner_halo"].every((id) => four.owned.includes(id)),
      four.owned.join(","));
    ck(`${label}｜四個槽各自裝上`,
      four.equipped?.themeId === "theme_ember" && four.equipped?.titleId === "title_ironclad"
      && four.equipped?.crestFrameId === "crest_laurel" && four.equipped?.bannerId === "banner_halo",
      JSON.stringify(four.equipped));

    //  ⑤ **外觀真的改變首頁**——這是這支 gate 的重點
    await chrome.navigate(server.url);
    await sleep(1500);
    const look = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜主題色真的套用到首頁`, look.accent === "#fb923c", `--club-accent=${look.accent}`);
    ck(`${label}｜主題標記寫在 DOM 上`, look.themeAttr === "theme_ember", String(look.themeAttr));
    ck(`${label}｜皮膚標記寫在 DOM 上`, look.skinAttr === "ember", String(look.skinAttr));
    //  ⚠ 重點：皮膚**真的畫出東西**，不是只掛了一個屬性。
    ck(`${label}｜皮膚層真的畫出背景`, look.skinBg.length > 20, `len=${look.skinBg.length}`);
    ck(`${label}｜稱號真的出現在戰隊名稱旁`, look.titleText === "鐵壁", String(look.titleText));
    ck(`${label}｜買來的稱號不標成實績`, look.titleEarned === "0", String(look.titleEarned));
    ck(`${label}｜隊徽框真的套用`, look.crestPattern === "laurel", String(look.crestPattern));
    ck(`${label}｜隊徽環色來自該框`, look.ring === "#fbbf24", String(look.ring));
    //  ⚠ 大面積橫幅是 v2 的語意修正：它必須是自己一層、真的有背景，
    //    而不是隊徽的邊框（那正是 v1 被退回的原因）。
    ck(`${label}｜大面積橫幅有自己的圖層`, look.bannerMotif === "halo", String(look.bannerMotif));
    ck(`${label}｜橫幅真的畫出大面積背景`, look.bannerBg.length > 20, `len=${look.bannerBg.length}`);

    //  ⑥ reload 後仍在
    //  ⚠ 這裡不能用固定 sleep：連續兩次導覽時，第二次可能在 dev server 還在
    //    轉譯模組時就被量到，量到的是還沒掛上的空殼（三條 look 斷言會全紅，
    //    而且下一個 evaluate 會撞上模組載入失敗）。改成**輪詢等 app 真的就緒**。
    await chrome.navigate(server.url);
    await waitForApp(chrome);
    const persisted = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜reload 後主題仍生效`, persisted.accent === "#fb923c");
    ck(`${label}｜reload 後稱號仍在`, persisted.titleText === "鐵壁");
    ck(`${label}｜reload 後隊徽框仍在`, persisted.crestPattern === "laurel");
    ck(`${label}｜reload 後大面積橫幅仍在`, persisted.bannerMotif === "halo");

    //  ⑥-b 三套皮膚**視覺上真的不同**——這是 Owner Review 退回 v1 的那一條。
    //  ⚠ 比的是三個實際算出來的 `background-image` 字串。只比 accent 的話，
    //    「只換兩個顏色」也會通過——那正是被退回的做法。
    {
      const shots = {};
      for (const skin of ["theme_midnight", "theme_ember", "theme_verdant"]) {
        await chrome.evaluate(`
          ${RESOLVE_APP_MODULES}
          const st = () => profile.useProfileStore.getState();
          st().buyClubAsset("${skin}");
          st().equipClubIdentity("${skin}");
          return "ok";
        `);
        await sleep(500);
        const L = J(await chrome.evaluate(HOME_LOOK));
        shots[skin] = L;
      }
      const bgs = Object.values(shots).map((s) => s.skinBg);
      ck(`${label}｜三套皮膚都真的畫得出東西`, bgs.every((b) => b.length > 20));
      ck(`${label}｜三套皮膚的背景彼此不同`, new Set(bgs).size === 3,
        `unique=${new Set(bgs).size}`);
      //  常青綠刻意沒有常駐動態；午夜藍與餘燼橙各有一種。
      ck(`${label}｜午夜藍的隊徽光暈會動`, shots.theme_midnight.auraShown === true);
      ck(`${label}｜餘燼橙的隊徽光暈會呼吸`,
        shots.theme_ember.auraAnim && shots.theme_ember.auraAnim !== "none",
        String(shots.theme_ember.auraAnim));
      ck(`${label}｜常青綠刻意完全不動`,
        shots.theme_verdant.auraAnim === "none", String(shots.theme_verdant.auraAnim));
      //  回到餘燼橙，讓後面幾條沿用同一個狀態。
      await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        profile.useProfileStore.getState().equipClubIdentity("theme_ember");
        return "ok";
      `);
      await sleep(400);
    }

    //  ⑥-c 對手俱樂部卡（Social Identity v1）——公開契約真的擋得住偵察
    {
      const opp = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const st = () => profile.useProfileStore.getState();
        st().ensureCompetitionSeason?.();
        const rows = st().competitionView()?.standings?.rows ?? [];
        const mine = st().team?.id ?? null;
        const other = rows.map(r => r.teamId).find(id => id !== mine) ?? null;
        if (!other) return JSON.stringify({ ok: false, why: "no-opponent" });
        const card = st().publicClubCard(other);
        const mineCard = st().publicClubCard(null);
        const keys = JSON.stringify(card).toLowerCase();
        return JSON.stringify({
          ok: true,
          name: card.name, isMe: card.isMe, derived: card.derived,
          hasAccent: Boolean(card.accent),
          //  AI 對手不得拿到玩家花點數買的收藏品
          aiSkin: card.skin, aiBanner: card.bannerMotif, aiCrest: card.crestPattern,
          //  自己的卡要帶得出自己的識別
          myTitle: mineCard.titleLabel, mySkin: mineCard.skin, myBanner: mineCard.bannerMotif,
          //  ⚠ 禁列：點對手不得看到任何戰術資訊
          leaks: ["doctrine", "headcoach", "capabilit", "tactic", "matchprep", "lineup", "scout", "mastery"]
            .filter(k => keys.includes(k)),
        });
      `));
      ck(`${label}｜找得到對手並組得出公開卡`, opp.ok === true, opp.why ?? "");
      if (opp.ok) {
        ck(`${label}｜對手卡不是自己`, opp.isMe === false);
        ck(`${label}｜對手俱樂部有自己的顏色`, opp.hasAccent === true && opp.derived === true);
        ck(`${label}｜AI 拿不到玩家買的皮膚／橫幅／隊徽框`,
          opp.aiSkin === null && opp.aiBanner === null && opp.aiCrest === null,
          JSON.stringify([opp.aiSkin, opp.aiBanner, opp.aiCrest]));
        ck(`${label}｜自己的公開卡帶得出稱號與皮膚`,
          opp.myTitle === "鐵壁" && opp.mySkin === "ember" && opp.myBanner === "halo",
          JSON.stringify([opp.myTitle, opp.mySkin, opp.myBanner]));
        ck(`${label}｜對手卡不含任何戰術欄位（不是免費偵察）`,
          opp.leaks.length === 0, opp.leaks.join(","));
      }
    }

    //  ⑦ 換外觀免費、無冷卻；換回預設
    //  ⚠ 一定要確認**真的回到資產頁**再往下量：⑧ 的 reduced-motion 量的是
    //    `.ca__card`，人不在那一頁就會量到 undefined 而不是量到問題。
    const back = await chrome.evaluate(ENTER);
    ck(`${label}｜量動效前確實回到資產頁`, String(back).includes("open"), String(back).replace(/"/g, ""));
    //  ⚠ 這裡**不再購買**——⑥-b 已經把三套主題都買下來了。原本的
    //    `p0 - 700` 是「先買一件再算差額」，在那之後會靜默算錯。
    //    只換裝備 ⇒ 差額必須是 0，這樣「換外觀免費」才是真的被量到。
    const swapped = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      const st = () => profile.useProfileStore.getState();
      const p0 = st().retentionView().clubPoints;
      const a = st().equipClubIdentity("theme_verdant");
      const b = st().equipClubIdentity("theme_ember");   // 立刻再換一次
      const c = st().equipClubIdentity(null, "titleId"); // 卸回預設
      return JSON.stringify({
        aOk: a.ok, bOk: b.ok, cOk: c.ok,
        equipped: st().clubAssets.equippedIdentity,
        lastChangeWeek: st().clubAssets.lastCoachChangeWeek,
        spentOnEquip: p0 - st().retentionView().clubPoints,
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
      //  ⚠ 要挑一張**買得起或已擁有**的卡。買不起的卡本來就被
      //    \`[data-owned="0"][data-affordable="0"]\` 調暗成 0.72——拿它來量
      //    「動畫有沒有停在完成狀態」會把經濟狀態誤讀成動效 bug。
      const card = document.querySelector('.ca__card[data-owned="1"]')
        || document.querySelector('.ca__card[data-affordable="1"]');
      if (!card) return JSON.stringify({ found: false });
      const c = getComputedStyle(card);
      return JSON.stringify({ found: true, anim: c.animationName, opacity: Number(c.opacity) });
    `));
    ck(`${label}｜reduced-motion 下動畫全停`, rm.found && rm.anim === "none", String(rm.anim));
    ck(`${label}｜reduced-motion 下內容仍是完成狀態`, rm.found && rm.opacity === 1, String(rm.opacity));

    //  ⚠ 首頁的皮膚／光暈也必須在 reduced-motion 下停下來，而且**停在最終
    //    狀態**（不是消失）。只擋資產頁的卡片動畫是不夠的。
    //  ⚠ ⑦ 把稱號卸回預設了，這裡要先裝回去，否則量到的是「沒有稱號」
    //    而不是「稱號在 reduced-motion 下還在」。
    await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      profile.useProfileStore.getState().equipClubIdentity("title_ironclad");
      return "ok";
    `);
    await chrome.navigate(server.url);
    await waitForApp(chrome);
    await sleep(500);
    const rmHome = J(await chrome.evaluate(HOME_LOOK));
    ck(`${label}｜reduced-motion 下隊徽光暈不動`,
      rmHome.auraAnim === "none", String(rmHome.auraAnim));
    ck(`${label}｜reduced-motion 下皮膚仍畫得出來`,
      rmHome.skinBg.length > 20 && rmHome.skinAttr === "ember", `len=${rmHome.skinBg.length}`);
    ck(`${label}｜reduced-motion 下稱號仍在`, rmHome.titleText === "鐵壁", String(rmHome.titleText));

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
