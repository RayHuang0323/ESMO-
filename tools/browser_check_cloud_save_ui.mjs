#!/usr/bin/env node
// ============================================================================
//  Backend B1D — 雲端存檔畫面（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_cloud_save_ui.mjs --timeout 900000`
//
//  ── 這一支驗什麼 ─────────────────────────────────────────────────────────
//  這台機器**沒有 Supabase 憑證**，所以驗的是「**沒有設定時**這個畫面誠不誠實」：
//    · 進得去、不 crash、不橫向溢出
//    · 照實說「這個版本還沒有開放雲端存檔」，**不假裝**已備份
//    · 沒有登入按鈕（沒設定就不該給一顆按下去什麼都不會發生的鍵）
//    · 不把「有帳號」講成「防作弊」
//    · 玩家看得到的字裡沒有工程詞
//    · 正常狀態下**不誤顯**雲端同步失敗
//
//  ⚠ **驗不到**：真的登入、真的同步。那要有正式憑證，見
//    `check_cloud_save_b1d` 的 `REMOTE_E2E_NOT_RUN`。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true };
    await sleep(250);
  }
  return { ok: false };
};

const screen = () => `
  const q = (s) => document.querySelector(s);
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const text = document.body.innerText || "";
  const banned = ["Supabase", "supabase", "RLS", "token", "JWT", "bundle", "provider", "schema", "anon key"]
    .filter((w) => text.includes(w));
  const own = [...document.querySelectorAll('[data-testid^="cloud-"] button, button[data-testid^="cloud-"]')];
  const small = own.filter(vis).filter((el) => el.getBoundingClientRect().height < 44)
    .map((el) => (el.innerText || "").trim().slice(0, 12));
  return JSON.stringify({
    onScreen: !!q('[data-testid="cloud-auth-card"]'),
    authMessage: (q('[data-testid="cloud-auth-message"]')?.innerText || "").trim(),
    hasGoogleBtn: vis(q('[data-testid="cloud-signin-google"]')),
    hasAnonBtn: vis(q('[data-testid="cloud-signin-anonymous"]')),
    hasSignOut: vis(q('[data-testid="cloud-signout"]')),
    hasSyncCard: vis(q('[data-testid="cloud-sync-card"]')),
    scopeNote: (q('[data-testid="cloud-scope-note"]')?.innerText || "").replace(/\\s+/g, " ").trim(),
    localNote: (q('[data-testid="cloud-local-note"]')?.innerText || "").trim(),
    cloudNotice: vis(q('[data-testid="cloud-sync-notice"]')),
    saveNotice: vis(q('[data-testid="save-status-notice"]')),
    banned, small, smallCount: small.length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyLen: text.length,
  });
`;

async function gotoCloud(chrome, sleep) {
  for (const step of [
    `document.querySelector('[data-testid="home-utility-cloudSave"]')?.click()`,
    `document.querySelector('[data-testid="home-nav-more"]')?.click()`,
    `document.querySelector('[data-testid="home-sheet-cloudSave"]')?.click()`,
  ]) {
    await chrome.evaluate(`${step}; return JSON.stringify({});`);
    await sleep(600);
    if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="cloud-auth-card"]')`, 4000)).ok) return true;
  }
  return false;
}

const result = await runGate({
  name: "B1D 雲端存檔畫面（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1400);
      await chrome.evaluate(`
        for (const k of Object.keys(localStorage).filter((k) => k.indexOf("esmo") === 0)) localStorage.removeItem(k);
        return JSON.stringify({});
      `);
      await chrome.navigate(url); await sleep(1800);

      const opened = await gotoCloud(chrome, sleep);
      ck(`${L}｜① 首頁進得了雲端存檔`, opened);
      if (!opened) continue;
      await sleep(500);
      const v = J(await chrome.evaluate(screen()));

      // ── ② 沒設定時要誠實 ────────────────────────────────────────────
      ck(`${L}｜⭐ ② 照實說「這個版本還沒有開放雲端存檔」`,
        v.authMessage === "這個版本還沒有開放雲端存檔", v.authMessage);
      ck(`${L}｜⭐ ② 沒設定就**不給**登入按鈕（不放一顆按了沒反應的鍵）`,
        v.hasGoogleBtn === false && v.hasAnonBtn === false && v.hasSignOut === false);
      ck(`${L}｜② 沒登入就不顯示同步狀態卡`, v.hasSyncCard === false);
      ck(`${L}｜⭐ ② 照實說進度存在這台裝置`,
        /先存在這台裝置/.test(v.localNote), v.localNote.slice(0, 30));

      // ── ③ 不得宣稱防作弊 ────────────────────────────────────────────
      ck(`${L}｜⭐ ③ 明說這**不是**防作弊機制`,
        /不是.{0,4}競技防作弊|不是.{0,6}防作弊/.test(v.scopeNote), v.scopeNote.slice(0, 60));
      ck(`${L}｜③ 明說回放留在本機`, /留在這台裝置/.test(v.scopeNote));

      // ── ④ 措辭與版面 ────────────────────────────────────────────────
      ck(`${L}｜⭐ ④ 玩家看得到的字裡沒有工程詞`, v.banned.length === 0, v.banned.join(","));
      ck(`${L}｜④ 不橫向溢出`, v.overflow === false);
      ck(`${L}｜④ 本頁互動元素都 ≥44px`, v.smallCount === 0, v.small.join(",") || "clean");
      //  ⚠ 不要用「字數 > N」這種隨手訂的門檻當「有沒有內容」——
      //    這一頁是**刻意做得很小**的，187 字是正常的。改成驗真的該在的東西。
      ck(`${L}｜④ 該有的區塊都在（身分卡 ＋ 範圍說明 ＋ 本機說明）`,
        v.onScreen === true && v.scopeNote.length > 40 && v.localNote.length > 10,
        `${v.bodyLen} 字`);

      // ── ⑤ 正常狀態不誤顯錯誤 ────────────────────────────────────────
      ck(`${L}｜⭐ ⑤ **沒有**誤顯雲端同步失敗`, v.cloudNotice === false);
      ck(`${L}｜⑤ **沒有**誤顯存檔失敗`, v.saveNotice === false);

      // ── ⑥ 回得去，而且遊戲照常 ──────────────────────────────────────
      //  ⚠ ManageFrame 的返回鍵是**圖示按鈕**：沒有 innerText，只有
      //    `aria-label="返回"`。用文字找永遠找不到（我第一版就這樣假紅）。
      await chrome.evaluate(`
        const b = document.querySelector('[aria-label="返回"]');
        if (b) b.click();
        return JSON.stringify({ found: !!b });
      `);
      await sleep(900);
      const back = J(await chrome.evaluate(`
        return JSON.stringify({ home: (document.body.innerText || "").length > 200,
          onCloud: !!document.querySelector('[data-testid="cloud-auth-card"]') });
      `));
      ck(`${L}｜⑥ 返回之後回到遊戲`, back.home === true && back.onCloud === false);
    }

    const errs = chrome.pageErrors ?? [];
    ck("⑦ 無 page-origin uncaught error", errs.length === 0, errs.slice(0, 3).join(" ¦ ") || "clean");
  },
});

finishGate(result);
