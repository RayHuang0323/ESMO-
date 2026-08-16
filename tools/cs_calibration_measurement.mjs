// R22 共用的 CS local causal measurement primitives。
// 這個檔案只處理 evidence 的數學與 gate，不建立第二套 simulator。

export const CALIBRATION_LEVELS = Object.freeze({
  STAT_DIRECT_CONSUMER: "level1_stat_direct_consumer",
  LOCAL_OPPORTUNITY: "level2_local_opportunity",
  IMMEDIATE_ACTION: "level3_immediate_action_conversion",
  DOWNSTREAM_OUTCOME: "level4_downstream_match_outcome",
});

export const READINESS_STATUS = Object.freeze({
  READY: "Ready for calibration pilot",
  DEFERRED: "Deferred",
});

function finite(value, label) {
  if (!Number.isFinite(Number(value))) throw new Error(`[R22_NON_FINITE] ${label}`);
  return Number(value);
}

export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + finite(value, "mean"), 0) / values.length;
}

export function sampleSd(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((finite(value, "sampleSd") - average) ** 2), 0) / (values.length - 1));
}

export function round4(value) {
  return Number(finite(value, "round4").toFixed(4));
}

export function pairedEffect(treatment, baseline) {
  if (!Array.isArray(treatment) || !Array.isArray(baseline) || treatment.length !== baseline.length || treatment.length === 0) {
    throw new Error("[R22_PAIRED_SHAPE] treatment/baseline must be non-empty arrays of equal length");
  }
  const diffs = treatment.map((value, index) => finite(value, "treatment") - finite(baseline[index], "baseline"));
  const avg = mean(diffs);
  const sd = sampleSd(diffs);
  return Object.freeze({
    meanDiff: round4(avg),
    sd: round4(sd),
    effectSize: sd === 0 ? (avg === 0 ? 0 : null) : round4(avg / sd),
    positiveSeeds: diffs.filter((value) => value > 0).length,
    negativeSeeds: diffs.filter((value) => value < 0).length,
    zeroSeeds: diffs.filter((value) => value === 0).length,
  });
}

export function monotonicity(low, baseline, high, direction = "higher") {
  if (![low, baseline, high].every(Array.isArray) || low.length !== baseline.length || baseline.length !== high.length || low.length === 0) {
    throw new Error("[R22_MONOTONIC_SHAPE] low/baseline/high must be equal non-empty arrays");
  }
  const sign = direction === "lower" ? -1 : 1;
  if (!["higher", "lower"].includes(direction)) throw new Error(`[R22_DIRECTION] ${direction}`);
  const passing = low.map((value, index) => {
    const lowStep = sign * (finite(baseline[index], "baseline") - finite(value, "low"));
    const highStep = sign * (finite(high[index], "high") - finite(baseline[index], "baseline"));
    return lowStep >= 0 && highStep >= 0 && (lowStep > 0 || highStep > 0);
  });
  const passingSeeds = passing.filter(Boolean).length;
  return Object.freeze({
    direction,
    passingSeeds,
    totalSeeds: passing.length,
    strictMajority: strictMajority(passingSeeds, passing.length),
    passingMask: passing.map((value) => value ? 1 : 0).join(""),
  });
}

export function monotonicityFromCounts(passingSeeds, totalSeeds) {
  const passing = Number(passingSeeds);
  const total = Number(totalSeeds);
  if (!Number.isInteger(passing) || !Number.isInteger(total) || total <= 0 || passing < 0 || passing > total) {
    throw new Error(`[R22_COUNT_SHAPE] ${passing}/${total}`);
  }
  return Object.freeze({ passingSeeds: passing, totalSeeds: total, strictMajority: strictMajority(passing, total) });
}

export function strictMajority(passingSeeds, totalSeeds) {
  const passing = Number(passingSeeds);
  const total = Number(totalSeeds);
  if (!Number.isInteger(passing) || !Number.isInteger(total) || total <= 0 || passing < 0 || passing > total) {
    throw new Error(`[R22_MAJORITY_SHAPE] ${passing}/${total}`);
  }
  return passing > total / 2;
}

export function changedSeedSummary(changedSeeds, totalSeeds) {
  const changed = Number(changedSeeds);
  const total = Number(totalSeeds);
  if (!Number.isInteger(changed) || !Number.isInteger(total) || total <= 0 || changed < 0 || changed > total) {
    throw new Error(`[R22_CHANGED_SHAPE] ${changed}/${total}`);
  }
  return Object.freeze({ changedSeeds: changed, totalSeeds: total, ratio: round4(changed / total) });
}

export function thresholdCrossing(values, threshold, direction = "up") {
  if (!Array.isArray(values) || values.length < 2) throw new Error("[R22_THRESHOLD_SHAPE]");
  const limit = finite(threshold, "threshold");
  if (!["up", "down", "either"].includes(direction)) throw new Error(`[R22_THRESHOLD_DIRECTION] ${direction}`);
  const below = (value) => finite(value, "thresholdValue") < limit;
  const above = (value) => finite(value, "thresholdValue") >= limit;
  const crossedUp = values.some(below) && values.some(above) && values[0] < limit && values[values.length - 1] >= limit;
  const crossedDown = values[0] >= limit && values[values.length - 1] < limit;
  const crossed = direction === "up" ? crossedUp : direction === "down" ? crossedDown : crossedUp || crossedDown;
  return Object.freeze({ threshold: limit, direction, crossed, values: values.map((value) => finite(value, "thresholdValue")) });
}

export function clampSummary(values, min, max) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("[R22_CLAMP_SHAPE]");
  const lower = finite(min, "clampMin");
  const upper = finite(max, "clampMax");
  if (lower > upper) throw new Error("[R22_CLAMP_RANGE]");
  const numeric = values.map((value) => finite(value, "clampValue"));
  const lowerCount = numeric.filter((value) => value === lower).length;
  const upperCount = numeric.filter((value) => value === upper).length;
  return Object.freeze({ total: numeric.length, lowerCount, upperCount, observed: lowerCount + upperCount > 0 });
}

export function classifyCausalReadiness({
  directMonotonic,
  directGateEstablished = true,
  localOpportunity = "sufficient",
  immediateConversion = "monotonic",
  thresholdDominated = false,
  downstreamPathAmplified = false,
  semanticAmbiguity = false,
  formulaNonMonotonic = false,
}) {
  const boundary = [];
  if (semanticAmbiguity) boundary.push("semantic ambiguity");
  if (formulaNonMonotonic) boundary.push("truly non-monotonic formula");
  if (localOpportunity === "insufficient") boundary.push("insufficient opportunity coverage");
  if (thresholdDominated) boundary.push("threshold dominated");
  if (immediateConversion === "non-monotonic") boundary.push("immediate conversion non-monotonic");
  if (downstreamPathAmplified) boundary.push("downstream path amplified");
  if (!directMonotonic || !directGateEstablished) boundary.push("direct/local monotonic evidence insufficient");
  const blockingBoundary = semanticAmbiguity || formulaNonMonotonic || localOpportunity === "insufficient"
    || thresholdDominated || immediateConversion === "non-monotonic" || !directMonotonic || !directGateEstablished;
  return Object.freeze({
    status: blockingBoundary ? READINESS_STATUS.DEFERRED : READINESS_STATUS.READY,
    boundary: Object.freeze(boundary),
    level4IsSecondary: true,
    downstreamPathAmplified,
  });
}
