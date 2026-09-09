#!/usr/bin/env node
// ============================================================================
//  正式站補驗：對手的**選角傾向**在挑戰前真的看得到嗎？
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_probe_prod_draft_tendency.mjs --timeout 600000`
//
//  ⚠ 為什麼要另外驗：Slice 5 的正式站 smoke 驗了「賽後看得到雙方選角」，
//    但**賽前**看板上那段「他優先禁用誰／優先選用誰」沒有任何斷言。
//    那段是玩家挑對手時唯一能針對的選角資訊——沒有它，Draft 對玩家就只是
//    賽後才知道的結果，而不是賽前可以判斷的事。
//  ⚠ 只讀畫面，不改存檔（正式站是打包 bundle，沒有 /src）。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const PROD = "https://rayhuang0323.github.io/ESMO-/";

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到含該文字的按鈕" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 500));
  return JSON.stringify({ ok: true });
`;

const clickBy = (sel) => `
  const sel = ${JSON.stringify(sel)};
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + sel });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 500));
  return JSON.stringify({ ok: true });
`;

const readCards = () => `
  const cards = [...document.querySelectorAll('[data-testid^="challenge-candidate-"]')].map((el) => ({
    key: el.getAttribute("data-testid").replace("challenge-candidate-", ""),
    text: (el.innerText || "").trim(),
  }));
  const detail = [...document.querySelectorAll('[data-testid^="challenge-detail-body-"]')]
    .map((el) => (el.innerText || "").trim()).join("\\n");
  return JSON.stringify({ cards, detail });
`;

const result = await runGate({
  name: "正式站：對手選角傾向（賽前可見）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(2600);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      ck(`${L}｜入口點得到`, J(await chrome.evaluate(clickByText("玩家挑戰"))).ok);
      await sleep(800);

      let v = J(await chrome.evaluate(readCards()));
      ck(`${L}｜看板有候選`, v.cards.length > 0, `${v.cards.length} 個`);

      //  把每一張卡的詳情都展開，逐張看它有沒有寫出選角傾向。
      let withPolicy = 0;
      for (const c of v.cards) {
        await chrome.evaluate(clickBy(`[data-testid="challenge-detail-${c.key}"]`));
      }
      await sleep(600);
      v = J(await chrome.evaluate(readCards()));

      const TENDENCY = /優先禁用|優先選用|指定了 \d+ 個席位的偏好英雄|偏好用完後/;
      withPolicy = (v.detail.match(new RegExp(TENDENCY, "g")) ?? []).length;
      ck(`${L}｜⭐ 賽前就看得到對手的選角傾向`, TENDENCY.test(v.detail),
        (v.detail.match(TENDENCY) ?? ["(沒有)"])[0]);
      ck(`${L}｜傾向有實際內容（不只一行 fallback 說明）`, withPolicy >= 2, `${withPolicy} 段`);
      //  ⚠ 傾向只准描述方針裡真的寫著的東西，不得出現強弱推估。
      ck(`${L}｜傾向不含強弱宣告`, !/戰力|勝率|評分|星等|很會|擅長 counter/.test(v.detail));
      ck(`${L}｜英雄以名字呈現而不是英文 id`,
        !/\b(ironclad|duskblade|bingshuang|lieyan|cinderfist|leiting)\b/.test(v.detail),
        (v.detail.match(TENDENCY) ?? [""])[0]);
    }
  },
  externalUrl: PROD,
});

finishGate(result);
