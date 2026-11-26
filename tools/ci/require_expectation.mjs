#!/usr/bin/env node
// ============================================================================
//  tools/ci/require_expectation.mjs — ci-dryrun 專用：部署前「必須與正式站相同」的期待一定要成立
//  （Final Integration，2026-11-26，Owner 要求 dry run 不能只有比對報告）
//
//    node tools/ci/require_expectation.mjs <true|false>
//
//  參數就是 workflow 算出來的 EXPECT_IDENTICAL（decide 的 expect_identical_bundle 且 VITE_SUPABASE_* 皆空）。
//  只有字串 "true" 通過（exit 0）；其他任何值（false、空、打錯）⇒ exit 1，並寫一條 error annotation。
// ============================================================================
import { annotate } from "./annotate.mjs";

const v = process.argv[2];
if (v === "true") {
  console.log("DRYRUN_EXPECTATION RESULT=PASS（部署前比對確實要求與正式站相同）");
  annotate("DRYRUN_EXPECTATION", "RESULT=PASS expect_identical=true（部署前比對確實要求與正式站相同）");
} else {
  console.log(`DRYRUN_EXPECTATION RESULT=FAIL（expect_identical=${v ?? "(沒有)"}：這次 dry run 沒有要求 bundle 與正式站相同）`);
  annotate("DRYRUN_EXPECTATION FAIL", `RESULT=FAIL expect_identical=${v ?? "(沒有)"}：decide 沒有設下期待，dry run 不能只有比對報告`, "error");
  process.exitCode = 1;
}
