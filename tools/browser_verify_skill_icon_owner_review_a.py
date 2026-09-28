"""Verify that every accepted Owner Review A pair is above the near threshold."""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "tmp" / "moba-skill-talent-owner-review"
ranking = json.loads((REVIEW / "owner-review-ranking.json").read_text(encoding="utf-8"))
a_rows = [row for row in ranking["items"] if row["category"] == "A"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 800, "height": 600})
    page.goto("http://127.0.0.1:5173/ESMO-/", wait_until="networkidle", timeout=90000)
    result = page.evaluate(
        """async (aRows) => {
          const { CHAMPIONS_100 } = await import('/ESMO-/src/data/heroDatabase.js');
          const rows = [];
          const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          for (const hero of CHAMPIONS_100) for (const slot of ['P','Q','W','E','R']) {
            const img = new Image(); img.src = `/ESMO-/assets/skill-icons/v1/${hero.id}/${slot.toLowerCase()}.svg`;
            await img.decode();
            ctx.clearRect(0, 0, 32, 32); ctx.drawImage(img, 16, 16, 96, 96, 0, 0, 32, 32);
            const data = ctx.getImageData(0, 0, 32, 32).data;
            const lum = new Float64Array(1024);
            for (let i = 0; i < 1024; i++) lum[i] = .2126 * data[i*4] + .7152 * data[i*4+1] + .0722 * data[i*4+2];
            const edges = [];
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
              let v = 0;
              for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
                const px = x * 2 + xx, py = y * 2 + yy, i = py * 32 + px;
                v += Math.abs(lum[i] - lum[py * 32 + Math.min(31, px + 1)])
                  + Math.abs(lum[i] - lum[Math.min(31, py + 1) * 32 + px]);
              }
              edges.push(v / 4);
            }
            const bits = new Array(256).fill(0);
            for (const row of edges.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i).slice(0, 64)) bits[row.i] = 1;
            rows.push({ id: `${hero.id}:${slot}`, bits });
          }
          const byId = new Map(rows.map((row) => [row.id, row]));
          const pairs = aRows.map((item) => {
            const a = byId.get(item.a.id), b = byId.get(item.b.id);
            let distance = 0;
            for (let i = 0; i < 256; i++) distance += a.bits[i] !== b.bits[i];
            return { group: item.group, cluster: item.cluster, a: item.a.id, b: item.b.id,
              beforeDistance: item.distance, afterDistance: distance, resolved: distance > 36 };
          });
          return { icons: rows.length, pairs, unresolved: pairs.filter((pair) => !pair.resolved) };
        }""",
        a_rows,
    )
    report = REVIEW / "icon-owner-review-audit.json"
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "icons": result["icons"],
        "aGroups": len(result["pairs"]),
        "resolved": len(result["pairs"]) - len(result["unresolved"]),
        "unresolved": result["unresolved"],
        "report": str(report),
    }, ensure_ascii=False, indent=2))
    if result["icons"] != 500 or result["unresolved"]:
        raise SystemExit(1)
    browser.close()
