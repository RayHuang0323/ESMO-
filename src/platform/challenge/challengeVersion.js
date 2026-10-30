// ============================================================================
//  platform/challenge/challengeVersion.js — Challenge 目前使用的模擬版本（Phase 3a-B T16）
//
//  一個值：這個 build、這組正式旗標下，**新的**挑戰快照與挑戰要記下的模擬版本，以及重播時拿來比對的「目前版本」。
//   · 旗標 mobaTacticalDirectorV21 關（正式站預設）⇒ "moba-sim.v20"：與 T16 之前的正式站逐位元相同（challenge.v20）。
//   · mobaTacticalDirectorV21、heroSkillsV1、mobaChallengeV21 三者都開 ⇒ "moba-sim.v21"：新挑戰走 challenge.v21；v20 記下的挑戰被 canReplay 明確拒絕（附中文原因）。
//   · Phase 3a-B 第一階段（Owner 2026-10-30 第 5 點）：只開 mobaTacticalDirectorV21（Live 戰術 v21）⇒ 仍是 "moba-sim.v20"（Challenge 留在 v20）。
//     challenge.v21 物件逐位元不變，所以它的 releaseRequirements 不列 mobaChallengeV21；分流只在 resolveRulesetForMode 的 challenge 分支。
//  ⚠ 不用 MOBA_SIMULATION_VERSION：那是整個 build 的 MOBA 候選版本（未發布的 v21），旗標關閉時拿它記挑戰，
//    正式站既有的 v20 挑戰會全部變成不可重播、新挑戰卻仍跑 v20 語意——版本與語意對不上。
//  只讀旗標物件，不讀網址／localStorage；純值。
// ============================================================================
import { FEATURE_FLAGS } from "../../featureFlags.js";
import { challengeSimulationVersionFor } from "../contracts/matchRuleset.js";

export const CHALLENGE_SIMULATION_VERSION = challengeSimulationVersionFor(FEATURE_FLAGS);
