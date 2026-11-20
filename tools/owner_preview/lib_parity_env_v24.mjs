// ============================================================================
//  tools/owner_preview/lib_parity_env_v24.mjs — v24 Calibration Sprint：量測環境的宣告與驗證（2026-11-20；量測工具，不改引擎）
//
//  Owner 決策一（2026-11-20）：v24 的戰術平衡與正式驗收一律用 Career-Parity 環境（英雄技能、被動、成長曲線開啟）。
//  天賦＝「無天賦基準」與「有天賦」兩層，分開統計、不得混合。歷史 No-Skills 基準保留，只標註適用環境。
//
//  用法（順序很重要：平衡工具在「載入時」讀環境變數）：
//    const { applyEnv } = await import("./lib_parity_env_v24.mjs");
//    applyEnv("parity");                                   // 一定要在 import pin_v20_v23_stream／balance runner 之前
//    const P = await import("./pin_v20_v23_stream.mjs");
//    const e = P.build(...);  assertEnv(describeEngine(e, rulesetId), "parity", "tool");   // 不符 ⇒ 丟錯（正式驗證直接 FAIL）
// ============================================================================

export const ENVS = Object.freeze({
  //  歷史基準：v24 Sprint 1～Preflight 的工具路徑都是這個（只用來重現與對照，不再當正式驗收環境）
  noskills: Object.freeze({ label: "No-Skills（歷史基準）", formal: false, env: { ESMO_BALANCE_SKILLS: "", ESMO_BALANCE_TALENTS: "" }, tool: { skills: false, passives: false, curve: false, talents: false } }),
  parity: Object.freeze({ label: "Career-Parity（無天賦）", formal: true, env: { ESMO_BALANCE_SKILLS: "on", ESMO_BALANCE_TALENTS: "" }, tool: { skills: true, passives: true, curve: true, talents: false } }),
  parity_talents: Object.freeze({ label: "Career-Parity（有天賦）", formal: true, env: { ESMO_BALANCE_SKILLS: "on", ESMO_BALANCE_TALENTS: "on" }, tool: { skills: true, passives: true, curve: true, talents: true } }),
});
//  生涯路徑（正式規則集）一律開技能、被動、成長、天賦、選手能力（藍方）；不受上面的環境變數影響
export const CAREER_EXPECT = Object.freeze({ skills: true, passives: true, curve: true, talents: true, playerStats: true });

let applied = null;
/** 設定平衡工具的環境變數。必須在第一次 import 平衡工具之前呼叫；同一個行程不能換環境。 */
export function applyEnv(name) {
  const S = ENVS[name];
  if (!S) throw new Error(`parity_env_unknown: ${name}`);
  if (applied && applied !== name) throw new Error(`parity_env_switch: ${applied} -> ${name} in one process (the balance runner caches modules at load)`);
  for (const [k, v] of Object.entries(S.env)) { if (v) process.env[k] = v; else delete process.env[k]; }
  applied = name;
  return S;
}
export const appliedEnv = () => applied;

/** 從引擎讀出實際生效的設定（只讀）。 */
export function describeEngine(e, rulesetId) {
  return {
    rulesetId, variant: e._tacExecVariant ?? null,
    skills: !!e.heroSkillsOn, passives: !!e.heroPassivesOn, curve: !!e.powerCurveOn,
    talents: Object.keys(e.heroBattleTalents ?? {}).length > 0,
    playerStats: !!e.playerStatsOn, layout: e.objectiveLayout ?? null,
  };
}

/** 實際設定與宣告的環境不符 ⇒ 丟錯。path＝"tool"｜"career"。layout（可省略）＝要求的佈局。 */
export function assertEnv(desc, envName, path, { layout = null, variant = null } = {}) {
  const S = ENVS[envName];
  if (!S) throw new Error(`parity_env_unknown: ${envName}`);
  const want = path === "career" ? CAREER_EXPECT : { ...S.tool, playerStats: false };
  const bad = Object.entries(want).filter(([k, v]) => desc[k] !== v).map(([k, v]) => `${k}=${desc[k]} (want ${v})`);
  if (layout && desc.layout !== layout) bad.push(`layout=${desc.layout} (want ${layout})`);
  if (variant && desc.variant !== variant) bad.push(`variant=${desc.variant} (want ${variant})`);
  if (bad.length) throw new Error(`parity_env_mismatch[${envName}/${path}]: ${bad.join(", ")}`);
  return desc;
}
