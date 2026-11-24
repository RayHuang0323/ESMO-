#!/usr/bin/env bash
# C2 re-freeze rerun (C2_事前登記_補充_凍結後修正.md): the registered plans, unchanged, on the second freeze. One heavy job at a time.
# Usage: bash run_refreeze.sh <worktree> <out root outside the repo>
W="$1"; O="$2"; P="$W/review/tactic-book-3a/deterministic-math-c2"; mkdir -p "$O"; cd "$W" || exit 2
step() { echo "[$(date -u +%H:%M:%S)] $*" >> "$O/refreeze.progress"; }
until curl -s -o /dev/null http://127.0.0.1:5648/ESMO-/; do sleep 1; done
step "start head=$(git rev-parse --short HEAD)"
node tools/c1/run_c1_crossengine.mjs --plan="$P/C2_crossengine_plan.json" --out="$O/formal" --url=http://127.0.0.1:5648/ESMO-/ > /dev/null 2>&1; step "formal exit=$?"
node tools/c1/run_c1_crossengine.mjs --plan="$P/C2_repeat_plan.json" --out="$O/repeat" --url=http://127.0.0.1:5648/ESMO-/ > /dev/null 2>&1; step "repeat exit=$?"
node tools/c2/perf_c2_kernel.mjs --plan="$P/C2_crossengine_plan.json" --json="$O/perf.json" > "$O/perf.log" 2>&1; step "perf exit=$?"
mkdir -p "$O/browser"; cp "$P/browser/bp_loop.js" "$P/browser/replay_scan.js" "$O/browser/"
bash "$P/browser/run_flows.sh" "$W" "$O/browser"; step "flows exit=$?"
bash "$P/run_gates.sh" "$W" "$O/gates"; step "gates exit=$?"
step "all-done"
