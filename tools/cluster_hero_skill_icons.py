"""Cluster the existing 500 SVG icons by the same grayscale edge signature used by the visual audit.

This is an analysis pass only: it never writes or regenerates an icon.  The threshold is
the existing visual audit's cross-hero near threshold, so the pair count can be compared
directly with icon-visual-audit.json.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def cluster_pairs(rows, pairs):
    parent = {row["id"]: row["id"] for row in rows}

    def find(item):
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for pair in pairs:
        union(pair["a"], pair["b"])
    grouped = {}
    for row in rows:
        grouped.setdefault(find(row["id"]), []).append(row)
    return sorted(grouped.values(), key=lambda group: (-len(group), group[0]["id"]))


parser = argparse.ArgumentParser()
parser.add_argument("--base", default="http://127.0.0.1:5173/ESMO-/")
parser.add_argument("--output", default="tmp/moba-skill-talent-owner-review/icon-clusters-before.json")
parser.add_argument("--threshold", type=int, default=36)
parser.add_argument("--expect-pairs", type=int, default=None)
args = parser.parse_args()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 800, "height": 600})
    page.goto(args.base, wait_until="networkidle", timeout=90000)
    result = page.evaluate("""async ({ threshold }) => {
      const { CHAMPIONS_100 } = await import('/ESMO-/src/data/heroDatabase.js');
      const rows = [];
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      for (const hero of CHAMPIONS_100) for (const slot of ['P','Q','W','E','R']) {
        const id = `${hero.id}:${slot}`;
        const img = new Image();
        img.src = `/ESMO-/assets/skill-icons/v1/${hero.id}/${slot.toLowerCase()}.svg`;
        await img.decode();
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(img, 16, 16, 96, 96, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        const lum = new Float64Array(1024);
        for (let i = 0; i < 1024; i++) lum[i] = .2126 * data[i * 4] + .7152 * data[i * 4 + 1] + .0722 * data[i * 4 + 2];
        const edges = [];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          let value = 0;
          for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
            const px = x * 2 + xx, py = y * 2 + yy, index = py * 32 + px;
            value += Math.abs(lum[index] - lum[py * 32 + Math.min(31, px + 1)])
              + Math.abs(lum[index] - lum[Math.min(31, py + 1) * 32 + px]);
          }
          edges.push(value / 4);
        }
        const ranked = edges.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value || a.index - b.index);
        const bits = new Array(256).fill(0);
        for (const item of ranked.slice(0, 64)) bits[item.index] = 1;
        rows.push({ id, hero: hero.zh, arch: hero.arch, slot, name: hero.skills[slot].name, bits });
      }
      const pairs = [];
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].id.split(':')[0] === rows[j].id.split(':')[0]) continue;
        let distance = 0;
        for (let k = 0; k < 256; k++) distance += rows[i].bits[k] !== rows[j].bits[k];
        if (distance <= threshold) pairs.push({ distance, a: rows[i].id, b: rows[j].id });
      }
      pairs.sort((a, b) => a.distance - b.distance || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
      return { icons: rows.length, threshold, pairs, rows: rows.map(({ bits, ...row }) => row) };
    }""", {"threshold": args.threshold})
    browser.close()

rows_by_id = {row["id"]: row for row in result["rows"]}
clusters = cluster_pairs(result["rows"], result["pairs"])
pair_by_id = {}
for pair in result["pairs"]:
    pair_by_id.setdefault(pair["a"], []).append(pair)
    pair_by_id.setdefault(pair["b"], []).append(pair)

cluster_rows = []
for index, cluster in enumerate(clusters, start=1):
    ids = {row["id"] for row in cluster}
    cluster_pairs_for_group = [pair for pair in result["pairs"] if pair["a"] in ids and pair["b"] in ids]
    min_distance = min((pair["distance"] for pair in cluster_pairs_for_group), default=None)
    cluster_rows.append({
        "cluster": index,
        "size": len(cluster),
        "minDistance": min_distance,
        "members": [{"id": row["id"], "hero": row["hero"], "slot": row["slot"], "name": row["name"]} for row in cluster],
        "pairs": cluster_pairs_for_group,
    })

output = {
    "method": "grayscale-edge-bit-hamming-union-find",
    "threshold": args.threshold,
    "icons": result["icons"],
    "candidatePairs": len(result["pairs"]),
    "clusterCount": len(cluster_rows),
    "clusters": cluster_rows,
}
output_path = Path(args.output)
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "icons": output["icons"],
    "candidatePairs": output["candidatePairs"],
    "clusterCount": output["clusterCount"],
    "largestClusters": [{"cluster": c["cluster"], "size": c["size"], "minDistance": c["minDistance"]} for c in cluster_rows[:12]],
    "output": str(output_path),
}, ensure_ascii=False, indent=2))
if output["icons"] != 500:
    raise SystemExit("cluster pass did not load all 500 icons")
if args.expect_pairs is not None and output["candidatePairs"] != args.expect_pairs:
    raise SystemExit(f"cluster pair count {output['candidatePairs']} != expected {args.expect_pairs}")
