#!/usr/bin/env node
// ============================================================================
//  Slice 7 — 生命週期與防刷的端到端驗證
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_challenge_lifecycle.mjs --timeout 900000`
//
//  ⚠ 契約層的判定已由 `check_player_challenge_slice7.mjs` 證過。這一支只做
//    那支做不到的事：用**真的 Store**（不是測試素材）走完整循環，並且
//    **繞過畫面**直接呼叫 store action —— 因為 §4 要求防刷不能只存在 UI。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

/**
 *  ⚠ 這裡刻意**完全不碰畫面**：直接呼叫 store action。
 *    如果防刷只寫在 UI，這一段就會拿到重複的正式資格 —— 那正是要抓的。
 */
const runCycle = () => `
  ${RESOLVE_APP_MODULES}
  //  RESOLVE_APP_MODULES 已經宣告 B 與 S，這裡沿用，不要重新宣告。
  const tactics = await import(B + "/src/platform/contracts/MobaTacticConfig.js");
  const out = { steps: [] };
  const key = S().challengeBoardView({}).candidates[0].key;
  out.opponentKey = key;
  //  新存檔還沒發布過防守陣容，出賽快照因此拿不到預設戰術，
  //  會直接回「請先選擇這一場要用的戰術」。畫面是用下拉選單帶進去的，
  //  這裡也必須明確帶 —— 不是繞過驗證，是補上畫面本來就會給的輸入。
  const tacticId = tactics.MOBA_TACTICS[0].tacticId;
  out.tacticId = tacticId;

  const play = (label, mk) => {
    const r = mk();
    if (!r.ok) { out.steps.push({ label, ok: false, why: r.errors?.[0]?.message ?? "?" }); return null; }
    const run = S().runChallengeById(r.challengeId);
    const inst = S().challenge.instances[r.challengeId];
    out.steps.push({
      label, ok: true, challengeId: r.challengeId,
      kind: inst.kind,
      settlementClass: inst.settlement?.settlementClass ?? null,
      rewardEligible: inst.settlement?.rewardEligible ?? null,
      rewardReason: inst.settlement?.rewardReason ?? null,
      chHash: inst.challengerSnapshotHash, defHash: inst.defenderSnapshotHash,
      identity: inst.identity ?? null,
      seed: inst.matchSeed ?? null,
      ranOk: run.ok,
    });
    return r.challengeId;
  };

  //  A. 第一次正式挑戰
  const first = play("A 第一次正式", () => S().startFixtureChallenge(key, { tacticId }));
  //  B/D. 同一組快照再開一場 formal（seed 一定不同）
  play("D 同配對再打一場 formal", () => S().startFixtureChallenge(key, { tacticId }));
  //  B. retry ×3
  for (let i = 1; i <= 3; i++) play("B retry " + i, () => S().retryChallenge(first, { tacticId }));

  const cur = S().challenge;
  out.board = S().challengeBoardView({ tacticId }).candidates.map((c) => ({
    key: c.key, formalState: c.formalState, label: c.formalStateLabel, record: c.record ?? null,
  }));
  out.instanceCount = Object.keys(cur.instances).length;
  return JSON.stringify(out);
`;

const readRecords = (tacticId = null) => `
  ${RESOLVE_APP_MODULES}
  //  看板要用**與出賽同一個戰術**算陣容身分，否則狀態永遠對不上。
  const cards = S().challengeBoardView({ tacticId: ${JSON.stringify(tacticId)} }).candidates;
  const cur = S().challenge;
  return JSON.stringify({
    cards: cards.map((c) => ({ key: c.key, formalState: c.formalState, recordLabel: c.recordLabel ?? null })),
    settlements: Object.values(cur.instances).map((i) => ({
      kind: i.kind, cls: i.settlement?.settlementClass ?? null, elig: i.settlement?.rewardEligible ?? null,
    })),
    career: {
      day: S().meta?.days ?? null,
      xp: (S().players ?? []).reduce((a, p) => a + (p.xp ?? 0), 0),
      stamina: (S().players ?? []).reduce((a, p) => a + (p.stamina ?? 0), 0),
    },
  });
`;

const result = await runGate({
  name: "Slice 7 挑戰生命週期",
  run: async ({ chrome, url, ck, sleep }) => {
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(1500);
    const s = J(await chrome.evaluate(seed()));
    ck("precondition：乾淨存檔", s?.players > 0, `${s?.players ?? 0} 名`);
    await chrome.navigate(url); await sleep(2000);

    const before = J(await chrome.evaluate(readRecords()));   // 尚未挑戰，戰術無關
    const cycle = J(await chrome.evaluate(runCycle()));
    console.log(`\n${JSON.stringify(cycle?.steps, null, 2)}`);
    ck("① 五場都建立並跑完（繞過畫面直接呼叫 store）",
      (cycle?.steps ?? []).length === 5 && cycle.steps.every((x) => x.ok && x.ranOk),
      JSON.stringify((cycle?.steps ?? []).map((x) => x.ok && x.ranOk)));
    if (!cycle?.steps?.length) return;

    const [a, d, ...retries] = cycle.steps;
    ck("⭐ A. 第一次正式挑戰 ⇒ formal ＋ eligible",
      a.settlementClass === "formal" && a.rewardEligible === true,
      `${a.settlementClass} / ${a.rewardEligible}`);
    ck("⭐ G. 繞過畫面再打同一組配對 ⇒ repeat ＋ 不具資格",
      d.settlementClass === "repeat" && d.rewardEligible === false,
      `${d.settlementClass} / ${d.rewardEligible}｜${d.rewardReason}`);
    ck("⭐ D. 那一場的 seed 確實不同（證明改 seed 沒用）",
      a.seed !== d.seed, `${a.seed} vs ${d.seed}`);
    //  ⚠ 比的是**陣容身分**，不是快照雜湊：快照含 issuedAt，同一支隊伍
    //    每次簽發都不同，拿它比對必然不相等（第一版就是這樣紅的）。
    ck("④ 兩場的陣容身分相同（所以才判重複）",
      !!a.identity?.challenger && !!a.identity?.defender
      && a.identity.challenger === d.identity?.challenger
      && a.identity.defender === d.identity?.defender,
      `${a.identity?.challenger}::${a.identity?.defender}`);
    ck("④ 而兩場的快照雜湊本來就不同（證明不能用它當防刷鍵）",
      a.chHash !== d.chHash, `${a.chHash} vs ${d.chHash}`);
    ck("⭐ B. 三場 retry 全部 retry 類別且不具資格",
      retries.length === 3 && retries.every((x) => x.settlementClass === "retry" && x.rewardEligible === false),
      retries.map((x) => x.settlementClass).join(","));

    const after = J(await chrome.evaluate(readRecords(cycle.tacticId)));
    const card = after?.cards?.find((c) => c.key === cycle.opponentKey) ?? null;
    console.log(`\n看板：${JSON.stringify(after?.cards, null, 2)}`);
    //  ⚠ 觀測紀錄與獎勵資格是**兩件事**：
    //    · 紀錄計 2 場 —— 那兩場都真的打完了，排除掉會讓看板謊報你的經驗。
    //    · 具獎勵資格的只有 1 場 —— 防刷在獎勵層，不在紀錄層。
    //    三場 retry 兩邊都不算。
    ck("⭐ C. 3 場 retry 完全不進觀測紀錄（紀錄是 2 次，不是 5 次）",
      !!card && /挑戰過 2 次/.test(card.recordLabel ?? ""), card?.recordLabel ?? "(無)");
    ck("⭐ C. 五場之中具獎勵資格的**只有一場**",
      (after?.settlements ?? []).filter((x) => x.elig === true).length === 1,
      JSON.stringify((after?.settlements ?? []).map((x) => `${x.kind}/${x.cls}/${x.elig}`)));
    ck("⑤ BOARD_STATE：打過的對手標成已挑戰這份陣容",
      card?.formalState === "played", `${card?.formalState}`);
    ck("⑤ BOARD_STATE：沒打過的對手仍是尚未正式挑戰",
      (after?.cards ?? []).filter((c) => c.key !== cycle.opponentKey).every((c) => c.formalState === "available"),
      (after?.cards ?? []).map((c) => `${c.key}:${c.formalState}`).join(" "));
    ck("⑤ BOARD_STATE：沒有任何卡片憑空標成「對手更新了陣容」",
      (after?.cards ?? []).every((c) => c.formalState !== "updated"),
      (after?.cards ?? []).filter((c) => c.formalState === "updated").map((c) => c.key).join(",") || "沒有");

    // ── F. reload 之後 eligibility 不變 ────────────────────────────────
    await chrome.navigate(url); await sleep(2500);
    const reloaded = J(await chrome.evaluate(readRecords(cycle.tacticId)));
    //  ⚠ 兩邊都空的話比對必然相等 ⇒ 先要求真的有五場判定可比。
    ck("⭐ F. reload 之後每一場的判定完全不變",
      (after?.settlements?.length ?? 0) === 5
      && JSON.stringify(reloaded?.settlements) === JSON.stringify(after?.settlements),
      JSON.stringify(reloaded?.settlements));
    ck("⭐ F. reload 之後看板狀態也不變",
      (after?.cards?.length ?? 0) > 0
      && JSON.stringify(reloaded?.cards) === JSON.stringify(after?.cards));

    // ── G2. 手改存檔：把先前那場的 result 刪掉，想把資格洗回來 ──────────
    const washed = J(await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
          const cur = S().challenge;
      const ids = cur.order;
      //  找那場被判 repeat 的，並且把「佔住配對」的第一場 result 拔掉。
      const repeatId = ids.find((id) => cur.instances[id]?.settlement?.settlementClass === "repeat");
      const firstId = ids.find((id) => cur.instances[id]?.settlement?.settlementClass === "formal");
      if (!repeatId || !firstId) return JSON.stringify({ ok: false });
      const raw = JSON.parse(localStorage.getItem("esmo.profile.v1"));
      delete raw.challenge.instances[firstId].result;
      localStorage.setItem("esmo.profile.v1", JSON.stringify(raw));
      return JSON.stringify({ ok: true, repeatId, firstId });
    `));
    ck("⑥ 前置：手改存檔真的寫進去了", washed?.ok === true, JSON.stringify(washed));
    await chrome.navigate(url); await sleep(2500);
    const afterWash = J(await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
          const inst = S().challenge.instances[${JSON.stringify(washed?.repeatId ?? "")}] ?? null;
      return JSON.stringify({ cls: inst?.settlement?.settlementClass ?? null, elig: inst?.settlement?.rewardEligible ?? null });
    `));
    ck("⭐ G2. 刪掉前例之後，那場 repeat 仍然不具資格（洗不回來）",
      afterWash?.cls === "repeat" && afterWash?.elig === false, JSON.stringify(afterWash));

    // ── H. 生涯隔離 ────────────────────────────────────────────────────
    ck("⭐ H. 打完五場之後生涯日期沒有前進",
      reloaded?.career?.day === before?.career?.day, `${before?.career?.day} → ${reloaded?.career?.day}`);
    ck("⭐ H. 選手經驗總和不變",
      reloaded?.career?.xp === before?.career?.xp, `${before?.career?.xp} → ${reloaded?.career?.xp}`);
    ck("⭐ H. 選手體力總和不變",
      reloaded?.career?.stamina === before?.career?.stamina, `${before?.career?.stamina} → ${reloaded?.career?.stamina}`);

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑦ 無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 2).join(" ¦ ") || "clean");
  },
});

finishGate(result);
