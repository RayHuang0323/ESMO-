const sl = (ms) => new Promise((r) => setTimeout(r, ms));
const r = document.querySelector('input[aria-label="重播時間軸"]');
if (!r) return JSON.stringify({ error: "no range" });
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
const seen = new Map();
const pts = [];
const lo = Math.max(__FROM__, Number(r.min)), hi = Math.min(__TO__, Number(r.max)); for (let s = lo; s <= hi; s += 2) pts.push(s); pts.push(hi);
for (const s of pts) {
  set.call(r, String(s));
  r.dispatchEvent(new Event("input", { bubbles: true }));
  r.dispatchEvent(new Event("change", { bubbles: true }));
  await sl(25);
  for (const e of document.querySelectorAll('[data-testid="replay-event-text"]')) {
    const row = e.parentElement ? e.parentElement.innerText.trim() : e.innerText.trim();
    if (!seen.has(row)) seen.set(row, s);
  }
}
return JSON.stringify({ min: r.min, max: r.max, n: seen.size, rows: [...seen.keys()] });
