// ============================================================================
//  tools/lib/tacticGridGuard.mjs — 戰術書模板列「窄容器不溢出」防護的靜態判斷（單一來源）
//
//  為什麼有這支（2026-11-25，C1＋C2 Release Closure，Owner 核准）：
//    check_moba_experience26 原本只在 TacticScreen.jsx 找字面 `minmax(min(190px,100%),1fr)`。
//    11-11 戰術書改版（503e1b95）把模板列搬到 TemplateStrip ＋ tacticBook.css 的 `.tbx-tpl-row`，
//    防護本身還在（桌機 grid：minmax(min(205px,100%),1fr)；≤720px：每張卡 min(74%,250px)、列內橫向捲動），
//    但舊字面不見了 ⇒ 該斷言從 11-11 起一直紅。判準意義不變：模板 grid 必須有 min(…,100%) 這類防護。
//    本模組讓 experience26 與 check_tactic_grid_guard_closure（含故意移除防護的反向測試）共用同一個判斷，避免兩份各自漂移。
//    行為面（真實版面量測）另由 tools/browser_check_tactic_grid_narrow.mjs 驗 180px 容器與 320／390 寬度。
//
//  輸入是三份原始碼字串，回傳 { ok, parts }；不讀檔、沒有副作用，方便對故意改壞的副本做反向測試。
// ============================================================================

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 找出 `selector { ... }` 的宣告內容（第一個符合者）；找不到回傳 null。 */
function ruleBody(css, selectorRe) {
  const re = new RegExp(selectorRe.source + "\\s*\\{([^}]*)\\}");
  const m = css.match(re);
  return m ? m[1] : null;
}

export function tacticGridGuard({ tacticScreen, templateStrip, css }) {
  const ts = stripJsComments(String(tacticScreen ?? ""));
  const strip = stripJsComments(String(templateStrip ?? ""));
  const c = stripCssComments(String(css ?? ""));
  const mediaAt = c.search(/@media\s*\(\s*max-width:\s*720px\s*\)/);
  const top = mediaAt >= 0 ? c.slice(0, mediaAt) : c;
  const media = mediaAt >= 0 ? c.slice(mediaAt) : "";

  const desktopRow = ruleBody(top, /(?:^|\})\s*\.tbx-tpl-row/);
  const desktopMin = desktopRow != null &&
    /grid-template-columns:\s*repeat\(\s*auto-(?:fill|fit)\s*,\s*minmax\(\s*min\(\s*\d+(?:\.\d+)?px\s*,\s*100%\s*\)\s*,\s*1fr\s*\)\s*\)/.test(desktopRow);

  const mobileCard = ruleBody(media, /\.tbx-tpl-row\s*>\s*\.tbx-tpl/);
  const pct = mobileCard && mobileCard.match(/flex:\s*0\s+0\s+min\(\s*(\d+(?:\.\d+)?)%\s*,\s*\d+(?:\.\d+)?px\s*\)/);
  const mobileMin = !!pct && Number(pct[1]) <= 100;
  const mobileRow = ruleBody(media, /(?:^|\{|\})\s*\.tbx-tpl-row(?=\s*\{)/);
  const mobileScroll = mobileRow != null && /overflow-x:\s*(auto|scroll)/.test(mobileRow);

  const parts = {
    screenUsesStrip: /<TemplateStrip\b/.test(ts),
    screenImportsCss: /import\s+["']\.\/tacticBook\/tacticBook\.css["']/.test(ts),
    stripUsesRow: /tbx-tpl-row/.test(strip) && /className="tbx-tpl"/.test(strip),
    desktopMin, mobileMin, mobileScroll,
  };
  return { ok: Object.values(parts).every(Boolean), parts };
}
