/**
 * BattleResult schema authority.
 *
 * BattleResult.v2 is kept as a readable legacy payload because season/history
 * and local replay data can outlive the build that wrote them.  New results
 * are always emitted as v3; the additive heroSkillLevels field is the reason
 * for the bump.
 */
export const BATTLE_RESULT_VERSION = "BattleResult.v3";
export const LEGACY_BATTLE_RESULT_VERSIONS = Object.freeze(["BattleResult.v2"]);
export const SUPPORTED_BATTLE_RESULT_VERSIONS = Object.freeze([
  BATTLE_RESULT_VERSION,
  ...LEGACY_BATTLE_RESULT_VERSIONS,
]);

export function isBattleResultVersion(value) {
  return SUPPORTED_BATTLE_RESULT_VERSIONS.includes(value);
}

export function isBattleResult(value) {
  return !!value && typeof value === "object" && isBattleResultVersion(value.schema);
}

/** Serialize an already validated result without normalizing away its schema. */
export function serializeBattleResult(result) {
  if (!isBattleResult(result)) throw new TypeError("serializeBattleResult: unsupported schema");
  return JSON.stringify(result);
}

/** Deserialize both the current v3 payload and the readable v2 legacy payload. */
export function deserializeBattleResult(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); }
    catch { return null; }
  }
  return isBattleResult(value) ? value : null;
}
