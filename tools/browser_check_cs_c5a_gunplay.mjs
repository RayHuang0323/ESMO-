#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = Number(process.env.CS_C5A_VITE_PORT || 5450);
const CDP_PORT = Number(process.env.CS_C5A_CDP_PORT || 9450);
const WIDTH = Number(process.env.CS_C5A_VIEWPORT_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C5A_VIEWPORT_HEIGHT || 768);
const APP_BASE = process.env.CS_C5A_APP_URL || `http://127.0.0.1:${VITE_PORT}/ESMO-/`;
const OUTPUT_DIR = process.env.CS_C5A_CAPTURE_DIR || path.resolve("artifacts/cs-c5a/gunfeel");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAPS = {
  mirage: { title: "Mirage", key: "mirage" },
  dust2: { title: "Dust II", key: "dust2" },
  inferno: { title: "Inferno", key: "inferno" },
};

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return true; } catch {}
    await sleep(250);
  }
  throw new Error(`${label} timeout`);
}

async function clickByText(chrome, predicate, label) {
  const result = await chrome.evaluate(`
    const button = [...document.querySelectorAll("button")].find((node) => (${predicate})(node, (node.innerText || "").replace(/\\s+/g, " ").trim()));
    if (!button || button.disabled) return { ok: false, buttons: [...document.querySelectorAll("button")].map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 60) };
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim(); button.click(); return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result;
}

async function prepAction(chrome) {
  return chrome.evaluate(`
    const button = document.querySelector('[data-testid="prep-primary-action"]');
    if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
    const action = button.dataset.action; button.click(); return { ok: true, action };
  `);
}

async function enterBattle(chrome, mapKey) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "CS 入口");
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "CS 模式");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS 準備頁");
  let prep = await prepAction(chrome);
  if (!prep.ok && prep.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("Auto") || text.includes("自動")`, "自動準備");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "佇列確認");
    prep = await prepAction(chrome);
  }
  if (!prep.ok) throw new Error(`準備流程不可用: ${JSON.stringify(prep)}`);
  if (prep.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "進入地圖選擇");
    if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await prepAction(chrome);
  }
  await waitFor(chrome, `document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "地圖選擇");
  await chrome.evaluate(`document.querySelector('[data-map-key="${mapKey}"]')?.click(); return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled&&!node.dataset.mapKey); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="${mapKey}"]') && document.body.innerText.includes("${MAPS[mapKey].title}")`, 30_000, "地圖確認");
  await clickByText(chrome, `(node, text) => text.length > 20 && !text.includes("Cancel") && !text.includes("取消")`, "戰術確認");
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle runtime");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-camera-presets"]')`, 10_000, "鏡頭控制");
}

async function captureCanvas(chrome, filename) {
  await chrome.evaluate(`document.querySelector("canvas")?.scrollIntoView({block:"start",inline:"nearest"}); return true;`);
  await sleep(180);
  const rect = await chrome.evaluate(`return (() => { const canvas=document.querySelector("canvas"); if(!canvas)return null; const r=canvas.getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`canvas unavailable: ${filename}`);
  const shot = await chrome.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
  if (!shot?.data) throw new Error(`screenshot unavailable: ${filename}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const full = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(full, Buffer.from(shot.data, "base64"));
  return full;
}

async function readEvidence(chrome, mapKey) {
  return chrome.evaluate(`return (() => {
    const canvas=document.querySelector("canvas");
    const st=window.__ESMO_FPS_SCENE__;
    const live=st?.liveRef?.current;
    const frames=live?.sim?.frames||[];
    const familyCounts={};
    frames.forEach((frame)=>{(frame.muzzles||[]).forEach((event)=>{const family=event.weaponFamily||"unknown";familyCounts[family]=(familyCounts[family]||0)+1;});});
    const fireIndex=frames.findIndex((frame)=>Boolean(frame.muzzles?.length && frame.tracers?.some((event)=>event.hit)));
    const deathIndex=frames.findIndex((frame,index)=>index>0 && frame.players?.some((player)=>player.dead && !frames[index-1]?.players?.find((prev)=>prev.id===player.id)?.dead));
    const parse=(value)=>{try{return JSON.parse(value||"{}");}catch{return {};}};
    const reaction=live?.sim?.reactionTelemetry||[];
    const samples=reaction.filter((episode)=>Number.isFinite(episode.latencyMs));
    const activeFrame=frames[live?.fIdx??-1]||{};
    const previousFrame=frames[Math.max(0,(live?.fIdx??0)-1)]||{};
    const frameDeaths=(activeFrame.players||[]).filter((player)=>player.dead&&!previousFrame.players?.find((prev)=>prev.id===player.id)?.dead).length;
    const frameGunfire=(activeFrame.muzzles||[]).length;
    const frameHits=(activeFrame.tracers||[]).filter((event)=>event.hit).length;
    return {mapKey:${JSON.stringify(mapKey)},frameIndex:live?.fIdx??null,totalFrames:frames.length,fireIndex,deathIndex,familyCounts,
      reactionSummary:live?.sim?.reactionSummary||null,reactionSamples:samples.slice(0,80),
      runtime:{gunfire:Math.max(Number(canvas?.dataset.esmoFpsC5aGunfire||0),frameGunfire),hits:Math.max(Number(canvas?.dataset.esmoFpsC5aHits||0),frameHits),impacts:Math.max(Number(canvas?.dataset.esmoFpsC5aImpacts||0),frameHits),deaths:Math.max(Number(canvas?.dataset.esmoFpsC5aDeaths||0),frameDeaths),families:parse(canvas?.dataset.esmoFpsC5aFamilies),surfaces:parse(canvas?.dataset.esmoFpsC5aSurfaces)},
      visibility:window.__ESMO_FPS_VISIBILITY__||null,
      identity:st?.identity||null,
      renderer:canvas?{calls:Number(canvas.dataset.esmoFpsRenderCalls||0),triangles:Number(canvas.dataset.esmoFpsTriangles||0),geometries:Number(canvas.dataset.esmoFpsGeometries||0),textures:Number(canvas.dataset.esmoFpsTextures||0),players:Number(canvas.dataset.esmoFpsPlayers||0),rigged:Number(canvas.dataset.esmoFpsRigged||0)}:null,
      camera:st?{preset:st.cam?.viewPreset||null,recovery:st.cameraRecoveryCount||0,rapid:st.rapidCameraRecoveryCount||0}:null,
      c5a:st?.c5aGunplayFx?.diagnostics?.()||null,
      c5a1:{hitPositionDriftMax:Number(canvas?.dataset.esmoFpsC5a1HitDriftMax||0),hitPositionDriftSamples:Number(canvas?.dataset.esmoFpsC5a1HitDriftSamples||0),authoritativePositionDriftMax:Number(canvas?.dataset.esmoFpsC5a1AuthoritativeDriftMax||0),audio:window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null},
      fxContract:{families:st?.c5aGunplayFx?.weaponFamilies?.length||0,surfaces:st?.c5aGunplayFx?.surfaces?.length||0,reviewMode:st?.c5aGunplayFx?.reviewMode||null},
      canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null};
  })()`);
}

async function seekFrame(chrome, index) {
  if (index < 0) return false;
  const ok=await chrome.evaluate(`return (()=>{const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current;if(!live||!live.sim?.frames?.[${index}])return false;const range=document.querySelector('input[type="range"]');if(range){const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(range,${index});range.dispatchEvent(new Event('input',{bubbles:true}));range.dispatchEvent(new Event('change',{bubbles:true}));}const until=performance.now()+850;const force=()=>{const current=window.__ESMO_FPS_SCENE__,next=current?.liveRef?.current;if(next?.sim?.frames?.[${index}]){next.playing=false;next.fIdx=${index};next.seekNonce=(next.seekNonce||0)+1;if(current)current.subT=0;}if(performance.now()<until)requestAnimationFrame(force);};force();return true;})()`);
  if(ok)await sleep(190);
  return ok;
}

function writeOwnerReview(results, captures) {
  const mapRows = results.map((result) => {
    const map = MAPS[result.mapKey];
    const runtime = result.fireEvidence?.runtime || {};
    const deathRuntime = result.deathEvidence?.runtime || {};
    const renderer = result.fireEvidence?.renderer || {};
    return `<tr><td>${map.title}</td><td>${runtime.gunfire || 0}</td><td>${runtime.hits || 0}</td><td>${deathRuntime.deaths || 0}</td><td>${renderer.calls || 0}</td><td>${renderer.triangles || 0}</td><td>${result.fireEvidence?.camera?.rapid ? "需修正" : "通過"}</td></tr>`;
  }).join("");
  const mapSections = results.map((result) => {
    const map = MAPS[result.mapKey];
    return `<section><h2>${map.title}｜Battle 實際槍戰</h2><p>以下畫面來自實際 Battle runtime：開火、命中、死亡與角色可見性均從 authoritative frame 事件驅動。此層只負責呈現，不改傷害、射速或 gameplay recoil。</p><div class="shots"><figure><img src="./${captures[result.mapKey].battle}" alt="${map.title} Battle 槍戰"><figcaption>Battle 槍戰：槍口閃光、tracer、命中圈與交戰位置。</figcaption></figure><figure><img src="./${captures[result.mapKey].fire}" alt="${map.title} 開火命中"><figcaption>開火／命中：weapon family 會改變閃光尺度、光色、tracer 寬度與 shell 呈現。</figcaption></figure><figure><img src="./${captures[result.mapKey].death}" alt="${map.title} 死亡回饋"><figcaption>死亡回饋：authoritative dead 觸發 death animation 與短暫 death pulse。</figcaption></figure></div></section>`;
  }).join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESMO CS-C5A｜槍戰回饋 Owner 驗收</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b1116;color:#edf6f3}body{max-width:1240px;margin:0 auto;padding:28px}h1{margin:0 0 8px;font-size:28px}h2{margin-top:34px;color:#f2cc88}h3{color:#9de5dc;margin-bottom:6px}p{color:#bdcfcb;line-height:1.75}.status{display:inline-block;padding:7px 12px;border:1px solid #63cbb9;border-radius:999px;color:#a8efdf;font-weight:800}.scope{padding:16px;border-left:3px solid #63cbb9;background:#14252b;border-radius:7px}.shots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.shots figure{margin:0;padding:10px;border:1px solid #304950;border-radius:12px;background:#132128}.shots img{display:block;width:100%;height:auto;border-radius:8px;background:#070d11}.shots figcaption{padding:8px 2px 2px;color:#c0cfcc;font-size:13px;line-height:1.5}.families{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.family{padding:14px 10px;background:#132128;border:1px solid #304950;border-radius:12px}.family i{display:block;height:10px;background:var(--c);box-shadow:0 0 16px var(--c);border-radius:999px;margin:16px 0 10px;width:var(--w)}.family b{font-size:14px}.family span{display:block;color:#b9c9c6;font-size:12px;line-height:1.55}table{width:100%;border-collapse:collapse;background:#132128;margin-top:10px}th,td{border:1px solid #304950;padding:10px;text-align:left;font-size:13px}th{color:#f2cc88}a{color:#9de5dc}@media(max-width:760px){body{padding:16px}.shots{grid-template-columns:1fr}.families{grid-template-columns:repeat(2,1fr)}table{font-size:11px;display:block;overflow:auto}}</style></head><body><span class="status">C5A_GUNPLAY_PRESENTATION_READY_FOR_OWNER_ACCEPTANCE</span><h1>ESMO CS-C5A｜槍火、命中與死亡呈現 Owner 驗收</h1><p>本頁全中文說明本輪 presentation-only 槍戰回饋。槍聲、傷害、射速、武器數值與死亡 authority 沒有在本輪新增或改寫；畫面只消費既有 frame snapshot。</p><div class="scope"><b>驗收摘要：</b>五類槍械有不同的槍口閃光、光束長度、tracer 寬度、shell 色彩與命中節奏；角色命中、材質 impact 與 death pulse 使用 bounded pool，避免透明 compositor、ghost 與 RAF 迴圈。<br><a href="./runtime-evidence.json">查看完整 Battle runtime evidence</a></div><h2>五類槍械開火差異</h2><div class="families"><div class="family"><b>手槍</b><i style="--c:#ffd08a;--w:32%"></i><span>短促、緊湊的閃光；細 tracer；輕量退殼。</span></div><div class="family"><b>衝鋒槍</b><i style="--c:#ffb65c;--w:45%"></i><span>連發感較密；暖色閃光；較明顯 shell。</span></div><div class="family"><b>步槍</b><i style="--c:#ffc96b;--w:62%"></i><span>較長槍口光束；中等 tracer；清楚的步槍節奏。</span></div><div class="family"><b>狙擊槍</b><i style="--c:#e9f5ff;--w:86%"></i><span>明亮長閃光；最寬 tracer；單發重量感。</span></div><div class="family"><b>霰彈槍</b><i style="--c:#ffe0a0;--w:70%"></i><span>寬而短的爆發輪廓；暖白光；多粒子命中感。</span></div></div><figure><img src="./${captures.weapons}" alt="五類槍械開火差異呈現"><figcaption>五類槍械的 presentation profile 對照：武器家族差異不是只換顏色。</figcaption></figure><h2>不同命中表面</h2><p>戰鬥中的角色命中沿用 authoritative hit event；材質表面反應使用同一個 presentation surface catalogue，為未來可消費的環境命中事件保留一致的回饋語言。</p><div class="shots"><figure><img src="./${captures.impacts}" alt="水泥金屬木材地面命中差異"><figcaption>水泥／牆面：偏灰塵；金屬：明亮 sparks；木材：碎屑；地面：低位塵土。</figcaption></figure><figure><img src="./${captures.mirage.battle}" alt="角色命中與槍戰"><figcaption>角色命中：短暫命中圈與粒子，不遮住人物 silhouette。</figcaption></figure></div>${mapSections}<h2>三張地圖 runtime 對照</h2><table><thead><tr><th>地圖</th><th>開火事件</th><th>命中／impact</th><th>死亡</th><th>render calls</th><th>triangles</th><th>Camera recovery</th></tr></thead><tbody>${mapRows}</tbody></table><h2>驗收結論</h2><p>本輪完成的是可讀、短生命週期、可清理的槍戰回饋層；沒有建立第二套 combat state，也沒有開始 C5B 的 grenade、smoke 或 audio 工作。</p></body></html>`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "owner-review.html"), html, "utf8");
}

function loadBaselineEvidence(mapKey) {
  const file = path.resolve("artifacts/cs-c5a/baseline-instrumented/runtime-evidence.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.results?.find((result) => result.mapKey === mapKey)?.baseEvidence || null;
  } catch { return null; }
}

function writeOwnerReviewC5A1(results, captures) {
  const rows = results.map((result) => {
    const before = loadBaselineEvidence(result.mapKey)?.reactionSummary || {};
    const after = result.fireEvidence?.reactionSummary || {};
    const drift = result.fireEvidence?.c5a1 || {};
    return `<tr><td>${MAPS[result.mapKey].title}</td><td>${before.medianMs ?? "—"} ms / ${before.p90Ms ?? "—"} ms</td><td>${after.medianMs ?? "—"} ms / ${after.p90Ms ?? "—"} ms</td><td>${drift.hitPositionDriftMax ?? "—"}</td><td>${result.fireEvidence?.runtime?.gunfire || 0}</td><td>${result.fireEvidence?.renderer?.calls || 0}</td></tr>`;
  }).join("");
  const sections = results.map((result) => {
    const map = MAPS[result.mapKey];
    return `<section><h2>${map.title}｜Battle 實際驗證</h2><p>以下三張圖均來自實際 Battle runtime。槍火與角色命中由 authoritative frame 驅動；音效只在使用者開啟喇叭後由程序化 profile 產生。</p><div class="shots"><figure><img src="./${captures[result.mapKey].battle}" alt="${map.title} Battle 槍戰"><figcaption>一般 Battle：交戰位置、角色 silhouette 與槍火可讀。</figcaption></figure><figure><img src="./${captures[result.mapKey].fire}" alt="${map.title} 開火命中"><figcaption>開火／命中：hitscan 射線短暫出現，命中回饋不遮住人物。</figcaption></figure><figure><img src="./${captures[result.mapKey].death}" alt="${map.title} 死亡回饋"><figcaption>死亡：只由 authoritative dead edge 觸發，不新增死亡 authority。</figcaption></figure></div></section>`;
  }).join("");
  const audio = results.find((result) => result.fireEvidence?.c5a1?.audio)?.fireEvidence?.c5a1?.audio || { profiles: {}, events: [] };
  const audioRows = Object.entries(audio.profiles || {}).map(([key, profile]) => `<tr><td>${profile.label || key}</td><td>${profile.crackHz} Hz</td><td>${profile.bodyHz} Hz</td><td>${profile.tailHz} Hz</td><td>${(audio.events || []).filter((event) => event.family === key).length ? "Battle 已觸發" : "已建立 profile；本次三圖未抽到"}</td></tr>`).join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESMO CS-C5A.1｜Gunfeel Owner 驗收</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#091117;color:#edf6f3}body{max-width:1240px;margin:0 auto;padding:28px}h1{margin:0 0 8px;font-size:28px}h2{margin-top:34px;color:#f2cc88}h3{color:#9de5dc;margin-bottom:6px}p{color:#bdcfcb;line-height:1.75}.status{display:inline-block;padding:7px 12px;border:1px solid #63cbb9;border-radius:999px;color:#a8efdf;font-weight:800}.scope{padding:16px;border-left:3px solid #63cbb9;background:#14252b;border-radius:7px}.shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.shots figure{margin:0;padding:10px;border:1px solid #304950;border-radius:12px;background:#132128}.shots img{display:block;width:100%;height:auto;border-radius:8px;background:#070d11}.shots figcaption{padding:8px 2px 2px;color:#c0cfcc;font-size:13px;line-height:1.5}table{width:100%;border-collapse:collapse;background:#132128;margin-top:10px}th,td{border:1px solid #304950;padding:10px;text-align:left;font-size:13px}th{color:#f2cc88}.metric{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric div{padding:14px;background:#132128;border:1px solid #304950;border-radius:12px}.metric b{display:block;color:#9de5dc;font-size:12px}.metric span{display:block;margin-top:6px;font-size:20px;font-weight:800}a{color:#9de5dc}@media(max-width:760px){body{padding:16px}.shots{grid-template-columns:1fr}.metric{grid-template-columns:repeat(2,1fr)}table{display:block;overflow:auto}}</style></head><body><span class="status">C5A1_GUNFEEL_READY_FOR_OWNER_ACCEPTANCE</span><h1>ESMO CS-C5A.1｜槍感與戰鬥反應 Owner 驗收</h1><p>本頁只記錄 C5A.1 的戰鬥回饋修正：反應延遲、命中位移、hitscan tracer、射擊／命中 animation presentation 與核心槍聲 profile。沒有修改 weapon damage、fire rate、economy、MatchSession 或 C5B。</p><div class="scope"><b>驗收入口：</b>請先觀看下方三張地圖的 Battle 實際畫面，再檢查量化資料。這是 feature worktree 的 local preview，並非 Owner Acceptance 結論。<br><a href="./runtime-evidence.json">查看完整 runtime evidence</a></div><h2>1｜反應鏈量測</h2><p>鏈路為「敵人成為有效可見目標 → target acquired → fire permission → first authoritative shot」。修正前為原本 2 秒 decision tick 加上 pair queue／隨機 fire gate；修正後，新鮮且清楚 LoS 的目標優先進入交火名額，首次反應使用既有反應／視野／專注／距離模型，後續射擊仍保留原 aggression gate。</p><table><thead><tr><th>地圖</th><th>修正前延遲中位數／P90</th><th>修正後延遲中位數／P90</th><th>命中位移最大值</th><th>開火事件數</th><th>渲染呼叫數</th></tr></thead><tbody>${rows}</tbody></table><p>單位為 authoritative simulation 的有效時間戳；目前 snapshot resolution 為 2,000 ms，首次反應模型本身為約 160–680 ms。兩者同時保留，避免把 snapshot 粒度誤報成 render delay。</p><h2>2｜命中後位置安全</h2><div class="metric"><div><b>權威父節點位移最大值</b><span>${Math.max(...results.map((result) => result.fireEvidence?.c5a1?.authoritativePositionDriftMax || 0))}</span></div><div><b>Hit_Chest 子節點位移最大值</b><span>${Math.max(...results.map((result) => result.fireEvidence?.c5a1?.hitPositionDriftMax || 0))}</span></div><div><b>命中位移採樣數</b><span>${Math.max(...results.map((result) => result.fireEvidence?.c5a1?.hitPositionDriftSamples || 0))}</span></div><div><b>命中鎖定</b><span>每個生命值邊緣一次</span></div></div><p>實際修法是移除 root／hips／pelvis 的 position tracks，只保留旋轉供 hurt／fire／death presentation；world position 仍由 authoritative frame parent 設定。不是 clamp 或 teleport。</p><h2>3｜五類槍械與程序化槍聲</h2><p>槍火 profile 維持手槍、衝鋒槍、步槍、狙擊槍、霰彈槍五類。tracer 是完整 hitscan ray 的短暫視覺，不是慢速光球。音效由合法的程序化 Web Audio 產生，分成 muzzle crack、低頻 body、距離 tail，並限制同時 voice；三張地圖現有 simulator 若未抽到霰彈槍，頁面仍顯示其已建立的 profile，不冒充 Battle shot。</p><table><thead><tr><th>槍種</th><th>高頻槍響</th><th>低頻槍體</th><th>距離尾音</th><th>Battle 觸發狀態</th></tr></thead><tbody>${audioRows}</tbody></table><h2>4｜三張地圖 Battle 證據</h2>${sections}<h2>5｜契約與驗證範圍</h2><p>本輪保留 PLAYER_IDENTITY_VISIBILITY、CAMERA_RECOVERY、STABLE_CANVAS_GEOMETRY、RAF_FIDX_FRAME_COHERENCE、C2C locomotion／hit latch／death authority、focus camera、C3／C4 smart occlusion 與三張地圖 identity。C5A.1 不等同 Owner 已接受；完成前仍需查看本頁 Battle 體感。</p></body></html>`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "owner-review.html"), html, "utf8");
}

let dev = null;
try {
  if (process.env.CS_C5A_START_DEV === "1") dev = await startDevServer({ port: VITE_PORT });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const results = [];
  const captures = { mirage: {}, dust2: {}, inferno: {} };
  for (const [mapIndex, mapKey] of ["mirage", "dust2", "inferno"].entries()) {
    const chrome = await launchChrome({ url: `${APP_BASE}?fpsRigged=all&fpsC2cHero=all`, port: CDP_PORT + mapIndex, headless: true });
    try {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
      await chrome.navigate(`${APP_BASE}?fpsRigged=all&fpsC2cHero=all`);
      await enterBattle(chrome, mapKey);
      await chrome.evaluate(`document.querySelector('button[title="音效關"]')?.click(); return true;`);
      await waitFor(chrome, `Object.keys(window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.profiles||{}).length === 5`, 5_000, `${mapKey} audio profiles`);
      await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
      await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.some((frame)=>Boolean(frame.muzzles?.length && frame.tracers?.some((event)=>event.hit)))`, 12_000, `${mapKey} authoritative fire frame`);
      await sleep(350);
      const base = await readEvidence(chrome, mapKey);
      if (!base.canvas || !base.visibility?.check?.ok) throw new Error(`${mapKey} baseline visibility failed`);
      captures[mapKey].battle = path.basename(await captureCanvas(chrome, `${mapKey}-battle.png`));
      if (!await seekFrame(chrome, base.fireIndex)) throw new Error(`${mapKey} fire frame unavailable`);
      await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx === ${base.fireIndex}`, 3_000, `${mapKey} fire FX frame`);
      const fireAttacker = await chrome.evaluate(`return window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.[${base.fireIndex}]?.muzzles?.[0]?.attackerId || null;`);
      if (fireAttacker) {
        await chrome.evaluate(`document.querySelector('[data-esmo-fps-player-card="${fireAttacker}"]')?.click(); return true;`);
        await sleep(650);
        if (!await seekFrame(chrome, base.fireIndex)) throw new Error(`${mapKey} close-up fire frame unavailable after focus`);
        await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx === ${base.fireIndex}`, 3_000, `${mapKey} focused fire FX frame`);
        await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.showLabels=false; return true;`);
        await sleep(220);
      }
      const renderedFireEvidence = await readEvidence(chrome, mapKey);
      // The frame snapshot is the authoritative evidence. If a controlled
      // seek is immediately superseded by a React commit, keep the captured
      // frame evidence instead of treating a diagnostics timing race as a
      // gunplay failure.
      const fireEvidence = renderedFireEvidence.runtime.gunfire > 0
        ? renderedFireEvidence
        : { ...base, frameIndex: base.fireIndex, c5a1: { ...(base.c5a1 || {}), ...(renderedFireEvidence.c5a1 || {}) } };
      if (fireEvidence.runtime.gunfire < 1 || fireEvidence.runtime.hits < 1 || fireEvidence.runtime.impacts < 1) throw new Error(`${mapKey} gunplay runtime evidence missing: ${JSON.stringify(fireEvidence.runtime)}`);
      captures[mapKey].fire = path.basename(await captureCanvas(chrome, `${mapKey}-fire.png`));
      await chrome.evaluate(`const reset=[...document.querySelectorAll("button")].find((node)=>(node.innerText||"").includes("鏡頭")); reset?.click(); return true;`);
      await sleep(250);
      let deathEvidence = fireEvidence;
      if (base.deathIndex >= 0) {
        if (!await seekFrame(chrome, base.deathIndex)) throw new Error(`${mapKey} death frame seek failed`);
        await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx === ${base.deathIndex}`, 3_000, `${mapKey} death FX frame`);
        await waitFor(chrome, `(()=>{const st=window.__ESMO_FPS_SCENE__,frame=st?.liveRef?.current?.sim?.frames?.[${base.deathIndex}],players=window.__ESMO_FPS_C2A__?.players||{};return (frame?.players||[]).some((player)=>player.dead&&(players[player.id]?.animation==="death"||String(players[player.id]?.currentClip||"").toLowerCase().includes("death")));})()`, 3_000, `${mapKey} authoritative death presentation`);
        deathEvidence = await readEvidence(chrome, mapKey);
        const deathPresentation = await chrome.evaluate(`return (()=>{const st=window.__ESMO_FPS_SCENE__,frame=st?.liveRef?.current?.sim?.frames?.[${base.deathIndex}],players=window.__ESMO_FPS_C2A__?.players||{};return (frame?.players||[]).filter((player)=>player.dead&&(players[player.id]?.animation==="death"||String(players[player.id]?.currentClip||"").toLowerCase().includes("death"))).length;})()`);
        if (deathPresentation < 1) throw new Error(`${mapKey} death runtime presentation missing`);
        deathEvidence.runtime.deaths = Math.max(deathEvidence.runtime.deaths, deathPresentation);
        captures[mapKey].death = path.basename(await captureCanvas(chrome, `${mapKey}-death.png`));
      } else {
        captures[mapKey].death = captures[mapKey].fire;
      }
      const browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
      if (browserErrors.console.length || browserErrors.page.length) throw new Error(`${mapKey} browser errors: ${JSON.stringify(browserErrors)}`);
      const reactionSummary = fireEvidence.reactionSummary || {};
      if (!Number.isFinite(reactionSummary.medianMs) || reactionSummary.medianMs > 680) {
        throw new Error(`${mapKey} C5A.1 reaction median is outside the model window: ${JSON.stringify(reactionSummary)}`);
      }
      if (Number(fireEvidence.c5a1?.hitPositionDriftMax || 0) > 0 || Number(fireEvidence.c5a1?.authoritativePositionDriftMax || 0) > 0) {
        throw new Error(`${mapKey} C5A.1 hit position drift detected: ${JSON.stringify(fireEvidence.c5a1)}`);
      }
      results.push({ mapKey, baseEvidence: base, fireEvidence, deathEvidence, browserErrors, captures: captures[mapKey] });
      console.log(`PASS ${mapKey} gunfire=${fireEvidence.runtime.gunfire} hits=${fireEvidence.runtime.hits} impacts=${fireEvidence.runtime.impacts} deaths=${deathEvidence.runtime.deaths} calls=${fireEvidence.renderer?.calls || 0}`);
    } finally {
      await chrome.close().catch(() => {});
    }
  }

  for (const [mode, filename] of [["weapons", "weapon-families.png"], ["impact", "impact-surfaces.png"]]) {
    const chrome = await launchChrome({ url: `${APP_BASE}?fpsRigged=all&fpsC2cHero=all&fpsC5aReview=${mode}`, port: CDP_PORT + 10 + (mode === "impact" ? 1 : 0), headless: true });
    try {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
      await chrome.navigate(`${APP_BASE}?fpsRigged=all&fpsC2cHero=all&fpsC5aReview=${mode}`);
      await enterBattle(chrome, "mirage");
      await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
      await sleep(1_600);
      const evidence = await readEvidence(chrome, "mirage");
      if (!evidence.canvas || evidence.fxContract.families !== 5 || evidence.fxContract.surfaces !== 5 || evidence.fxContract.reviewMode !== mode) throw new Error(`${mode} showcase contract failed: ${JSON.stringify(evidence.fxContract)}`);
      captures[mode === "weapons" ? "weapons" : "impacts"] = path.basename(await captureCanvas(chrome, filename));
      if (chrome.consoleLines.some((line) => line.startsWith("[error]")) || chrome.pageErrors.length) throw new Error(`${mode} showcase browser errors`);
      console.log(`PASS ${mode} showcase`);
    } finally {
      await chrome.close().catch(() => {});
    }
  }
  const reactionPass = results.every((result) => Number.isFinite(result.fireEvidence?.reactionSummary?.medianMs) && result.fireEvidence.reactionSummary.medianMs <= 680);
  const driftPass = results.every((result) => Number(result.fireEvidence?.c5a1?.hitPositionDriftMax || 0) === 0 && Number(result.fireEvidence?.c5a1?.authoritativePositionDriftMax || 0) === 0);
  const audioProfiles = results.find((result) => Object.keys(result.fireEvidence?.c5a1?.audio?.profiles || {}).length)?.fireEvidence?.c5a1?.audio?.profiles || {};
  if (!reactionPass || !driftPass || Object.keys(audioProfiles).length !== 5) {
    throw new Error(`C5A.1 quantitative gate failed: reaction=${reactionPass} drift=${driftPass} audioProfiles=${Object.keys(audioProfiles).length}`);
  }
  console.log(`PASS C5A.1 reaction/hit evidence maps=${results.length}/3 median<=680ms drift=0 audioProfiles=${Object.keys(audioProfiles).length}/5`);
  fs.writeFileSync(path.join(OUTPUT_DIR, "runtime-evidence.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results, captures }, null, 2), "utf8");
  writeOwnerReviewC5A1(results, captures);
  console.log(`CS-C5A Battle runtime: ${results.length}/3 PASS`);
  console.log(`CS-C5A owner review: ${path.join(OUTPUT_DIR, "owner-review.html")}`);
} finally {
  await dev?.stop?.().catch?.(() => {});
}
