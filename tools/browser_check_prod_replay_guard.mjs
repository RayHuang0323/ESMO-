#!/usr/bin/env node
// ============================================================================
//  正式站：舊模擬版本的重播必須被**明確阻擋**（不得偷偷用新版重算）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_replay_guard.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 900000`
//
//  ⚠ 正式站讀不到 `/src/`，所以不能直接呼叫 `canReplay()`。改成走**玩家真的
//    會走的路**：打一場挑戰 → 竄改存檔裡那一場的 simulationVersion → 按
//    「重新計算並比對」。守衛有效的話，畫面必須給拒絕理由；沒效的話它會
//    用 v4 重算並回報「一致」——那正是本檢查要抓的東西。
//
//  ⚠ 前置一定要先證明成立（真的打完一場、版本真的是 v4、竄改真的寫進去），
//    否則「按了沒有說一致」也可能只是根本沒有那一場，變成假綠。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(300);
  }
  return { ok: false, ms: Date.now() - t0 };
};

const readChallenge = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  const st = raw ? JSON.parse(raw) : null;
  const inst = st?.challenge?.instances ?? {};
  const ids = Object.keys(inst);
  const withResult = ids.filter((id) => inst[id]?.result);
  const id = withResult[withResult.length - 1] ?? null;
  return JSON.stringify({
    total: ids.length, withResult: withResult.length, id,
    simulationVersion: id ? (inst[id].simulationVersion ?? null) : null,
    outcome: id ? (inst[id].result?.outcome ?? null) : null,
  });
`;

const result = await runGate({
  name: "正式站 legacy replay 守衛",
  externalUrl: process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/",
  run: async ({ chrome, url, ck, sleep }) => {
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(2000);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return JSON.stringify({});`);
    await chrome.navigate(url); await sleep(2500);

    // ── 走到玩家挑戰 ────────────────────────────────────────────────────
    const entered = await (async () => {
      for (const attempt of [
        `[...document.querySelectorAll('[data-testid^="home-utility-"]')].find((n) => /挑戰/.test(n.innerText || ""))?.click()`,
        `[...document.querySelectorAll("button")].find((n) => /玩家挑戰|挑戰/.test(n.innerText || ""))?.click()`,
      ]) {
        await chrome.evaluate(`${attempt}; return JSON.stringify({});`);
        const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-board"]')`, 12000);
        if (w.ok) return true;
      }
      return false;
    })();
    ck("① 正式站進得了玩家挑戰", entered);
    if (!entered) return;

    // ── 打一場（前置：必須真的產生一場有結果的挑戰）──────────────────────
    await chrome.evaluate(`
      [...document.querySelectorAll('[data-testid^="challenge-start-"]')].find((b) => !b.disabled)?.click();
      return JSON.stringify({});
    `);
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-result-card"]')`, 90000);
    await sleep(1500);

    const before = J(await chrome.evaluate(readChallenge()));
    console.log(`\n打完一場：${JSON.stringify(before)}`);
    ck("② 前置：真的產生了一場有結果的挑戰", (before?.withResult ?? 0) > 0 && !!before?.id,
      JSON.stringify(before));
    ck("② 前置：這場記錄的就是 moba-sim.v4", before?.simulationVersion === "moba-sim.v4",
      String(before?.simulationVersion));
    if (!before?.id) return;

    // ── 未竄改時：驗證應該說「一致」（證明這條路徑本來會走通）─────────────
    await chrome.evaluate(`
      [...document.querySelectorAll('[data-testid^="challenge-detail-"]')].find((b) => b.tagName === "BUTTON")?.click();
      return JSON.stringify({});
    `);
    await sleep(800);
    const okPath = await (async () => {
      const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-btn"]')`, 15000);
      if (!w.ok) return null;
      await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]').click(); return JSON.stringify({});`);
      await sleep(2500);
      return J(await chrome.evaluate(`
        return JSON.stringify({ text: document.querySelector('[data-testid="challenge-verify-result"]')?.innerText ?? null });
      `));
    })();
    console.log(`未竄改的驗證結果：${JSON.stringify(okPath)}`);
    ck("③ 對照組：沒有竄改時，重播驗證會說一致",
      !!okPath?.text && /一致/.test(okPath.text), JSON.stringify(okPath));

    // ── 竄改成舊版本 ────────────────────────────────────────────────────
    const mutated = J(await chrome.evaluate(`
      const raw = localStorage.getItem("esmo.profile.v1");
      const st = JSON.parse(raw);
      const id = ${JSON.stringify(before.id)};
      st.challenge.instances[id].simulationVersion = "moba-sim.v3";
      localStorage.setItem("esmo.profile.v1", JSON.stringify(st));
      const back = JSON.parse(localStorage.getItem("esmo.profile.v1"));
      return JSON.stringify({ wrote: back.challenge.instances[id].simulationVersion });
    `));
    ck("④ 前置：竄改真的寫進存檔了", mutated?.wrote === "moba-sim.v3", JSON.stringify(mutated));

    await chrome.navigate(url); await sleep(2500);
    await chrome.evaluate(`
      [...document.querySelectorAll('[data-testid^="home-utility-"]')].find((n) => /挑戰/.test(n.innerText || ""))?.click();
      return JSON.stringify({});
    `);
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-board"]')`, 15000);
    await sleep(800);
    const stillThere = J(await chrome.evaluate(readChallenge()));
    ck("④ 前置：重載後那一場仍在且仍是被竄改的版本",
      stillThere?.id === before.id && stillThere?.simulationVersion === "moba-sim.v3",
      JSON.stringify(stillThere));

    //  ⚠ 重載後「剛打完那一場」的暫存選取狀態不在了，驗證鍵自然不會出現——
    //    那不是守衛擋下，只是我沒把那一場打開。要走歷史清單重新開啟該場。
    const opened = J(await chrome.evaluate(`
      const btn = document.querySelector('[data-testid="challenge-history-${before.id}"]');
      if (!btn) return JSON.stringify({ ok: false,
        listed: [...document.querySelectorAll('[data-testid^="challenge-history-"]')]
          .map((n) => n.getAttribute("data-testid")) });
      btn.scrollIntoView({ block: "center" }); btn.click();
      return JSON.stringify({ ok: true });
    `));
    await sleep(1200);
    ck("④ 前置：竄改後那一場仍列在歷史裡（不是整場消失）", opened?.ok === true, JSON.stringify(opened));
    const guard = await (async () => {
      const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-btn"]')`, 15000);
      if (!w.ok) return { text: null, why: "找不到驗證鍵" };
      await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]').click(); return JSON.stringify({});`);
      await sleep(2500);
      return J(await chrome.evaluate(`
        return JSON.stringify({ text: document.querySelector('[data-testid="challenge-verify-result"]')?.innerText ?? null });
      `));
    })();
    console.log(`竄改後的驗證結果：${JSON.stringify(guard)}`);

    ck("⑤ LEGACY_REPLAY_GUARD：舊版本被明確擋下（有拒絕理由）",
      !!guard?.text && !/一致/.test(guard.text), JSON.stringify(guard));
    ck("⑤ 拒絕理由指名是版本問題（不是含混的一句『對不上』）",
      !!guard?.text && /版本|相容|moba-sim/.test(guard.text), guard?.text ?? "(無)");
    ck("⑤ 沒有偷偷用 v4 重算並宣稱一致",
      !(guard?.text && /一致/.test(guard.text)), guard?.text ?? "(無)");

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑥ 無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 2).join(" ¦ ") || "clean");
  },
});

finishGate(result);
