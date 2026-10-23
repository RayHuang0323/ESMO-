// ============================================================================
//  tools/check_tactic_book_view_3a.mjs — 戰術書畫面的 view-model 與接線（Phase 3a T13，秒級，Node）
//
//  執行：node tools/check_tactic_book_view_3a.mjs
//
//  § V  view-model：畫面上的選項＝tacticBookOptions（Registry live、扣掉量測排除）；每個選項點下去都解析得出引擎設定；
//       沒有額外選擇時＝v20 的戰術物件（含變體）；標籤逐鍵齊全
//  § W  接線（原始碼）：元件不自己列選項；TacticScreen 交出 binding；AppShell 存進本場設定
//  瀏覽器行為（真的點、390px 不溢出、從戰術書開打）由 tools/browser_check_tactic_book_3a.mjs 驗。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as View from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import * as Registry from "../src/platform/tactics/capabilityRegistry.js";
import { liveRows, CAPABILITY_ROWS, measuredExclusion, replicationWithheld } from "../src/platform/tactics/capabilityRegistry.js";
import { TACTIC_TEMPLATES } from "../src/platform/tactics/tacticTemplates.js";
import { TACTIC_OVERLAYS } from "../src/platform/tactics/tacticOverlays.js";
import { tacticBookOptions, resolveTactic, bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { mobaTacticById, STANDARD_OPP_TACTIC } from "../src/platform/contracts/MobaTacticConfig.js";
import { applyVariant, variantById } from "../src/platform/mastery/tacticVariant.js";
import { planProfile, seatMissionFit, coordinationLoad, contradictions, MISSION_POINTS, PROFILE_AXES, SEATS } from "../src/platform/tactics/tacticIndicators.js";
import { stableStringify } from "../src/platform/contracts/squadSnapshot.js";
import { stripComments } from "./lib/stripComments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify, S = stableStringify;
const TEMPLATE_IDS = Object.keys(TACTIC_TEMPLATES);
const live = liveRows();
const designDims = CAPABILITY_ROWS.filter((r) => r.status === "design").map((r) => r.dimension);

// ════════════════════════════════════════════════════════════════════════════
//  § V  view-model
// ════════════════════════════════════════════════════════════════════════════
{
  const noDim = live.filter((r) => !View.DIMENSION_LABELS[r.dimension]).map((r) => r.dimension);
  const noChoice = live.flatMap((r) => r.choices.filter((c) => !View.CHOICE_LABELS[r.dimension]?.[c]).map((c) => `${r.dimension}=${c}`));
  const groupIds = View.DIMENSION_GROUPS.map((g) => g.id);
  //  標籤表裡不是 live 維度的鍵恰好兩個（多一個、少一個都紅）：畫面快捷「強邊（前＋中期）」（不是 Registry 維度）、勝利條件（組合複驗前是 design，
  //  標籤先備好；design 不會被 tacticBookOptions 列出，所以畫不出來）。
  const extraLabels = Object.keys(View.DIMENSION_LABELS).filter((d) => !live.some((r) => r.dimension === d)).sort();
  const wantExtra = [View.QUICK_STRONG_SIDE, ...(Registry.registryRow("winCondition")?.status === "live" ? [] : ["winCondition"])].sort();
  ck("V1 標籤齊全：每個 live 維度、每個 live 選擇都有中文名，群組都存在；標籤表 Registry live 以外的鍵恰好是畫面快捷（強邊前＋中期）與尚未 live 的勝利條件", noDim.length === 0 && noChoice.length === 0 && Object.values(View.DIMENSION_LABELS).every((d) => groupIds.includes(d.group)) && J(extraLabels) === J(wantExtra), [...noDim, ...noChoice, ...extraLabels].join(","));
  ck("V1b 指標標籤齊全：六軸、五席位、每個任務", PROFILE_AXES.every((a) => View.PROFILE_AXIS_LABELS[a]) && SEATS.every((s) => View.SEAT_LABELS[s]) && Object.keys(MISSION_POINTS).every((m) => View.MISSION_LABELS[m]));

  const groups = View.templateGroups();
  const listed = groups.flatMap((g) => g.templates.map((t) => t.templateId));
  ck(`V2 模板列涵蓋全部 ${TEMPLATE_IDS.length} 個模板，各出現一次；經典八套都帶 legacyTacticId`, J(listed.slice().sort()) === J(TEMPLATE_IDS.slice().sort()) && groups.find((g) => g.id === "classic").templates.length === 8 && groups.find((g) => g.id === "classic").templates.every((t) => /^m[1-8]$/.test(t.legacyTacticId)), groups.map((g) => `${g.label}${g.templates.length}`).join(" "));

  let bad = [], shown = 0, clicked = 0;
  for (const id of TEMPLATE_IDS) {
    const v = View.tacticBookView({ templateId: id });
    if (!v.ok) { bad.push(`${id}: view 失敗`); continue; }
    const opts = Object.fromEntries(tacticBookOptions(id, [], {}).map((r) => [r.dimension, r]));
    for (const d of v.dimensions) {
      shown++;
      if (designDims.includes(d.dimension)) bad.push(`${id} 出現 design 維度 ${d.dimension}`);
      if (J(d.choices.map((c) => c.id)) !== J(opts[d.dimension].offered)) bad.push(`${id} ${d.dimension} 選項與 tacticBookOptions 不同`);
      if (d.choices.length < 2) bad.push(`${id} ${d.dimension} 只有一個選項卻被畫出來`);
      //  模板的數值對不到任何選項（own === null）⇒ 沒有選項被選中，改由「模板值」那一顆代表（templateCustom）
      if (d.choices.filter((c) => c.selected).length !== (d.own === null ? 0 : 1) || d.value !== d.own || d.explicit || d.templateCustom !== (d.own === null)) bad.push(`${id} ${d.dimension} 預設選中的不是模板自己的值`);
      for (const c of d.choices) {
        if (c.id !== d.own && (measuredExclusion(id, d.dimension, c.id) || replicationWithheld(id, d.dimension, c.id))) bad.push(`${id} ${d.dimension}=${c.id} 是量測排除或複驗撤下的選擇`);
        if (c.id === d.own) continue;
        //  點下去：計畫合法、binding 解析得出引擎設定、畫面顯示它被選中
        const next = View.tacticBookView({ templateId: id, choices: View.withChoice({}, d.dimension, c.id, d.own) });
        clicked++;
        const nd = next.ok ? next.dimensions.find((x) => x.dimension === d.dimension) : null;
        if (!next.ok || !resolveTactic({ kind: "binding", binding: next.binding }).ok || nd?.value !== c.id || !nd.explicit) bad.push(`${id} ${d.dimension}=${c.id} 點了無法解析`);
        else if (S(next.config) === S(v.config)) bad.push(`${id} ${d.dimension}=${c.id} 點了設定沒變`);
      }
    }
    const hidden = Object.values(opts).filter((r) => r.offered.length < 2 && v.dimensions.some((d) => d.dimension === r.dimension));
    if (hidden.length) bad.push(`${id} 畫出了沒得選的維度`);
  }
  ck(`V3 ${TEMPLATE_IDS.length} 個模板：畫出的維度（共 ${shown}）＝tacticBookOptions 提供 ≥ 2 個選擇的維度；沒有 design 維度、沒有量測排除的選擇；每個非預設選項（共 ${clicked}）點下去都解析得出不同的引擎設定`, bad.length === 0 && shown > 0 && clicked > 0, bad.slice(0, 4).join("；"));

  const std = View.tacticBookView({ templateId: "std" });
  const d0 = std.dimensions.find((d) => d.dimension === "jungle.focus");
  const picked = View.withChoice({}, "jungle.focus", "invade", d0.own);
  ck("V4 withChoice：選非預設 ⇒ 寫進 choices；再選回模板預設 ⇒ 移除（跟著模板）；不影響其他維度", J(picked) === J({ jungle: { focus: "invade" } }) && J(View.withChoice(View.withChoice(picked, "risk.tolerance", "cautious", "balanced"), "jungle.focus", d0.own, d0.own)) === J({ risk: { tolerance: "cautious" } }) && J(View.withChoice(picked, "jungle.focus", null)) === "{}");

  const classicBad = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"].filter((m) => { const v = View.tacticBookView({ templateId: `classic.${m}` }); return !v.ok || S(v.config) !== S(mobaTacticById(m)) || v.binding.legacyTacticId !== m || S(v.binding) !== S(bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: `classic.${m}` }).plan)); });
  ck("V5 經典模板、沒有額外選擇：畫面顯示與送出的設定＝v20 的戰術物件（逐欄相同），binding 是標準形", classicBad.length === 0 && S(View.tacticBookView({ templateId: "std" }).config) === S(STANDARD_OPP_TACTIC), classicBad.join(","));
  const overlayBad = TACTIC_OVERLAYS.filter((o) => { const v = View.tacticBookView({ templateId: `classic.${o.baseTacticId}`, overlayIds: [o.overlayId] }); return !v.ok || S(v.config) !== S(applyVariant(mobaTacticById(o.baseTacticId), variantById(o.overlayId))); });
  ck(`V6 帶變體（${TACTIC_OVERLAYS.length} 個）：設定＝v20 的 applyVariant 結果；變體用在別的模板 ⇒ ok:false（畫面會退回沒有變體）`, TACTIC_OVERLAYS.length > 0 && overlayBad.length === 0 && TACTIC_OVERLAYS.every((o) => !View.tacticBookView({ templateId: "std", overlayIds: [o.overlayId] }).ok), overlayBad.map((o) => o.overlayId).join(","));

  const b = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "classic.m2", choices: { seats: { b5: { mission: "roam" } } } }).plan);
  const slots = SEATS.map((s, i) => ({ id: s, stats: { synergy: 60 + i * 5, comms: 80, adaptability: 90 } }));
  const hero = (seat) => (seat === "b1" ? { movementProfile: "flank" } : null);
  const v = View.tacticBookView({ templateId: "classic.m2", choices: { seats: { b5: { mission: "roam" } } }, seatPlayers: slots, heroLookup: hero });
  const fit = seatMissionFit({ binding: b, seatPlayers: slots, heroLookup: hero }), prof = planProfile(b);
  ck("V7 指標只是轉述：輪廓、席位適性、配合度、矛盾提示與指標模組逐值相同", v.ok && v.profile.every((p) => p.value === prof[p.axis]) && v.seats.every((s) => s.grade === fit[s.seat].grade && s.mission === fit[s.seat].mission && s.score === fit[s.seat].score && s.hero.profile === fit[s.seat].hero.profile) && J(v.load) === J(coordinationLoad(b, slots)) && J(v.contradictions) === J(contradictions(b)) && v.seats[0].hero.fit === 1);
  const conflict = View.tacticBookView({ templateId: "std", choices: { jungle: { focus: "invade" }, teamfight: { posture: "passive" } } });
  ck("V8 互相打架的選擇 ⇒ 畫面拿得到矛盾提示（文案來自規則表）", conflict.ok && conflict.contradictions.length === 1 && conflict.contradictions[0].id === "invade_vs_passive_fights" && conflict.contradictions[0].text.length > 8);
  //  舊計畫（存檔只驗結構）可能帶著現在不提供的選擇：畫面載入前先拿掉，送出的計畫才會與看得到的選項一致。
  //  （Phase 3a-C3-2 收尾起，前期主動已由 n=400 複驗核准提供；改用仍不提供的前期 scaling（owner_hold）當例子。）
  const stale = { lanes: { mid: { stance: "aggressive" } }, jungle: { focus: "invade", tempo: "fast" }, risk: { tolerance: "cautious" }, seats: { b5: { mission: "roam" } }, phases: { early: { stance: "scaling" } } };
  const kept = View.offeredChoicesOnly("std", [], stale);
  const keptView = View.tacticBookView({ templateId: "std", choices: kept.choices });
  ck("V10 offeredChoicesOnly：量測排除的選擇（中路進攻、打野節奏快）與複驗撤下的選擇（謹慎；前期 scaling＝Owner 暫緩）被拿掉並列出，仍提供的（入侵、輔助遊走）保留", J(kept.choices) === J({ jungle: { focus: "invade" }, seats: { b5: { mission: "roam" } } }) && J(kept.dropped.map((d) => d.dimension).sort()) === J(["jungle.tempo", "lanes.mid.stance", "phases.early.stance", "risk.tolerance"]), J(kept));
  const explicitLeaves = keptView.ok ? keptView.dimensions.filter((d) => d.explicit).map((d) => `${d.dimension}=${d.value}`).sort() : null;
  ck("V10b 過濾之後：計畫裡的每個選擇都在畫面上顯示為已選（沒有「送出去但看不到」的選擇）", keptView.ok && J(explicitLeaves) === J(["jungle.focus=invade", "seats.b5.mission=roam"]) && J(keptView.plan.choices) === J(kept.choices), J(explicitLeaves));
  const nowOffered = View.offeredChoicesOnly("std", [], { phases: { early: { stance: "aggressive" }, late: { stance: "scaling" } } });
  ck("V10e n=400 複驗核准的時期姿態（前期主動、後期 scaling）留在計畫裡，不被拿掉", J(nowOffered.choices) === J({ phases: { early: { stance: "aggressive" }, late: { stance: "scaling" } } }) && nowOffered.dropped.length === 0, J(nowOffered));
  let leak = [];
  for (const id of TEMPLATE_IDS) for (const row of live) for (const c of row.choices) {
    const k = View.offeredChoicesOnly(id, [], View.withChoice({}, row.dimension, c));
    const v = View.tacticBookView({ templateId: id, choices: k.choices });
    if (!v.ok || v.dimensions.filter((d) => d.explicit).length !== Object.keys(k.choices).length || (k.dropped.length === 0 && Object.keys(k.choices).length === 0)) leak.push(`${id} ${row.dimension}=${c}`);
  }
  ck(`V10c 掃過 ${TEMPLATE_IDS.length} 個模板 × 每個 live 選擇：過濾後不是「留下且看得到」就是「被拿掉且有紀錄」，沒有第三種`, leak.length === 0, leak.slice(0, 4).join("；"));
  ck("V10d 壞輸入（未知模板、null、design 鍵）不丟例外", (() => { try { return J(View.offeredChoicesOnly("nope", [], { a: "b" }).choices) === "{}" && J(View.offeredChoicesOnly("std", [], null)) === J({ choices: {}, dropped: [] }) && View.offeredChoicesOnly("std", [], { teamfight: { style: "dive" } }).dropped.length === 1; } catch { return false; } })());

  const hostile = [undefined, {}, { templateId: "nope" }, { templateId: "std", choices: { teamfight: { style: "dive" } } }, { templateId: "std", choices: { lanes: { top: { stance: "split" }, mid: { stance: "split" } } } }];
  ck("V9 不合法的輸入（未知模板、design 選擇、兩路帶線）⇒ ok:false 附錯誤，不丟例外", hostile.every((h) => { try { const r = View.tacticBookView(h); return r.ok === false && r.errors.length > 0; } catch { return false; } }));
}

// ════════════════════════════════════════════════════════════════════════════
//  § W  接線
// ════════════════════════════════════════════════════════════════════════════
{
  const read = (rel) => stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  const comps = ["TemplateStrip", "ChoicePanel", "IndicatorPanel"].map((n) => [n, read(`src/screens/moba/tacticBook/${n}.jsx`)]);
  const dimWords = live.map((r) => r.dimension);
  const leaks = comps.flatMap(([n, src]) => [...dimWords.filter((d) => src.includes(`"${d}"`)).map((d) => `${n}:${d}`), ...(/capabilityRegistry|tacticChoiceMapping|tacticResolver/.test(src) ? [`${n}:import`] : [])]);
  ck("W1 三個元件不自己列維度／選項，也不 import Registry、對照表或 resolver（收到什麼畫什麼）", leaks.length === 0, leaks.join(","));
  const ids = comps.flatMap(([, src]) => [...src.matchAll(/data-testid=(?:"([^"]+)"|\{`([^`$]+))/g)].map((m) => m[1] ?? m[2]));
  ck("W2 元件的 testid 一律 tb- 開頭", ids.length >= 10 && ids.every((i) => i.startsWith("tb-")), ids.filter((i) => !i.startsWith("tb-")).join(","));
  const choice = comps.find(([n]) => n === "ChoicePanel")[1];
  const proAt = choice.indexOf("tb-pro-mode");
  ck("W3 專業模式按鈕存在且停用（不是可點但無效的選項）", proAt > 0 && /disabled/.test(choice.slice(proAt, proAt + 80)) && choice.includes("3b 開放"));
  const screen = read("src/screens/moba/TacticScreen.jsx"), shell = read("src/AppShell.jsx");
  ck("W4 TacticScreen：選項與指標來自 tacticBookView；送出時第四個參數是 binding；換模板會清掉選擇與變體", screen.includes("tacticBookView({") && /onNext\(applied, prep \? buildStrategy : null, talentSelections, binding\)/.test(screen) && /setTemplateId\(id\); setChoices\(\{\}\); setVariantSel\(null\)/.test(screen) && !/CAPABILITY_ROWS|liveRows|MEASURED_EXCLUSIONS/.test(screen));
  ck("W5 TacticScreen：存／刪戰術書只呼叫 store 的公開動作（它們自己存檔）", screen.includes("saveTacticPlan(bookView.plan") && screen.includes("deleteTacticPlan(entry.id)") && !screen.includes("localStorage"));
  //  V11（Phase 3a-C）：每時期的集結／物件優先只在 v21（Director core.v1）畫出；點下去的計畫要用每時期方針解析（phases:true），
  //  v20（static）下不畫、舊計畫先拿掉；TacticScreen 用開局同一個解析函式決定模式，兩個呼叫點都帶它。
  const reqDims = liveRows().filter((r) => r.requires).map((r) => r.dimension);
  let shownP = 0, clickedP = 0; const badP = [];
  for (const id of TEMPLATE_IDS) {
    const vOff = View.tacticBookView({ templateId: id }), vOn = View.tacticBookView({ templateId: id, tacticalDirector: "core.v1" });
    if (!vOff.ok || !vOn.ok) { badP.push(`${id}: view 失敗`); continue; }
    if (vOff.dimensions.some((d) => reqDims.includes(d.dimension))) badP.push(`${id} static 下畫出了每時期維度`);
    const optsOn = Object.fromEntries(tacticBookOptions(id, [], {}, { tacticalDirector: "core.v1" }).map((r) => [r.dimension, r]));
    for (const d of vOn.dimensions.filter((x) => reqDims.includes(x.dimension))) {
      shownP++;
      if (J(d.choices.map((c) => c.id)) !== J(optsOn[d.dimension].offered)) badP.push(`${id} ${d.dimension} 選項與 tacticBookOptions(core.v1) 不同`);
      for (const c of d.choices) {
        if (c.id === d.own) continue;
        if (replicationWithheld(id, d.dimension, c.id) || measuredExclusion(id, d.dimension, c.id)) badP.push(`${id} ${d.dimension}=${c.id} 是撤下的選擇`);
        const chosen = View.withChoice({}, d.dimension, c.id, d.own);
        const next = View.tacticBookView({ templateId: id, choices: chosen, tacticalDirector: "core.v1" });
        clickedP++;
        const r = next.ok ? resolveTactic({ kind: "binding", binding: next.binding }, {}, { phases: true }) : null;
        const idx = ["early", "mid", "late"].indexOf(d.dimension.split(".")[1]);
        if (!r?.ok || r.phases[idx].knobs === r.knobs && r.phases[idx].identity === r.identity) badP.push(`${id} ${d.dimension}=${c.id} 點了沒有該時期的方針`);
        const stripped = View.offeredChoicesOnly(id, [], chosen);
        if (J(stripped.choices) !== "{}" || stripped.dropped.length !== 1) badP.push(`${id} ${d.dimension}=${c.id} static 下沒有被拿掉`);
      }
    }
  }
  const screenSrc = fs.readFileSync(path.join(ROOT, "src/screens/moba/TacticScreen.jsx"), "utf8");
  const screenWired = /tacticalDirectorModeOf\(resolveRulesetForMode\(\{ mode: LIVE_RULESET_MODE, flags: FEATURE_FLAGS \}\)\)/.test(screenSrc)
    && /offeredChoicesOnly\([^)]*\{ tacticalDirector \}\)/.test(screenSrc) && (screenSrc.match(/tacticBookView\(\{[^\n]*tacticalDirector \}\)/g) ?? []).length === 2;
  ck(`V11 每時期維度（${reqDims.length} 個）：static 下不畫；core.v1 下畫出的（共 ${shownP}）＝tacticBookOptions(core.v1)；每個非預設選項（共 ${clickedP}）點下去以每時期方針解析得出該時期自己的方針，且 static 下會被 offeredChoicesOnly 拿掉；TacticScreen 以開局同一個函式決定模式並傳給兩個呼叫點`,
    badP.length === 0 && reqDims.length === 9 && shownP > 0 && clickedP > 0 && screenWired, badP.slice(0, 4).join("；") + (screenWired ? "" : "；TacticScreen 沒接上"));

  //  V11b（Phase 3a-C5R 快捷）：core.v1 下 std 有「強邊（前＋中期）」一列，選項＝兩格強邊都提供的路；點「上路」⇒ 計畫恰好多兩格（前期、中期 focusLane＝top），
  //  兩格的值相同時快捷顯示為選中；點「不指定」⇒ 兩格都清掉；static 下沒有這一列。
  {
    const on = View.tacticBookView({ templateId: "std", tacticalDirector: "core.v1" }), off = View.tacticBookView({ templateId: "std" });
    const q = on.dimensions.find((d) => d.dimension === View.QUICK_STRONG_SIDE);
    const e = on.dimensions.find((d) => d.dimension === "phases.early.focusLane"), m = on.dimensions.find((d) => d.dimension === "phases.mid.focusLane");
    const want = e && m ? e.choices.map((c) => c.id).filter((id) => m.choices.some((c) => c.id === id)) : [];
    const picked = View.withChoice({}, View.QUICK_STRONG_SIDE, "top", "none");
    const after = View.tacticBookView({ templateId: "std", choices: picked, tacticalDirector: "core.v1" });
    const qa = after.dimensions.find((d) => d.dimension === View.QUICK_STRONG_SIDE);
    const cleared = View.withChoice(picked, View.QUICK_STRONG_SIDE, "none", "none");
    ck("V11b 快捷「強邊（前＋中期）」：core.v1 才有、選項＝兩格交集；點上路 ⇒ 前／中期 focusLane 都是 top 且快捷顯示選中；點不指定 ⇒ 兩格清掉",
      !!q && J(q.choices.map((c) => c.id)) === J(want) && want.length === 4 && !off.dimensions.some((d) => d.dimension === View.QUICK_STRONG_SIDE)
      && J(picked) === J({ phases: { early: { focusLane: "top" }, mid: { focusLane: "top" } } }) && qa?.value === "top" && qa.choices.find((c) => c.id === "top")?.selected === true
      && J(cleared) === "{}", J({ q: q?.choices.map((c) => c.id), picked, value: qa?.value, cleared }));
  }

  //  V12（Owner 2026-10-22 檢查 1）：旗標關閉時只過濾本場，不得永久刪掉玩家存的戰術書。
  {
    const TB = await import("../src/platform/tactics/tacticBook.js");
    const phasePlan = createTacticPlan({ templateId: "std", choices: { jungle: { focus: "invade" }, phases: { mid: { grouping: "group" }, early: { objectiveOrder: "dragon" } } } }).plan;
    const saved = TB.addTacticPlan(TB.normalizeTacticBook(null), { plan: phasePlan, name: "v21 計畫" });
    const reloaded = TB.normalizeTacticBook(JSON.parse(JSON.stringify(saved.book)));
    const stripped = View.offeredChoicesOnly("std", [], phasePlan.choices);
    const view = View.tacticBookView({ templateId: "std", choices: stripped.choices });
    const resaved = view.ok ? TB.addTacticPlan(reloaded, { plan: view.plan, name: "v21 計畫" }) : { ok: false };
    const screen = fs.readFileSync(path.join(ROOT, "src/screens/moba/TacticScreen.jsx"), "utf8");
    ck("V12 存檔的戰術書不會因旗標關閉而被刪改：帶每時期選擇的計畫存檔／重新讀取後原樣保留（結構驗證與規則集無關）；static 下畫面只是拿掉本場用不到的選擇，就算玩家再按一次存檔也是**另一筆**（計畫雜湊不同），原本那筆不被覆蓋；載入戰術書只讀不寫",
      saved.ok && reloaded.plans.length === 1 && J(reloaded.plans[0].plan) === J(saved.entry.plan) && stripped.dropped.length === 2
      && resaved.ok && !resaved.replaced && resaved.book.plans.length === 2 && J(resaved.book.plans[0].plan) === J(saved.entry.plan)
      && /setChoices\(entry\.plan\.choices \?\? \{\}\)/.test(screen) && !/saveTacticPlan\([^)]*kept/.test(screen),
      J({ reloaded: reloaded.plans.length, dropped: stripped.dropped.length, resaved: resaved.book?.plans?.length }));
  }
  //  V13（Owner 2026-10-22 檢查 2）：DEV 網址開關與恢復進行中場次的旁路——開局時只從**本場**的 binding 拿掉這一場規則集用不到的選擇。
  {
    const Live = await import("../src/battle/moba/liveMatchSetup.js");
    const RS = await import("../src/platform/contracts/matchRuleset.js");
    const b = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices: { risk: { tolerance: "bold" }, phases: { mid: { grouping: "group" } } } }).plan);
    const plain = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices: { risk: { tolerance: "bold" } } }).plan);
    const frozenCopy = J(b);
    const run = (id) => Live.buildLiveMatchSetup({ opts: { tacticPlanBinding: b }, ruleset: RS.rulesetById(id), seed: 7, seedSource: "local" });
    const v20 = run("career.v20"), v21 = run("career.v21"), dev = run("balanceTool.v20");
    const v20Plain = Live.buildLiveMatchSetup({ opts: { tacticPlanBinding: plain }, ruleset: RS.rulesetById("career.v20"), seed: 7, seedSource: "local" });
    const choicesOf = (r) => J(r.setup?.tactic?.blue?.binding?.plan?.choices);
    ck("V13 本場過濾：career.v20／DEV 的 balanceTool.v20（static）⇒ 開局成功、本場 binding 拿掉每時期選擇並記在 notes、其他選擇保留；career.v21 ⇒ 原樣；沒有每時期選擇 ⇒ 同一個 binding（逐字不變）；傳入的 binding 物件沒被改",
      v20.ok && choicesOf(v20) === J({ risk: { tolerance: "bold" } }) && v20.notes.some((n) => n.includes("phases.mid.grouping=group"))
      && dev.ok && choicesOf(dev) === J({ risk: { tolerance: "bold" } }) && v21.ok && choicesOf(v21) === J(b.plan.choices) && v21.notes.length === 0
      && v20Plain.ok && J(v20Plain.setup.tactic.blue.binding) === J(plain) && v20Plain.notes.length === 0 && J(b) === frozenCopy
      && Live.bindingForRuleset(plain, RS.rulesetById("career.v20")).binding === plain,
      J({ v20: choicesOf(v20), dev: choicesOf(dev), v21: choicesOf(v21) }));
  }

  ck("W6 AppShell：戰術頁交出的 binding 進 state 與本場設定（重新整理後接得回來），再交給 GameView", shell.includes("setTacticPlanBinding(binding ?? null)") && shell.includes("tacticPlanBinding: binding ?? null") && shell.includes("tacticPlanBinding={tacticPlanBinding}") && shell.includes("setTacticPlanBinding(config.tacticPlanBinding ?? null)"));
}

console.log(`\nTactic Book View 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
