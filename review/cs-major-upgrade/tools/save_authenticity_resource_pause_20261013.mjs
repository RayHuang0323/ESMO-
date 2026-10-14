import fs from 'node:fs';
import { createHash } from 'node:crypto';

const heading = '## 2026-10-13 UTC10:21 資源不足安全停止（Root goal paused）';
const section = `\n${heading}\n\nUser明確保護其他ESMO worktree／Claude MOBA戰鬥與策略／MOBA Release／未知程序。Root UTC10:21:30實測RAM2092MiB、Virtual Commit47.158of48.151GB（餘0.992GB），依資源不足停止條件保存並pause，不啟新大型tests、修碼或build，不降低標準；沒有為釋放資源終止foreign程序。\n\n55完整真對局／1099回合成功資料與九戰術、Fake48、CTrotate137／十人20m集中0已保存；current52＋v9精確renderer-equivalent3，原native失敗與必要補證保留。三圖12影片420RGB全SHA核通、人工僅72代表樣本，Dust／Inferno原生0，Miragebody16PASS但原清理native2＋獨立恢復不升原gatePASS。工作區較新pristine build native0／47925ms、正式選圖canonical UI8/8 native0／20719ms，Root僅核對已有evidence、不重跑；preview5180已有紀錄，未知session不終止。\n\n真正未完成為Utility66列全場購入零用（45反覆），purchase purpose未保存；OWNER_REVIEW_WITH_OPEN_ITEMS不代表READY_TO_OWNER_REVIEW或goal達成。Root只核對source候選界線，沒有新增Utility runtime修正；恢復時從具名真context修購買／使用錯配，再驗受影響新source，不重B7／無關已PASS。原20 Fake紅燈為工具同tick事件後快照誤採，精確取event.pos、缺失即FAIL、仍<6m與後續真execute，48事件合格、反例拒收；原紅與summary OOM134完整保留，並非放鬆斷言。\n\n最新完整停點為 review/cs-major-upgrade/RESUME_CHECKPOINT.md 最頂兩節。Root goal已paused；其他文件get_goal=null不適用本root。恢復先quota／RAM／Virtual Commit；仍不足保存停止，不輪詢或反覆大型重跑。MOBA不动、無push／deploy／Release；手機真機仍未測，Battle／Result stale-name優先情境僅source proof。\n`;
for (const file of ['00_目前專案狀態.md', '05_Sprint紀錄.md', '06_目前主幹架構.md', '08_目前待辦與風險.md']) {
  const target = `docs/handoff/${file}`;
  if (!fs.readFileSync(target, 'utf8').includes(heading)) fs.appendFileSync(target, section, 'utf8');
}
const acceptance = 'tools/.cs-major-verifier-recovery/authenticity-final55-v11-acceptance-corrected-review-20261013.json';
const evidencePath = 'review/cs-major-upgrade/evidence/authenticity-closure-20261012/root-resource-pause-20261013.json';
const report = {
  schema: 'cs-authenticity-resource-pause.v1',
  savedAt: new Date().toISOString(),
  status: 'PAUSED_RESOURCE_INSUFFICIENT',
  readyToOwnerReview: false,
  reason: 'User explicitly requested checkpoint and stop if RAM/virtual commit remain insufficient; protect all foreign/MOBA/unknown processes.',
  measuredAt: '2026-10-13T10:21:30Z',
  availableRAMMiB: 2092,
  committedBytes: 47158226944,
  commitLimitBytes: 48150667264,
  commitHeadroomBytes: 992440320,
  sourceSHA256: createHash('sha256').update(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx')).digest('hex'),
  acceptance: { path: acceptance, sha256: createHash('sha256').update(fs.readFileSync(acceptance)).digest('hex'), successfulFullMatches: 55, currentSourceNative: 52, validatedOriginalEquivalent: 3, neverUsedPurchased: 66, repeatedPurchaseZeroUse: 45 },
  completedLaterEvidenceReadOnlyVerified: { pristineBuildNativeExitCode: 0, elapsedMs: 47925, canonicalLabelsNativeExitCode: 0, canonicalLabelsChecks: '8/8', labelsElapsedMs: 20719, previewRecorded: 'http://localhost:5180/ESMO-/', previewNotStartedOrTerminatedByRoot: true },
  rootStartedNewLargeTestAfterPause: false,
  foreignProcessesTerminated: false,
  utilityRuntimeChangedAfter55Review: false,
  next: ['Read latest checkpoint, quota and Windows RAM/commit', 'Fix 45 named utility purchase/use gaps using actual current-side/route/death/intel context and reliable purchase purposes', 'Validate only affected new-source complete-match scenarios; retain old PASS/evidence', 'Owner report and READY_TO_OWNER_REVIEW only after required closure'],
};
fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`Saved resource pause checkpoint: ${evidencePath}`);
