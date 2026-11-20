// E2、E7 的判定規則（原文見 S13_REGISTRATION.md §3.2，門檻不變）。
export const wilson = (k, n) => { if (!n) return [NaN, NaN]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [c - h, c + h]; };
export function verdictE2(tool, career) { const l = [tool.ci95[0], career.ci95[0]], u = [tool.ci95[1], career.ci95[1]]; return l.every((x) => x >= 0.97) ? "PASS" : u.some((x) => x < 0.97) ? "FAIL" : "INCONCLUSIVE"; }
export function verdictE7(ci) { return ci[0] >= 0.42 && ci[1] <= 0.58 ? "PASS" : ci[1] < 0.42 || ci[0] > 0.58 ? "FAIL" : "INCONCLUSIVE"; }
const RANK = { PASS: 0, INCONCLUSIVE: 1, FAIL: 2 };
export const conservative = (a, b) => (RANK[a] >= RANK[b] ? a : b);
