// 產生 src/battle/moba/heroPowerCurveTable.js（Hero Power Curve v1 的字面表）。
//   node tools/gen_hero_power_curve.mjs          寫檔
//   node tools/gen_hero_power_curve.mjs --check  只比對（gate 用；有漂移 ⇒ exit 1）
// 推導規則在 src/battle/moba/heroPowerCurveDerive.js；正式對戰只讀字面表（受模擬語意指紋保護）。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { CHAMPIONS_100 } = await imp('src/data/heroDatabase.js');
const { passiveRuleOf } = await imp('src/battle/moba/skills/heroPassiveGameplay.js');
const { deriveHeroPowerCurves } = await imp('src/battle/moba/heroPowerCurveDerive.js');

const derived = deriveHeroPowerCurves(CHAMPIONS_100, passiveRuleOf);
const body = Object.entries(derived)
  .map(([id, v]) => `  ${id}: Object.freeze({ curve: Object.freeze([${v.curve.join(', ')}]), reasons: Object.freeze(${JSON.stringify(v.reasons)}) }),`)
  .join('\n');
const text = `// ⚠ 產生檔——請勿手改。來源：tools/gen_hero_power_curve.mjs ＋ src/battle/moba/heroPowerCurveDerive.js
//   curve＝前期／中期／後期強度（1–5 分）；reasons＝推導依據（UI 顯示用）。
//   heroDatabase 不在模擬語意指紋內 ⇒ 推導結果以字面值落在這裡（此檔在指紋清單內），gate 以 --check 驗證沒有漂移。
export const HERO_POWER_CURVE_TABLE = Object.freeze({
${body}
});
`;
const file = path.join(ROOT, 'src/battle/moba/heroPowerCurveTable.js');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const same = cur.replace(/\r\n/g, '\n') === text;
  console.log(same ? 'heroPowerCurveTable：與推導一致' : 'heroPowerCurveTable：與推導不一致（請重跑產生器並檢視差異）');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(file, text);
console.log(`wrote ${Object.keys(derived).length} heroes → ${path.relative(ROOT, file)}`);
