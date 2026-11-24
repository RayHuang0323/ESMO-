const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
for (let i = 0; i < 90; i++) {
  if (document.querySelector('[data-testid="confirm-draft"]')) { log.push("confirm@" + i); break; }
  const c = document.querySelector('[data-testid="hero-choose"]');
  if (c && /輪到你/.test(document.body.innerText)) { log.push(c.dataset.hero); c.click(); await sl(900); continue; }
  await sl(800);
}
const cf = document.querySelector('[data-testid="confirm-draft"]');
return JSON.stringify({ log, confirm: !!cf, picks: (document.body.innerText.match(/出戰配置 \d\/5/) || [""])[0] });
