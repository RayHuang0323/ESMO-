#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const renderer = fs.readFileSync(path.join(root, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const checks = [];
const check = (label, condition, detail = "") => {
  const ok = Boolean(condition);
  checks.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

const expected = {
  armor: ["防彈衣", "減少身體受到的子彈傷害。"],
  helmet: ["頭盔", "降低頭部被子彈命中時的傷害。"],
  grenade: ["高爆手榴彈", "爆炸後對範圍內敵人造成傷害。"],
  flash: ["閃光彈", "使範圍內敵人短暫失去視線。"],
  smoke: ["煙霧彈", "在指定位置形成煙霧，遮擋視線。"],
  molly: ["燃燒彈", "在地面留下持續傷害區域。"],
  c4: ["C4", "此選手目前攜帶炸彈。"],
  weapon: ["武器", "此選手目前持有的主要武器。"],
  hp: ["生命值", "目前生命值；血條越長代表越健康。"],
  money: ["金錢", "可用於下一回合購買武器與裝備。"],
};

for (const [type, [label, description]] of Object.entries(expected)) {
  check(`${type} has canonical Chinese semantic`, renderer.includes(`${type}:{label:"${label}",description:"${description}"`));
}

check("GameIcon is the reusable IconHelp implementation", /function GameIcon\(/.test(renderer) && /function IconHelp\(props\)\{return <GameIcon/.test(renderer) && /function SemanticIcon/.test(renderer));
check("contract declares desktop and mobile interactions", /GAME_ICON_CONTRACT=Object\.freeze/.test(renderer) && /desktop-hover/.test(renderer) && /desktop-focus/.test(renderer) && /mobile-tap/.test(renderer) && /mobile-long-press/.test(renderer));
check("icons expose stable type and expanded state", /data-cs-icon-type=\{type\}/.test(renderer) && /aria-expanded=\{open\}/.test(renderer) && /role="button"/.test(renderer));
check("desktop hover and focus open, close paths are wired", /onMouseEnter=\{\(\)=>\{if\(pointerType\.current!=="touch"&&pointerType\.current!=="pen"\)setOpen\(true\);\}\}/.test(renderer) && /onMouseLeave=\{\(\)=>\{clearTimer\(\);if\(pointerType\.current!=="touch"&&pointerType\.current!=="pen"\)setOpen\(false\);\}\}/.test(renderer) && /onFocus=\{\(\)=>\{/.test(renderer) && /onBlur=\{\(\)=>\{/.test(renderer));
check("mobile tap and long press share one GameIcon state", /touchHandled=useRef/.test(renderer) && /longPress=useRef/.test(renderer) && /setTimeout\(\(\)=>\{longPress\.current=true;setOpen\(true\);\},420\)/.test(renderer) && /touchHandled\.current=true;setOpen\(value=>!value\)/.test(renderer));
check("tooltip has accessible role and can never capture input", /role="tooltip"/.test(renderer) && /pointerEvents:"none"/.test(renderer));
// The card owns `overflow:"visible"`; the tooltip itself uses normal wrapping.
// Matching the two style declarations as adjacent text made this gate reject
// the valid card layout after the tooltip gained readable multi-line copy.
check("player card allows tooltip to escape inventory row", /data-esmo-fps-player-card=\{p\.id\}[\s\S]*?position:"relative",overflow:"visible"/.test(renderer) && /data-testid="cs-player-controls"/.test(renderer));
check("all ten gameplay types are wired from canonical player state", Object.keys(expected).every((type) => renderer.includes(`type="${type}"`)) && /p\.armor/.test(renderer) && /p\.helmet/.test(renderer) && /nf\.includes\("he"\)/.test(renderer) && /p\.hasBomb/.test(renderer) && /p\.money/.test(renderer));
check("no abstract single-character card icon labels remain", !/label:"[⚡💥🔫🛡️]"/.test(renderer));

const passed = checks.filter((item) => item.ok).length;
console.log(`CS-C5C icon help gate: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
