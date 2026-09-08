#!/usr/bin/env node
//  正式站探針：清掉存檔之後，畫面長什麼樣、有哪些按鈕。
//  ⚠ 正式站沒有 /src/... ⇒ 只能點 UI 與讀 localStorage（TD-31 的教訓）。
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const PROD = "https://rayhuang0323.github.io/ESMO-/";

const snap = () => `
  const btns = [...document.querySelectorAll('button,[role="button"],a')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => (e.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 20))
    .filter(Boolean);
  return JSON.stringify({
    hasSave: !!localStorage.getItem("esmo.profile.v1"),
    title: document.title,
    body: (document.body.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 260),
    btns: btns.slice(0, 24),
  });
`;

const result = await runGate({
  name: "正式站入口探針",
  externalUrl: PROD,
  run: async ({ chrome, url, ck, sleep }) => {
    await chrome.navigate(url); await sleep(2500);
    let v = J(await chrome.evaluate(snap()));
    console.log("【有存檔時】", JSON.stringify(v, null, 1));
    ck("正式站載入得起來", !!v.title);

    await chrome.evaluate(`localStorage.clear(); return "1";`);
    await chrome.navigate(url); await sleep(2800);
    v = J(await chrome.evaluate(snap()));
    console.log("【清空存檔後】", JSON.stringify(v, null, 1));
    ck("清空後畫面有按鈕", v.btns.length > 0, v.btns.join(" | "));
  },
});
finishGate(result);
