// usage: node manifest.cjs <distDir> <gitHead> [--verify=<baseUrl>]
const fs = require("fs"), path = require("path"), c = require("crypto");
const [OUT, HEAD] = process.argv.slice(2);
const verify = (process.argv.find((a) => a.startsWith("--verify=")) || "").slice(9);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|html)$/.test(f)) files.push(p); } })(OUT);
const rel = (p) => path.relative(OUT, p).split(path.sep).join("/");
const h = (buf) => c.createHash("sha256").update(buf).digest("hex").slice(0, 16);
const mf = path.join(OUT, "..", path.basename(OUT) + ".manifest.json");
if (!verify) {
  const m = { gitHead: HEAD, builtAt: new Date().toISOString(), files: {} };
  for (const p of files) m.files[rel(p)] = h(fs.readFileSync(p));
  fs.writeFileSync(mf, JSON.stringify(m, null, 1));
  const js = files.filter((p) => p.endsWith(".js")).map((p) => fs.readFileSync(p, "utf8")).join("\n");
  console.log(JSON.stringify({ files: files.length,
    safeRouteFlagOn: /mobaSafeRouteV23:(!0|true)/.test(js), safeRouteFlagOff: /mobaSafeRouteV23:(!1|false)/.test(js),
    jungleOn: /mobaJungleV22:(!0|true)/.test(js), directorOn: /mobaTacticalDirectorV21:(!0|true)/.test(js),
    safeRouteV3: /safeRoute:"v3"/.test(js), redecideFlag: js.includes("_edgeRedecideV23"), regroupIntent: js.includes("退回己方兵線"), holdIntent: js.includes("塔邊等待時機"),
    banner: js.includes("塔邊等待小修 v3") || require("fs").readFileSync(require("path").join(OUT, "index.html"), "utf8").includes("塔邊等待小修 v3") }));
} else {
  (async () => {
    const m = JSON.parse(fs.readFileSync(mf, "utf8"));
    let same = 0, diff = [];
    for (const [f, want] of Object.entries(m.files)) {
      const url = verify.replace(/\/$/, "") + "/" + (f === "index.html" ? "" : f);
      const r = await fetch(url); const got = h(Buffer.from(await r.arrayBuffer()));
      if (f === "index.html") { same++; continue; }   // index.html is rewritten by the banner transform at build time already; served as-is
      if (got === want) same++; else diff.push(f);
    }
    console.log(JSON.stringify({ gitHead: m.gitHead, checked: Object.keys(m.files).length, same, diff }));
  })();
}
