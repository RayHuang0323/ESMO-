#!/usr/bin/env bash
# C2 browser product flows on the 5648 preview (career.v26): {chrome, firefox, webkit} × {watch, quick, mobile}, one browser at a time, fresh profile
# each run. Raw screenshots / setup / result files go to $SP (outside the repo); each run's steps, log and Node comparison are written next to them.
# Usage: bash run_flows.sh <worktree> <SP dir>
W="$1"; SP="$2"; B="$W/review/tactic-book-3a/deterministic-math-c2/browser"
cd "$W" || exit 2
for eng in chrome firefox webkit; do
  for mode in watch quick mobile; do
    tag="${eng}_${mode}"
    echo "[$(date -u +%H:%M:%S)] start $tag" >> "$SP/run.progress"
    node "$B/mk_c2.mjs" "$mode" "$SP/$tag.json" "$tag" "$SP"
    node tools/c1/drive_c1_engine.mjs --engine="$eng" --steps="$SP/$tag.json" > "$SP/$tag.log" 2>&1
    rc=$?
    if [ -f "$SP/${tag}_setup.json" ] && [ -f "$SP/${tag}_result.json" ]; then
      node tools/c1/compare_live_c1.mjs --setup="$SP/${tag}_setup.json" --result="$SP/${tag}_result.json" --out="$SP/${tag}_compare.json" > /dev/null 2>&1
    fi
    echo "[$(date -u +%H:%M:%S)] done $tag exit=$rc" >> "$SP/run.progress"
  done
done
echo "all-done" >> "$SP/run.progress"
