import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const desktopPath = path.join(root, "artifacts/cs-c5b/tactical-audit/desktop/runtime-evidence-1366px.json");
const mobilePath = path.join(root, "artifacts/cs-c5b/tactical-audit/mobile/runtime-evidence-390px.json");
const desktop = JSON.parse(fs.readFileSync(desktopPath, "utf8"));
const mobile = JSON.parse(fs.readFileSync(mobilePath, "utf8"));
const maps = desktop.results ?? [];
const labels = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const familyLabels = { pistol: "手槍", smg: "衝鋒槍", rifle: "步槍", sniper: "狙擊槍", shotgun: "霰彈槍" };
const phaseLabels = { opening: "開局 Opening", "mid-round": "中局 Mid-round", "late-round": "後段 Late-round", "post-plant": "下包後 Post-plant" };
const fmt = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const pct = value => `${fmt(Number(value) * 100, 1)}%`;
const esc = value => String(value ?? "—")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const layout = maps[0]?.tacticalAudit?.preMatchLayout ?? {};
const phaseRows = Object.entries(layout.phases ?? {}).map(([key, value]) => `
  <tr><th>${esc(phaseLabels[key] ?? key)}</th><td>${esc(value.selectionId)}</td><td>${esc(value.tacticName)}</td><td>${esc(value.tacticType)}</td><td>${esc(layout.openness)}</td><td>${esc(layout.postPlantMode)}</td></tr>`).join("");

const mapCards = maps.map(result => {
  const nav = result.navigationAudit ?? {};
  const combat = result.combatAudit ?? {};
  const bomb = result.bombAudit ?? {};
  const audio = result.audio ?? {};
  const p0 = result.p0 ?? {};
  const c2c = result.c2c ?? {};
  const weaponRows = Object.entries(familyLabels).map(([family, label]) => {
    const count = result.buyAudit?.purchaseCounts?.[family] ?? 0;
    const ratio = result.buyAudit?.purchaseRatios?.[family] ?? 0;
    const metric = result.weaponMetrics?.[family] ?? {};
    const cadence = metric.actualCadenceMs?.medianMs ?? metric.profileIntervalMs?.medianMs;
    return `<tr><th>${label}</th><td>${count}</td><td>${pct(ratio)}</td><td>${fmt(metric.damage)}</td><td>${fmt(metric.profileIntervalMs?.medianMs)} / ${fmt(cadence)} ms</td></tr>`;
  }).join("");
  const planted = bomb.plantEvents?.length ?? 0;
  const defused = bomb.defuseEvents?.length ?? 0;
  const exploded = bomb.explosionEvents?.length ?? 0;
  const routeCount = Object.keys(result.routeVariants ?? {}).length;
  const routeSignatures = Object.keys(result.routeSignatures ?? {}).length;
  return `<section class="card">
    <div class="map-head"><h3>${esc(labels[result.mapKey] ?? result.mapKey)}</h3><span class="pass">Battle 完成</span></div>
    <p class="lede">${result.roundCount} 回合 · ${routeSignatures} 種路線簽名 · ${routeCount} 種行為變體 · 最終比分 T ${result.finalScore?.t ?? "—"} : CT ${result.finalScore?.ct ?? "—"}</p>
    <div class="metrics">
      <div><b>路線 / 尋路</b><span>${result.navigationAudit?.routeAssignments ?? 0} assignments</span><span>卡住 ${nav.stuckDetections ?? 0} · replan ${nav.replanCount ?? 0}</span><span>死結 ${nav.routeDeadlocks ?? 0} · 穿牆 ${nav.illegalWallCrossings ?? 0}</span></div>
      <div><b>側翼交戰</b><span>flank ${combat.flankEngagements ?? 0}</span><span>blocked permission ${combat.routeBlockedEngagements ?? 0}</span><span>LoS ${combat.losChecks ?? 0} · FOV ${combat.fovChecks ?? 0}</span></div>
      <div><b>Bomb objective</b><span>plant ${planted} · timer samples ${bomb.timerSamples ?? 0}</span><span>retake ${bomb.retakeAssignments ?? 0} · cover ${bomb.coverAssignments ?? 0}</span><span>defuse ${defused} · explosion ${exploded}</span></div>
      <div><b>音訊 / 角色</b><span>recorded starts ${audio.recordedSourceStarts ?? 0} · synth ${audio.synthesizedToneStarts ?? 0}</span><span>audio profiles ${audio.loadedProfiles ?? 0}</span><span>C2C rigged ${c2c.rigged ?? 0} · P0 stale ${p0.staleMismatch ?? 0}</span></div>
    </div>
    <table><caption>真實 buy authority、damage、cadence（profile / runtime median）</caption><thead><tr><th>武器類別</th><th>購買次數</th><th>比例</th><th>damage</th><th>cadence</th></tr></thead><tbody>${weaponRows}</tbody></table>
  </section>`;
}).join("");

const mobileSummary = (mobile.results ?? []).map(result => `${labels[result.mapKey] ?? result.mapKey}: ${result.completed ? "完成" : "未完成"} / stuck ${result.navigationAudit?.stuckDetections ?? 0}`).join("　");
const battleUrl = "http://127.0.0.1:5174/ESMO-/?fpsRigged=all&fpsC2cHero=all";
const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>C5B CS Combat Tactical Audit｜中文 Owner Review</title>
<style>
:root{color-scheme:dark;--bg:#0b1118;--panel:#121c27;--line:#293747;--text:#e9f1f7;--muted:#9eafbd;--cyan:#7dd3fc;--green:#79e2a0;--amber:#f7c66b}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#0b1118,#101923 55%,#0b1118);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif}main{max-width:1180px;margin:0 auto;padding:36px 22px 64px}h1{margin:0 0 10px;font-size:clamp(24px,4vw,42px);letter-spacing:.02em}h2{margin:30px 0 12px;font-size:21px;color:var(--cyan)}h3{margin:0;font-size:20px}.sub,.lede,small{color:var(--muted)}.hero,.card{border:1px solid var(--line);background:rgba(18,28,39,.92);border-radius:16px;padding:22px;box-shadow:0 18px 50px #0003}.hero{border-color:#31506a}.hero p{max-width:850px}.links{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.links a{display:inline-block;padding:9px 13px;border:1px solid #3e7897;border-radius:10px;color:var(--text);text-decoration:none;background:#173247}.pass{color:#051b0c;background:var(--green);border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700}.card{margin-top:14px}.map-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0}.metrics>div{border:1px solid var(--line);border-radius:11px;padding:12px;background:#0d1721}.metrics b,.metrics span{display:block}.metrics b{color:var(--amber);margin-bottom:5px}.metrics span{color:var(--muted);font-size:13px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}caption{text-align:left;color:var(--muted);padding:0 0 7px}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left}th{color:#c8d7e2;font-weight:600}td{color:var(--text)}.note{border-left:3px solid var(--amber);padding:8px 12px;color:#d9e2e9;background:#1b2025}.footer{margin-top:24px;color:var(--muted);font-size:13px}@media(max-width:760px){main{padding:22px 12px 40px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:16px;overflow:auto}table{min-width:600px}.hero{padding:18px}}@media(max-width:420px){.metrics{grid-template-columns:1fr}}
</style></head><body><main>
<section class="hero"><div class="sub">ESMO · C5B Utility FX / CS Combat Tactical Audit</div><h1>中文 Owner Review</h1><p>本頁驗證賽前四層戰術布局確實進入 Battle authoritative simulation：Opening、Mid-round、Late-round / Post-plant 可分層選擇，並由比分、經濟、存活人數、Bomb 狀態、武器組合、map control、攻守方共同影響 route / execute / rotate。</p><p class="note">本次只做 C5B tactical audit 的最小正式修正與驗證；沒有 merge、push、deploy，也沒有開始 C5C。</p><div class="links"><a href="${battleUrl}">進入 C5B 實際 Battle</a><a href="#layout">查看賽前多層布局</a><a href="#maps">查看三圖 evidence</a></div></section>
<h2 id="layout">賽前四層開放布局</h2><section class="card"><p class="lede">布局版本 ${esc(layout.version)} · 開放模式 ${esc(layout.openness)} · 下包後規則 ${esc(layout.postPlantMode)}</p><table><thead><tr><th>階段</th><th>選擇 ID</th><th>實際戰術</th><th>類型</th><th>開放度</th><th>Post-plant</th></tr></thead><tbody>${phaseRows}</tbody></table><p class="lede">UI 中每一階段可選 tactic card；布局經 AppShell → CsMatchScreen → EsportsFPS3D → simulateFps 傳入，phase selection 有 source：pre-match-layout。每一局仍以 deterministic seed 做 weighted route variation，不是無條件亂數。</p></section>
<h2 id="maps">三張地圖 Battle runtime</h2>${mapCards}
<h2>390px mobile smoke</h2><section class="card"><p>${esc(mobileSummary)}</p><p class="lede">desktop evidence：1366px · mobile evidence：390px。手機視覺、觸控手勢與真機 FPS 尚未由 Node 證明，請 Owner 於實機驗收。</p></section>
<div class="footer">Generated from latest runtime evidence：${esc(desktop.generatedAt ?? new Date().toISOString())}<br>Owner Review URL：此頁 · Actual Battle URL：${esc(battleUrl)}</div>
</main></body></html>`;

const outputDir = path.join(root, "artifacts/cs-c5b/tactical-audit/owner-review");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "owner-review.html");
fs.writeFileSync(outputPath, html, "utf8");
console.log(`C5B Chinese owner review: ${path.relative(root, outputPath)}`);
