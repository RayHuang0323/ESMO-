import { launchChrome } from "./browser/cdp.mjs";

const PROD = process.env.OWNER_PREVIEW_URL;
if (!PROD) throw new Error("OWNER_PREVIEW_URL is required");
const MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await sleep(160);
  }
  throw new Error(`${label} timeout`);
};

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => { if (ok) pass += 1; else fail += 1; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `　${detail}` : ""}`); };

const httpStatus = await fetch(PROD).then((response) => response.status).catch(() => 0);
ck("Owner preview HTTP 200", httpStatus === 200, `status=${httpStatus}`);

let chrome = null;
try {
  chrome = await launchChrome({ url: PROD, port: 9487, headless: true });
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await chrome.navigate(PROD);
  await sleep(1_800);
  const home = await chrome.evaluate(`return (()=>{const text=document.body.innerText||"";return {content:text.length>200,overflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth,buttons:[...document.querySelectorAll("button")].map(n=>n.innerText||"")};})()`);
  ck("Home preview non-blank", home.content, `text=${home.content ? "ok" : "short"}`);
  ck("Home preview no horizontal overflow", home.overflow);
  ck("Home keeps MOBA / CS / Competition entry points", /MOBA/.test(home.buttons.join(" "))&&/CS/.test(home.buttons.join(" "))&&/賽事|賽程/.test(home.buttons.join(" ")));

  for (const [mapKey, label] of Object.entries(MAPS)) {
    await chrome.navigate(`${PROD}?c5c=battle&map=${mapKey}&seed=505001`);
    await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')&&document.querySelector('[data-testid="cs-c5c-presentation-hud"]')`, 90_000, `${label} mount`);
    const state = await chrome.evaluate(`return (()=>{const text=document.body.innerText||"";const status=document.querySelector("[data-cs-bomb-state]");return {clean:!/(?:Three\\.js|WebGL|simulation|snapshot|render|engine)/i.test(text),cards:document.querySelectorAll("[data-esmo-fps-player-card]").length,camera:document.querySelectorAll("[data-testid^=\\"cs-camera-preset-\\"]:not([data-testid=\\"cs-camera-preset-pov\\"])" ).length,pov:Boolean(document.querySelector("[data-testid=\\"cs-camera-preset-pov\\"]")),controls:Boolean(document.querySelector("[data-testid=\\"cs-player-controls\\"]")),routeButton:[...document.querySelectorAll("button")].some(n=>n.innerText.includes("路線")),icons:[...document.querySelectorAll("[data-esmo-fps-player-card]")].filter(n=>n.querySelector("svg")&&n.querySelector("[title]")).length,bomb:Boolean(status&&/C4/.test(status.innerText)),overflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.body.scrollWidth<=document.body.clientWidth};})()`);
    ck(`${label} production HUD clean`, state.clean);
    ck(`${label} 5v5 player cards`, state.cards === 10, `cards=${state.cards}`);
    ck(`${label} three tactical presets`, state.camera === 3, `presets=${state.camera}`);
    ck(`${label} Player POV control`, state.pov);
    ck(`${label} player controls`, state.controls);
    ck(`${label} production route helper hidden`, !state.routeButton);
    ck(`${label} semantic player-card icons`, state.icons >= 10, `cards=${state.icons}`);
    ck(`${label} C4 HUD present`, state.bomb);
    ck(`${label} no horizontal overflow`, state.overflow);
  }
  ck("HTTPS preview console errors = 0", chrome.consoleLines.filter((line) => line.startsWith("[error]")).length === 0, JSON.stringify(chrome.consoleLines.filter((line) => line.startsWith("[error]"))));
  ck("HTTPS preview page errors = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors));
} catch (error) {
  console.error(`HARNESS_FAIL ${error?.stack || error}`);
  fail += 1;
} finally {
  if (chrome) await chrome.close().catch(() => {});
}

console.log(`CS Android Owner HTTPS preview smoke：${pass}/${pass + fail} RESULT=${fail ? "FAIL" : "PASS"}`);
process.exitCode = fail ? 1 : 0;
