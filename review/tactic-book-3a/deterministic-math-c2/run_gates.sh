#!/usr/bin/env bash
# C2 gate suite, one at a time (single-line heavy work). Each gate's full output goes to $OUT/<name>.log; a summary line per gate to $OUT/summary.txt.
# Usage: bash run_gates.sh <worktree> <out dir outside the repo>
W="$1"; OUT="$2"; mkdir -p "$OUT"; cd "$W" || exit 2
run() { # name, command...
  local name="$1"; shift
  local t0=$(date +%s)
  echo "[$(date -u +%H:%M:%S)] start $name" >> "$OUT/summary.txt"
  "$@" > "$OUT/$name.log" 2>&1
  local rc=$?
  echo "[$(date -u +%H:%M:%S)] done $name exit=$rc $(( $(date +%s) - t0 ))s | $(grep -E 'PASS|FAIL|通過|built in|結束率|節奏|[0-9]+/[0-9]+' "$OUT/$name.log" | tail -1 | cut -c1-160)" >> "$OUT/summary.txt"
}
run det_hypot_node        node tools/check_det_hypot_c2.mjs
run c2_v25_golden         node tools/check_c2_v25_golden.mjs
run c1_legacy_golden      node tools/check_c1_legacy_golden.mjs
run c2_versioned_scope    node tools/check_c2_versioned_scope.mjs --real
run c1_versioned_scope    node tools/check_c1_versioned_scope.mjs
run c1_isolation          node tools/check_c1_isolation.mjs
run c2_isolation          node tools/check_c2_isolation.mjs
run det_math_c1           node tools/check_det_math_c1.mjs
run sim_version_gate      node tools/check_simulation_version_gate.mjs
run cal_parity_v24        node tools/check_cal_parity_v24.mjs
run s15_preflight_v24     node tools/check_s15_preflight_v24.mjs
run s2_contract_v24       node tools/check_s2_contract_v24.mjs
run tactic_exec_v24       node tools/check_tactic_exec_v24.mjs
run match_ruleset_3a      node tools/check_match_ruleset_3a.mjs
run v23_freeze            node tools/check_v23_freeze.mjs
run layer_isolation_v24   node tools/check_layer_isolation_v24.mjs
run match_setup_3a        node tools/check_match_setup_3a.mjs
run tactic_acceptance_v31 node tools/check_tactic_acceptance_v31.mjs
run geometry_det_v2       node tools/check_c2_geometry.mjs --kernel=det.v2
run geometry_native       node tools/check_c2_geometry.mjs --kernel=native
run regress               node tools/regress.mjs
run regress2              node tools/regress2.mjs
run runtime29_flat        env ESMO_VERIFY_FLAT=1 node tools/check_moba_runtime29.mjs
run npm_build             npm run build
echo "all-done" >> "$OUT/summary.txt"
