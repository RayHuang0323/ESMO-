// ============================================================================
//  tools/ci/annotate.mjs — 在 GitHub Actions 裡把關鍵結果寫成 annotation（Final Integration，2026-11-26）
//
//  為什麼：沒有權杖時，Actions 的原始 log 讀不到（API 403），但 check-run 的 annotations 可以匿名讀
//  （GET /repos/<repo>/check-runs/<job id>/annotations）。關鍵結果（Node／npm 版本、依賴樹、DIST_HASH、
//  部署前比對、部署判斷）同時印成 ::notice::，事後不用登入也能留下可查證的證據。
//  不在 GitHub Actions（GITHUB_ACTIONS != "true"）時什麼都不做；本機輸出完全不變。
// ============================================================================
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s) => esc(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
/** level: notice | warning | error */
export function annotate(title, message, level = "notice") {
  if (process.env.GITHUB_ACTIONS !== "true") return false;
  console.log(`::${level} title=${escProp(title)}::${esc(message)}`);
  return true;
}
