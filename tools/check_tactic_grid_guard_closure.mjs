#!/usr/bin/env node
// ============================================================================
//  tools/check_tactic_grid_guard_closure.mjs — 戰術書模板列防護的靜態判斷＋反向測試（秒級）
//
//  2026-11-25 C1＋C2 Release Closure（Owner 核准）。check_moba_experience26「Tactic grid 有 min() 防護」改用
//  tools/lib/tacticGridGuard.mjs 判斷實際生效的位置；本支證明那個判斷式：①對現行原始碼成立 ②任何一層防護被拿掉就不成立。
//  真實版面另由 tools/browser_check_tactic_grid_narrow.mjs 量測。
//  執行：repo 根目錄 `node tools/check_tactic_grid_guard_closure.mjs`
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const { tacticGridGuard } = await import(pathToFileURL(path.join(ROOT, "tools/lib/tacticGridGuard.mjs")).href);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const real = {
  tacticScreen: read("src/screens/moba/TacticScreen.jsx"),
  templateStrip: read("src/screens/moba/tacticBook/TemplateStrip.jsx"),
  css: read("src/screens/moba/tacticBook/tacticBook.css"),
};
const A = [];
const ck = (n, ok, d = "") => { A.push([n, !!ok]); console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const swap = (key, from, to) => {
  const n = real[key].split(from).length - 1;
  if (n !== 1) throw new Error(`mutation anchor not unique in ${key}: ${from} (${n})`);
  return { ...real, [key]: real[key].replace(from, to) };
};

const r = tacticGridGuard(real);
ck("現行原始碼：模板列防護成立（桌機 grid min()、≤720px 卡片 min()、列內可捲動、畫面確實使用 TemplateStrip 與 tacticBook.css）", r.ok, JSON.stringify(r.parts));

const mutants = [
  ["拿掉桌機 grid 的 min()（minmax(205px,1fr)）", swap("css", "minmax(min(205px, 100%), 1fr)", "minmax(205px, 1fr)")],
  ["手機卡片改成固定寬（flex: 0 0 250px）", swap("css", "flex: 0 0 min(74%, 250px)", "flex: 0 0 250px")],
  ["手機模板列拿掉橫向捲動", swap("css", "display: flex; overflow-x: auto;", "display: flex;")],
  ["畫面不再使用 TemplateStrip", { ...real, tacticScreen: real.tacticScreen.replace(/<TemplateStrip\b/g, "<div") }],
  ["畫面不再載入 tacticBook.css", swap("tacticScreen", 'import "./tacticBook/tacticBook.css";', "")],
  ["模板列 className 改名（樣式失效）", { ...real, templateStrip: real.templateStrip.replace(/tbx-tpl-row/g, "tbx-row-x") }],
  ["只把防護寫在註解裡（真正規則已移除）", swap("css", ".tbx-tpl-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(205px, 100%), 1fr)); gap: 9px; }",
    "/* .tbx-tpl-row { grid-template-columns: repeat(auto-fill, minmax(min(205px, 100%), 1fr)); } */ .tbx-tpl-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); gap: 9px; }")],
];
for (const [label, src] of mutants) {
  const m = tacticGridGuard(src);
  ck(`反向測試「${label}」⇒ 判斷式不成立`, m.ok === false, JSON.stringify(Object.fromEntries(Object.entries(m.parts).filter(([, v]) => !v))));
}

const pass = A.filter(([, ok]) => ok).length;
console.log(`\nTactic Grid Guard Closure：${pass}/${A.length} ${pass === A.length ? "PASS" : "FAIL"}`);
process.exit(pass === A.length ? 0 : 1);
