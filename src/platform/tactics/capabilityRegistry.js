// ============================================================================
//  platform/tactics/capabilityRegistry.js — Capability Registry（Phase 3a T8：只有資料列）
//
//  身分：玩家「戰術書」每一個可選維度的唯一清單。TacticPlan.v2 的 `choices` 只接受這裡
//  `status === "live"` 的鍵與列舉值（createTacticPlan 驗證）；`design` 的鍵是「已規劃、尚未
//  接上引擎」——存在於表中只是為了能回出明確錯誤碼，**不會被提供給玩家**。
//
//  ── 列的形狀（一個維度一列，frozen）──────────────────────────────────────
//    dimension     "phases.early.stance" 這種點分路徑（對應 TacticPlan.v2.choices 的巢狀物件）
//    choices       允許的列舉值（字串識別字；永遠不是數字，也不是用字串假裝的數字）。
//                  design 列為空陣列＝列舉內容尚未定稿（規格未給），不是「沒有選項」。
//    status        "live" | "design"
//                  live＝「現行引擎的戰術設定已經有一個旋鈕，這個選擇可以解析成它」。
//                  design＝規格列了，但目前沒有可對應的旋鈕（或旋鈕是整場共用、無法依此鍵細分）。
//    minSimVersion live 列＝這個選擇最早可用的模擬版本（Phase 3a 隨 moba-sim.v21 發布）；design 列＝null。
//    basis         live 列＝解析目標：現行 `MobaTacticConfig.v1` 的欄位路徑（資訊用；Task 9 的
//                  Resolver 才是權威映射）。design 列＝null。
//    note          design 列＝為什麼還不能 live（一句話）；live 列＝null。
//
//  ── Task 10 加進 live 列的欄位（design 列沒有）────────────────────────────────
//    resolverFields  這個維度的任何選擇會改到的 resolver 輸出欄位（`resolveTactic(...)` 的 `knobs.*`／`identity.*` 路徑，
//                    陣列用索引，例 `identity.phaseEngage.0`）。G-A5 逐格驗證：欄位真的在輸出裡、且選擇改變時至少一格跟著變。
//    engineReads     引擎（LogicEngine.js，剝註解後）真的會讀的屬性名。G-A5 逐個掃描——沒人讀的旋鈕＝死旋鈕＝假選項。
//    gate            真實性 gate（G-A7）的**事前登記**：每個選擇宣稱什麼行為、用哪個量測、方向。
//        claims   [{ choice, ownIn?, metric, direction }]：direction ＝ "up"｜"down"（相對於「模板本來的選擇」）或 "rank"
//                 （依 `rank` 的順序：選擇的名次高於本來的選擇 ⇒ up，低於 ⇒ down）。`ownIn` 限定這條只適用於模板本來的選擇在其中時。
//        rank     名次（由低到高），只有 direction 為 "rank" 的列才需要。
//        deltaFields  挑「旋鈕差距最小的模板」用：resolver 輸出欄位路徑的陣列（差距的尺度 unit 住在 tools/lib/tacticTruthPlan.mjs；
//                 Registry 的列裡不放任何數字，tactic_plan R2b 守住）。
//        inverseFields  deltaFields 之中「值越大、宣稱的行為越少」的欄位（例如抓人間隔）。有 rank 的列，G-A5 另外驗證
//                 「沿 rank 往上，每一格的值（inverse 的取負）不遞減」＝事前登記的方向與旋鈕一致。
//        why      這個量測為什麼算「行為」（不是狀態、不是擲骰、不是隨比賽長度放大的計數）。
//    ⚠ 量測 id 的定義與計數方式在 tools/lib/tacticTruthSim.mjs（METRICS）；事前登記＝這個檔案先於結果進 git。
//    ⚠ 量測不到的選擇不放大係數：該選擇從 live 移到 design，或進 MEASURED_EXCLUSIONS（逐模板不提供，原因與數字留底）。
//
//  純資料＋查詢，不 import 任何東西。
// ============================================================================

export const CAPABILITY_REGISTRY_VERSION = "CapabilityRegistry.v1";
export const CAPABILITY_STATUS = Object.freeze({ LIVE: "live", DESIGN: "design" });
export const CAPABILITY_SIM_VERSION_3A = "moba-sim.v21";
/** G-A7 的事前登記門檻：固定 seeds 1–40、配對 z ≥ 2 才算有效果、2 ≤ z < 3 標為邊緣（marginal）。 */
export const TRUTH_GATE = Object.freeze({ seedFrom: 1, seedTo: 40, minZ: 2, marginalBelowZ: 3 });

const STANCE = ["aggressive", "standard", "defensive", "scaling"];
const STANCE_LATE = ["standard", "defensive", "scaling"];
const LANE_STANCE =["aggressive", "standard", "defensive"];
const SPLITTABLE_LANE_STANCE = ["aggressive", "standard", "defensive", "split"];

//  touches（Phase 3a T9 fix 1）：這個維度的任何選擇**可能改到的所有 MobaTacticConfig 欄位**（主欄位在前＝basis 的欄位路徑，
//  之後是連帶欄位）。gate 逐「模板 × 選擇」比對實際改動的欄位 ⊆ touches，且主欄位真的改了（除非選擇就是模板自己的值）。
const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
};
const live = (dimension, choices, basis, extraTouches = [], ext = {}) => Object.freeze({
  dimension, choices: Object.freeze([...choices]), status: CAPABILITY_STATUS.LIVE,
  minSimVersion: CAPABILITY_SIM_VERSION_3A, basis, note: null,
  touches: Object.freeze([basis.replace(/\(.*\)$/, ""), ...extraTouches]),
  resolverFields: deepFreeze([...(ext.resolverFields ?? [])]),
  engineReads: deepFreeze([...(ext.engineReads ?? [])]),
  gate: deepFreeze(ext.gate ?? null),
  //  requires：這一列只在某個規則集層存在時才可用（null＝任何規則集）。每時期型＝"tacticalDirector:core.v1"：
  //  v20 規則集（static Director）沒有每時期方針，組裝器會拒絕帶每時期選擇的計畫 ⇒ 戰術書在那些規則集下不顯示、舊計畫先拿掉。
  requires: ext.requires ?? null,
});
const claimsOf = (choices, metric, direction = "rank") => choices.map((choice) => ({ choice, metric, direction }));
const design = (dimension, note, choices = []) => Object.freeze({
  dimension, choices: Object.freeze([...choices]), status: CAPABILITY_STATUS.DESIGN,
  minSimVersion: null, basis: null, note,
  resolverFields: Object.freeze([]), engineReads: Object.freeze([]), gate: null, requires: null,
});

const PHASES = ["early", "mid", "late"];
/** 每時期型的列需要的規則集層（matchRuleset 的 layers.tacticalDirector）；格式 "<層>:<值>"。 */
export const PHASE_DIRECTOR = "tacticalDirector:core.v1";
/** 這一列在「Director 模式＝mode」的規則集下可用嗎（requires 為 null ⇒ 永遠可用；mode 缺少 ≡ "static"）。 */
export const rowAvailableUnder = (row, directorMode = "static") => row?.requires == null || row.requires === `tacticalDirector:${directorMode}`;
const PHASE_BASIS = { early: "macro.earlyGame", mid: "macro.midGame", late: "macro.lateGame" };
const LANES = ["top", "mid", "bot"];
const SEATS_WITH_LANE_CORE = { b1: "top", b3: "mid", b4: "adc" };   // 引擎 carryPriority 只認得 top／mid／adc

//  路姿態列。lane＝top／mid／bot（引擎的路位叫 adc，metric id 與 knob 路徑用 bot，座位 b1／b3／b4）。
function laneRow(lane, seat, choices, extra) {
  const pos = ["defensive", "standard", "aggressive", "split"].filter((c) => choices.includes(c));
  const hasSplit = choices.includes("split");
  const claims = [
    ...(hasSplit ? [{ choice: "split", metric: `seatFightEntriesPerMin.${seat}`, direction: "down" }] : []),
    ...(hasSplit ? choices.filter((c) => c !== "split").map((c) => ({ choice: c, ownIn: ["split"], metric: `seatFightEntriesPerMin.${seat}`, direction: "up" })) : []),
    ...claimsOf(choices.filter((c) => c !== "split"), `laneForward.${lane}`),
  ];
  return live(`lanes.${lane}.stance`, choices, `lanePlan.${lane === "bot" ? "adc" : lane}`, extra, {
    resolverFields: [`knobs.laneOffset.${lane}`, `knobs.gankWeights.${lane}`, ...(hasSplit ? ["knobs.splitLane", "knobs.splitPush"] : [])],
    engineReads: ["laneOffset", "gankWeights", ...(hasSplit ? ["splitLane", "splitPush"] : [])],
    gate: {
      rank: pos, claims,
      deltaFields: [`knobs.laneOffset.${lane}`],
      why: "站位＝這一路的英雄在對線期（60–480 秒）、處於「對線」狀態時，離己方主堡的平均距離（越前越大）；這是姿態本身宣稱的東西。"
        + (hasSplit ? "帶線＝帶線者參與團戰（進入團戰狀態）的次數變少；引擎每 6 秒擲一次 splitPush 決定留不留在線上，量的是他實際有沒有被拉去打團，不是擲骰結果。" : ""),
    },
  });
}

const ROWS = [
  //  ── live：現行 MobaTacticConfig 已有對應欄位 ───────────────────────────────
  //  時期姿態：macro.earlyGame／midGame／lateGame → toEngineTacticIdentity.phaseEngage／phaseJoin
  //  ⚠ 後期不提供 aggressive：引擎的後期偏移表（PHASE_ENGAGE_LATE）裡 aggressive 與 scaling 同值，
  //    兩個選項會解析成逐位元相同的旋鈕＝假選擇；留 scaling（語意較接近「後期」）。tools 的 gate 守住「同維度的每個選項旋鈕都不同」。
  ...PHASES.map((p, idx) => live(`phases.${p}.stance`, p === "late" ? STANCE_LATE : STANCE, PHASE_BASIS[p], [], {
    resolverFields: [`identity.phaseEngage.${idx}`, `identity.phaseJoin.${idx}`],
    engineReads: ["phaseEngage", "phaseJoin"],
    gate: {
      //  名次＝該階段「接戰偏移 phaseEngage／參團偏移 phaseJoin」由低到高（後期 scaling 反而高於 standard：scaling 隊伍後期要打）。
      rank: p === "late" ? ["defensive", "standard", "scaling"] : ["defensive", "scaling", "standard", "aggressive"],
      //  Phase 3a-C3-2（2026-10-22，Owner 核准）：指標由 fightEntriesPerMin.<p> 改為 phaseEngageDecisionsPerMin.<p>（C7 類別 4：
      //  姿態的主作用點是接戰分數，舊指標數的是進入團戰）。舊指標的結果留在歷史（retiredClaims），不刪不改。
      claims: claimsOf(p === "late" ? STANCE_LATE : STANCE, `phaseEngageDecisionsPerMin.${p}`),
      retiredClaims: [{ metric: `fightEntriesPerMin.${p}`, retiredAt: "2026-10-22", reason: "C7 class 4: the stance moves engage decisions, the old metric counted fight entries",
        evidence: "tools/fixtures/tactic_truth_3a_pre_c3_2_0efb759.json (verbatim copy of tools/fixtures/tactic_truth_3a.json at commit 0efb759; MEASURED_EXCLUSIONS rows under the old metric are in git at 0efb759)" }],
      deltaFields: [`identity.phaseEngage.${idx}`, `identity.phaseJoin.${idx}`],
      why: "數的是己方英雄做出**新的接戰決策**（決策重新評估、結果是 ENGAGE）的次數，依該 tick 結束時 Director 回答的時期分桶（480／960 邊界上至多差一個 tick），"
        + "除以該時期自己實際經過的分鐘數（不是整場比率拆開）；只有該時期自己的偏移在動。時期邊界一律問 Director。"
        + "新 seeds 紅藍複驗（含只數開始的版本）在 tools/fixtures/phase_stance_result_c3_2_rev1.json。",
    },
  })),
  //  打野節奏：macro.tempo → toEngineTactic.gankInterval（與 invadeWithMid）
  live("jungle.tempo", ["slow", "standard", "fast"], "macro.tempo", [], {
    //  連帶 knobs.invadeWithMid：toEngineTactic 在「tempo 為 fast 且 objectives.invadePriority ≥ 0.3」時讓中路跟進入侵（tempo 是其中一個輸入）。
    resolverFields: ["knobs.gankInterval", "knobs.invadeWithMid"], engineReads: ["gankInterval", "invadeWithMid"],
    gate: {
      rank: ["slow", "standard", "fast"], claims: claimsOf(["slow", "standard", "fast"], "ganksPerMin"),
      deltaFields: ["knobs.gankInterval"], inverseFields: ["knobs.gankInterval"],   // 間隔越長抓得越少 ⇒ 名次與旋鈕反向
      why: "引擎在打野真的出發抓人的那一刻（Gank 計時到點、沒有進行中的團戰）才加一；除以比賽分鐘數＝每分鐘出發幾次，不是「正在抓人」的時間占比。",
    },
  }),
  //  打野重心：lanePlan.jungle → gankWeights／invadeChance／gankIntervalK
  //  連帶 objectives.invadePriority：原本打野是 invade 的模板改選別的重心時降回中性（見 tacticChoiceMapping.js 檔頭）。
  live("jungle.focus", ["gank", "farm", "invade"], "lanePlan.jungle", ["objectives.invadePriority"], {
    resolverFields: ["identity.gankIntervalK", "knobs.invadeChance", "knobs.gankWeights.top", "knobs.gankWeights.mid", "knobs.gankWeights.bot", "knobs.invadeWithMid"],
    engineReads: ["gankIntervalK", "invadeChance", "gankWeights", "invadeWithMid"],
    gate: {
      claims: [
        { choice: "farm", metric: "ganksPerMin", direction: "down" },
        { choice: "invade", metric: "invasionsActed", direction: "up" },
        { choice: "gank", ownIn: ["farm"], metric: "ganksPerMin", direction: "up" },
        { choice: "gank", ownIn: ["invade"], metric: "invasionsActed", direction: "down" },
      ],
      deltaFields: ["identity.gankIntervalK", "knobs.invadeChance"],
      why: "發育＝抓人出發次數（同 jungle.tempo 的計數）變少；入侵＝開局 50 秒內有英雄真的走進「入侵」狀態的次數（不是只擲骰過關）。"
        + "farm 的 gankWeights 三路等比縮小，正規化後路線占比不變，所以不拿它當證據。",
    },
  }),
  //  三路姿態與「帶線（單一路）」：lanePlan.top／mid／adc → laneOffset／gankWeights／splitLane。
  //  上、中路多一個 split（＝帶線）；下路沒有（引擎契約 LANE_PLAN_ENUM.adc 不含 split）。
  //  連帶 macro.splitPush：選 split ⇒ 提到帶線的既有值；離開 split ⇒ 降回中性（引擎只在 splitLane 存在時才讀 splitPush）。
  laneRow("top", "b1", SPLITTABLE_LANE_STANCE, ["macro.splitPush"]),
  laneRow("mid", "b3", SPLITTABLE_LANE_STANCE, ["macro.splitPush"]),
  laneRow("bot", "b4", LANE_STANCE, []),
  //  輔助任務（b5 是輔助席）：lanePlan.support → roamK／protectHp
  live("seats.b5.mission", ["roam", "protect", "standard"], "lanePlan.support", [], {
    resolverFields: ["identity.roamK", "identity.protectHp"], engineReads: ["roamK", "protectHp"],
    gate: {
      claims: [
        { choice: "roam", metric: "supportRoamsPerMin", direction: "up" },
        { choice: "protect", metric: "supportProtectsPerMin", direction: "up" },
        { choice: "standard", ownIn: ["roam"], metric: "supportRoamsPerMin", direction: "down" },
        { choice: "standard", ownIn: ["protect"], metric: "supportProtectsPerMin", direction: "down" },
      ],
      deltaFields: ["identity.roamK", "identity.protectHp"],
      why: "遊走＝引擎在輔助真的選好路線出發（過了機率與「值不值得去」兩關）才加一，除以分鐘數；"
        + "保護＝輔助（b5）每做出一次新的「支援」決策加一（決策有鎖定期，持續保護同一人只算一次），除以分鐘數。",
    },
  }),
  //  核心是誰：economy.carryPriority（top／mid／adc）→ protectRole。只有 b1／b3／b4 對得到。
  ...Object.entries(SEATS_WITH_LANE_CORE).map(([seat, lane]) =>
    live(`seats.${seat}.priority`, ["core", "normal"], `economy.carryPriority(${lane})`, [], {
      resolverFields: ["identity.protectRole"], engineReads: ["protectRole"],
      gate: {
        claims: [
          { choice: "core", metric: `coreProtectsPerMin.${lane}`, direction: "up" },
          { choice: "normal", ownIn: ["core"], metric: `coreProtectsPerMin.${lane}`, direction: "down" },
        ],
        deltaFields: ["identity.protectRole"],
        why: "數的是己方保護型英雄每做出一次新的「支援」決策、而且被救的對象正好是這個席位（持續保護同一人只算一次），除以分鐘數；"
          + "對照組與實驗組用同一個計數，不是只在選了 core 才會增加的專用計數器。",
      },
    })),
  //  風險：macro.riskTolerance → retreatAt／retreatFloorShift／commitShift
  live("risk.tolerance", ["cautious", "balanced", "bold"], "macro.riskTolerance", [], {
    resolverFields: ["knobs.retreatAt", "identity.retreatFloorShift", "identity.commitShift"],
    engineReads: ["retreatAt", "retreatFloorShift", "commitShift"],
    gate: {
      rank: ["bold", "balanced", "cautious"], claims: claimsOf(["cautious", "balanced", "bold"], "retreatStartsPerMin"),
      deltaFields: ["knobs.retreatAt", "identity.retreatFloorShift", "identity.commitShift"],
      why: "數的是己方英雄「開始撤退」的次數（從沒在撤退變成撤退），除以分鐘數；撤退中的時間長短不影響這個數。",
    },
  }),
  //  ── 整場型（T10 Phase 2）：引擎旋鈕是整場共用的單一值 ⇒ 鍵也是整場一個。依時期細分的鍵（phases.*.grouping／objectiveOrder）
  //     在 Phase 3a-C 由 Director 的每時期方針支援後另列（見下方「每時期型」）。
  //  團戰姿態：macro.aggression → identity.engageBias（接戰分數偏移）；同一個欄位也平移三路站位（toEngineTactic 的 aggro 項）。
  live("teamfight.posture", ["passive", "standard", "aggressive"], "macro.aggression", [], {
    resolverFields: ["identity.engageBias", "knobs.laneOffset.top", "knobs.laneOffset.mid", "knobs.laneOffset.bot"],
    engineReads: ["engageBias", "laneOffset"],
    gate: {
      rank: ["passive", "standard", "aggressive"], claims: claimsOf(["passive", "standard", "aggressive"], "engageDecisionsPerMin"),
      deltaFields: ["identity.engageBias"],
      why: "數的是己方英雄每做出一次新的「接戰」決策（決策有鎖定期，沿用舊決策不算），除以分鐘數；engageBias 平移的正是這個決策的分數。",
    },
  }),
  //  集結：macro.grouping → knobs.joinFight（一般團戰的參團率）
  live("teamfight.grouping", ["standard", "tight"], "macro.grouping", [], {
    resolverFields: ["knobs.joinFight"], engineReads: ["joinFight"],
    gate: {
      rank: ["standard", "tight"], claims: claimsOf(["standard", "tight"], "fightEntriesPerMinAll"),
      deltaFields: ["knobs.joinFight"],
      why: "數的是己方英雄「進入團戰狀態」的次數（同時期姿態的計數，但整場合計），除以比賽分鐘數；joinFight 是被叫去參團時答應的機率。",
    },
  }),
  //  物件重心：objectives.dragonPriority／baronPriority → knobs.dragonJoin／baronJoin；towerPriority → identity.siegeBias（連帶三路站位）
  ...[["dragon", "dragonJoin"], ["baron", "baronJoin"]].map(([key, knob]) =>
    live(`objectives.${key}`, ["low", "standard", "high"], `objectives.${key}Priority`, [], {
      resolverFields: [`knobs.${knob}`], engineReads: [knob],
      gate: {
        //  Owner 裁定（2026-10-22 晚）：v20 的能力與排除表完全依 v20 既有證據 ⇒ 整場巨龍／巴龍的 G-A7 指標維持 v20 原本的
        //  objectiveFightEntriesPerMin.<k>（不改成 C4 的 contestShare）；C4 在 v21 量到的整場證據只留在 REPLICATION_V21_SCOPE_ONLY。
        rank: ["low", "standard", "high"], claims: claimsOf(["low", "standard", "high"], `objectiveFightEntriesPerMin.${key}`),
        deltaFields: [`knobs.${knob}`],
        why: "數的是己方英雄在這個物件的坑附近「進入團戰狀態」的次數（坑的位置讀引擎當場的物件位置，佈局對調也跟著走），除以分鐘數；"
          + "量的是人真的去了坑邊集結，不是物件窗的擲骰結果。",
      },
    })),
  live("objectives.tower", ["low", "standard", "high"], "objectives.towerPriority", [], {
    resolverFields: ["identity.siegeBias", "knobs.laneOffset.top", "knobs.laneOffset.mid", "knobs.laneOffset.bot"],
    engineReads: ["siegeBias", "laneOffset"],
    gate: {
      rank: ["low", "standard", "high"], claims: claimsOf(["low", "standard", "high"], "siegeWindowsPerMin"),
      deltaFields: ["identity.siegeBias"],
      why: "數的是己方「攻城主動權窗」開啟的次數（打贏一波之後決定去推塔的那一刻；窗持續多久不影響這個數），除以分鐘數。",
    },
  }),

  //  ── 每時期型（Phase 3a-C3-3／C4，2026-10-22 升級 live）：選擇只覆寫「那一個時期」的設定（PHASE_CHOICE_MAPPING），
  //     Director 在該時期改讀那一份方針；其他時期不變。resolverFields 是 resolver 輸出 phases[i] 底下的欄位。
  //     證據：n=400 新 seeds 紅藍複驗（C3-3 tools/fixtures/phase_options_result_c3_3.json、C4 phase_options_result_c4.json）＋G-A7 冒煙。
  //     沒站住的選擇（後期巴龍、後期推塔）在 REPLICATION_WITHHELD；前期沒有巴龍（對照表不提供）。
  ...PHASES.map((p, idx) => live(`phases.${p}.grouping`, ["standard", "group"], "macro.grouping", [], {
    requires: PHASE_DIRECTOR,
    resolverFields: [`phases.${idx}.knobs.joinFight`], engineReads: ["joinFight"],
    gate: {
      claims: [{ choice: "group", metric: `joinGoGeneralStartsPerMin.${p}`, direction: "up" }],
      deltaFields: [`phases.${idx}.knobs.joinFight`],
      why: "數的是上／中／下路英雄在這個時期「決定去參團」的次數（參團擲骰由否變成是；重擲仍為是不算），除以該時期自己的分鐘數。"
        + "交戰狀態機下熱點都是新物件，『一般熱點』與全部熱點相同；龍／巴龍坑的集結走另一條路（_objJoinV3），不在這個數裡。",
    },
  })),
  ...PHASES.map((p, idx) => live(`phases.${p}.objectiveOrder`, p === "early" ? ["none", "dragon", "towers"] : ["none", "dragon", "baron", "towers"],
    "objectives.dragonPriority", p === "early" ? ["objectives.towerPriority"] : ["objectives.baronPriority", "objectives.towerPriority"], {
      requires: PHASE_DIRECTOR,
      //  推塔的連帶：towerPriority 在投影時也讓三路 laneOffset 前移（與整場 objectives.tower 相同）；宣稱只有圍塔窗口，站位連帶要在文案揭露。
      resolverFields: [`phases.${idx}.knobs.dragonJoin`, ...(p === "early" ? [] : [`phases.${idx}.knobs.baronJoin`]), `phases.${idx}.identity.siegeBias`,
        `phases.${idx}.knobs.laneOffset.top`, `phases.${idx}.knobs.laneOffset.mid`, `phases.${idx}.knobs.laneOffset.bot`],
      engineReads: ["dragonJoin", ...(p === "early" ? [] : ["baronJoin"]), "siegeBias", "laneOffset"],
      gate: {
        claims: [
          { choice: "dragon", metric: `contestShare.dragon.${p}`, direction: "up" },
          ...(p === "early" ? [] : [{ choice: "baron", metric: `contestShare.baron.${p}`, direction: "up" }]),
          { choice: "towers", metric: `siegeWindowsPerMin.${p}`, direction: "up" },
        ],
        deltaFields: [`phases.${idx}.knobs.dragonJoin`, ...(p === "early" ? [] : [`phases.${idx}.knobs.baronJoin`]), `phases.${idx}.identity.siegeBias`],
        why: "龍／巴龍優先：這個時期每次物件出現，己方有英雄進入坑位 9 單位內的比例（出現在坑邊，不是拿到）；"
          + "推塔優先：這個時期己方攻城主動權窗開啟的次數 ÷ 該時期分鐘數。只宣稱「排第一」的物件，不宣稱其他物件變不重要。",
      },
    })),

  //  ── design：規格列了，但現行引擎沒有可解析的旋鈕 ────────────────────────────
  design("winCondition", "勝利路徑沒有對應的引擎旋鈕，列舉內容規格尚未定稿"),
  ...PHASES.flatMap((p) => [
    design(`phases.${p}.focusLane`, "引擎沒有「依時期指定主攻路」的旋鈕（Gank 路線權重由路姿態推導，整場共用）"),
    design(`phases.${p}.tradePolicy`, "資源交換屬 3b（規格標 *）；引擎沒有對應旋鈕"),
  ]),
  ...LANES.map((l) => design(`lanes.${l}.wave`, "兵線處理屬 3b（規格標 *）；引擎沒有對應旋鈕")),
  design("jungle.route", "打野路線屬 3b（規格標 *）；引擎沒有可指定的路線"),
  //  b1／b3／b4／b5 的任務與 b2／b5 的優先：引擎只讀 lanePlan（依路位，不依席位）與 carryPriority（只認上／中／下）
  ...["b1", "b2", "b3", "b4"].map((s) => design(`seats.${s}.mission`, "引擎只有輔助席的任務旋鈕（lanePlan.support），其餘席位沒有")),
  ...["b2", "b5"].map((s) => design(`seats.${s}.priority`, "引擎的核心旋鈕（economy.carryPriority）只認得上／中／下路，打野與輔助無法成為核心")),
  design("teamfight.style", "團戰風格屬 3b（規格標 *）"),
  design("teamfight.engager", "開團手屬 3b（規格標 *）"),
  design("teamfight.focusTarget", "集火目標屬 3b（規格標 *）"),
  design("teamfight.peelFor", "保護對象屬 3b（規格標 *）"),
  design("risk.comeback", "翻盤策略屬 3b（規格標 *）"),
  design("comms.shotcaller", "主 Call 屬 3b（規格標 *）"),
  design("comms.secondCaller", "副 Call 屬 3b（規格標 *）"),
];

export const CAPABILITY_ROWS = Object.freeze(ROWS);
const BY_KEY = new Map(ROWS.map((r) => [r.dimension, r]));

/** 查一個維度的列；沒有這個鍵回 null（呼叫端把它當 unknown key）。 */
export const registryRow = (key) => (typeof key === "string" ? BY_KEY.get(key) ?? null : null);
/** 所有 live 列（frozen 陣列，穩定順序＝表順序）。 */
export const liveRows = () => CAPABILITY_ROWS.filter((r) => r.status === CAPABILITY_STATUS.LIVE);
/** 這個鍵存在，而且是 design（只是還沒接上，不是打錯字）。 */
export const isDesignKey = (key) => registryRow(key)?.status === CAPABILITY_STATUS.DESIGN;
const simNumber = (v) => { const m = /^moba-sim\.v(\d+)$/.exec(typeof v === "string" ? v : ""); return m ? Number(m[1]) : null; };
/** 這一列在 simVersion 上可用嗎（minSimVersion ≤ simVersion）。simVersion 不是 `moba-sim.vN` ⇒ false。 */
const availableAt = (row, simVersion) => {
  const have = simNumber(simVersion), need = simNumber(row.minSimVersion);
  return have !== null && need !== null && have >= need;
};
/**
 * key 是 live 列，且 value 是它的列舉成員。型別不對（數字、物件）一律 false。
 * 第三個參數（可省略）＝模擬版本：給了就同時要求這一列在那個版本上已經可用（早於 minSimVersion ⇒ false）。
 */
export function isLiveChoice(key, value, simVersion) {
  const r = registryRow(key);
  if (!r || r.status !== CAPABILITY_STATUS.LIVE || typeof value !== "string" || !r.choices.includes(value)) return false;
  return simVersion === undefined ? true : availableAt(r, simVersion);
}

//  Task 10 規格名稱（簡報／brief 用的名字）：與上面同一份資料，只是別名，不是第二份列表。
/** 所有列（live＋design）。 */
export const CAPABILITIES = CAPABILITY_ROWS;
/** 在 simVersion 上可用的 live 列（預設＝3a 隨附的 moba-sim.v21）。 */
export const liveCapabilities = (simVersion = CAPABILITY_SIM_VERSION_3A) => liveRows().filter((r) => availableAt(r, simVersion));

/**
 * 量測後逐模板不提供的選擇（G-A7 的結論，**資料表**）：[{ template, dimension, choice, reason, metric, n, z, mean? }]。
 * template 為 "*" ＝所有模板（等於這個選擇退回 design，但保留在列舉裡讓錯誤碼明確）。
 * tacticChoiceMapping 的 offeredDetail 讀它：被列入的選擇回報 `withheld: no_measured_effect`。
 * tools/check_tactic_truth_3a.mjs 驗證這張表與量測結果表（tools/fixtures/tactic_truth_3a.json）完全一致。
 */
//  reason：no_measured_effect＝方向對但 z < 2 或方向不明顯；reversed_effect＝顯著朝反方向（z ≤ −2）。z／n 是事前登記指標的配對結果（seeds 1–40）。
//  ⚠ 這些不是「證明沒有效果」：n=40 檢定力有限，許多是旋鈕本來就很小（例如階段姿態只平移 4–8 個百分點）。
//    Owner 若要保留，另以 n≥400 的新 seeds 證明（見 task-10-report.md），不是放大係數。
//  scope（Phase 3a-C，Owner 2026-10-23 跨版本證據隔離）：省略＝所有規則集；"static"＝只在 Director static（v20 類規則集）生效——
//  v20 的真實性列（balanceTool.v20 量的）失敗、但同一選擇被 v21 的 n=400 複驗取代時，v21 證據只能開放到 v21，v20 照 v20 證據不提供。
const ex = (template, dimension, choice, reason, metric, n, z, scope) => ({ template, dimension, choice, reason, metric, n, z, ...(scope ? { scope } : {}) });
export const MEASURED_EXCLUSIONS = deepFreeze([
  //  時期姿態 8 列（fightEntriesPerMin.<p>，n=40）已由 n=400 紅藍複驗取代（REPLICATION_CONFIRMED／REPLICATION_WITHHELD；Phase 3a-C3-2 收尾）；
  //  舊列與舊結果表保留在 git 歷史（commit 0efb759 的 tools/fixtures/tactic_truth_3a.json），不刪不改證據本身。
  //  n=400 複驗只涵蓋 std ⇒ 弱點模板仍由新指標 phaseEngageDecisionsPerMin.<p> 的 n=40 列決定（2026-10-22 重測，只對該模板不提供）：
  ex("classic.m4", "phases.early.stance", "scaling", "no_measured_effect", "phaseEngageDecisionsPerMin.early", 40, 1.9),
  ex("v2.defensive_hold", "phases.mid.stance", "scaling", "no_measured_effect", "phaseEngageDecisionsPerMin.mid", 40, 0.3),
  ex("classic.m1", "phases.late.stance", "defensive", "unmeasurable", "phaseEngageDecisionsPerMin.late", 19, -2.85),
  ex("classic.m1", "phases.late.stance", "scaling", "unmeasurable", "phaseEngageDecisionsPerMin.late", 19, 2.2),
  //  跨版本證據隔離（Owner 2026-10-23）：時期姿態在 v20 也能選；v20 的 n=40 列（balanceTool.v20）沒過的，C3-2 的 v21 複驗不能替 v20 開放 ⇒ 只在 static 排除。
  ex("*", "phases.mid.stance", "aggressive", "no_measured_effect", "phaseEngageDecisionsPerMin.mid", 40, 1.83, "static"),
  ex("*", "phases.mid.stance", "scaling", "no_measured_effect", "phaseEngageDecisionsPerMin.mid", 40, -1.79, "static"),
  ex("*", "jungle.tempo", "slow", "no_measured_effect", "ganksPerMin", 40, -0.85),
  ex("*", "jungle.tempo", "fast", "no_measured_effect", "ganksPerMin", 40, 0.42),
  ex("classic.m1", "jungle.focus", "farm", "no_measured_effect", "ganksPerMin", 40, -1.38),
  ex("*", "lanes.top.stance", "aggressive", "no_measured_effect", "laneForward.top", 40, 0.71),
  ex("*", "lanes.top.stance", "defensive", "reversed_effect", "laneForward.top", 40, 3.35),
  ex("classic.m7", "lanes.top.stance", "split", "no_measured_effect", "seatFightEntriesPerMin.b1", 40, -0.97),
  ex("*", "lanes.mid.stance", "aggressive", "reversed_effect", "laneForward.mid", 40, -3.23),
  ex("*", "lanes.mid.stance", "defensive", "no_measured_effect", "laneForward.mid", 40, -0.19),
  ex("classic.m1", "lanes.bot.stance", "aggressive", "no_measured_effect", "laneForward.bot", 40, -0.08),
  ex("*", "lanes.bot.stance", "defensive", "no_measured_effect", "laneForward.bot", 40, 0.99),
  ex("classic.m1", "seats.b1.priority", "core", "no_measured_effect", "coreProtectsPerMin.top", 40, 1.43),
  ex("*", "seats.b3.priority", "core", "no_measured_effect", "coreProtectsPerMin.mid", 40, 1.43),
  ex("*", "seats.b4.priority", "core", "no_measured_effect", "coreProtectsPerMin.adc", 40, 1),
  ex("classic.m2", "risk.tolerance", "cautious", "no_measured_effect", "retreatStartsPerMin", 40, 0.79),
  ex("*", "risk.tolerance", "bold", "no_measured_effect", "retreatStartsPerMin", 40, -1.64),
  ex("*", "teamfight.grouping", "tight", "no_measured_effect", "fightEntriesPerMinAll", 40, 0.73),
  ex("*", "objectives.dragon", "low", "no_measured_effect", "objectiveFightEntriesPerMin.dragon", 40, -0.74),
  ex("*", "objectives.dragon", "high", "no_measured_effect", "objectiveFightEntriesPerMin.dragon", 40, -0.13),
  ex("*", "objectives.baron", "low", "no_measured_effect", "objectiveFightEntriesPerMin.baron", 40, -0.88),
  ex("*", "objectives.baron", "high", "reversed_effect", "objectiveFightEntriesPerMin.baron", 40, -2.03),
  ex("*", "objectives.tower", "low", "no_measured_effect", "siegeWindowsPerMin", 40, 0.87),
  ex("classic.m3", "objectives.tower", "high", "no_measured_effect", "siegeWindowsPerMin", 40, 1.97),
  //  Phase 3a-C3-3／C4 每時期型（2026-10-23 真實性表重測，balanceTool.v21，n=40）：n=400 複驗只涵蓋 std ⇒ 弱點模板由 n=40 列決定，只對該模板不提供。
  ex("classic.m8", "phases.mid.grouping", "group", "no_measured_effect", "joinGoGeneralStartsPerMin.mid", 40, 0.7),
  ex("classic.m8", "phases.late.grouping", "group", "no_measured_effect", "joinGoGeneralStartsPerMin.late", 27, 1.13),
  ex("classic.m2", "phases.early.objectiveOrder", "dragon", "no_measured_effect", "contestShare.dragon.early", 40, 1.78),
  ex("classic.m2", "phases.mid.objectiveOrder", "dragon", "no_measured_effect", "contestShare.dragon.mid", 40, 1.75),
  ex("classic.m8", "phases.mid.objectiveOrder", "baron", "no_measured_effect", "contestShare.baron.mid", 40, 0),
  ex("classic.m2", "phases.mid.objectiveOrder", "towers", "no_measured_effect", "siegeWindowsPerMin.mid", 40, 1.11),
  ex("classic.m2", "phases.late.objectiveOrder", "dragon", "no_measured_effect", "contestShare.dragon.late", 27, 0.57),
  ex("classic.m8", "phases.late.objectiveOrder", "baron", "no_measured_effect", "contestShare.baron.late", 22, 0),
  ex("classic.m2", "phases.late.objectiveOrder", "towers", "no_measured_effect", "siegeWindowsPerMin.late", 27, 0.6),
]);
/**
 * 這個（模板, 維度, 選擇）被量測排除嗎？回傳該列或 null。
 * mode＝目前規則集的 Director 模式（"static"＝v20 類、"core.v1"＝v21）：帶 scope 的列只在同一個模式生效。
 * 省略 mode ⇒ 只看不分模式的列（計畫本身與規則集無關：與 Registry requires 相同，計畫可以存，本場／畫面再依模式過濾）。
 */
export const measuredExclusion = (template, dimension, choice, mode = null) =>
  MEASURED_EXCLUSIONS.find((x) => x.dimension === dimension && x.choice === choice && (x.template === "*" || x.template === template)
    && (x.scope === undefined || x.scope === mode)) ?? null;

/**
 * 複驗後撤下的選擇（Owner 裁示：邊際選項要用新 seeds、紅藍雙方複驗；證據不足的不再提供）。**獨立於 MEASURED_EXCLUSIONS**：
 * 那張表必須與真實性結果表（tools/fixtures/tactic_truth_3a.json）逐筆相同，這張表則由複驗結果檔
 * （tools/fixtures/tactic_followup_3a_replication.json，seeds 1001–1400）推出：verdict ≠ confirmed 的列。
 * 資料：{ template:"*", dimension, choice, reason:"not_replicated", verdict, metric, blue:{n,rel,z}, red:{n,rel,z} }（rel、z 照抄結果檔，六位小數）。
 * 只影響「提供給玩家挑哪些」（offeredChoiceDetail 預設會套用；withMeasured:false 兩張表都不套）；模板自己的預設值不受影響，已存的計畫照常解析。
 * tools/check_tactic_replication_3a.mjs 驗證這張表與複驗結果檔完全一致。
 * 第二個來源（Phase 3a-C3-2 收尾）：tools/fixtures/phase_stance_result_c3_2_rev1.json 的列——verdict ≠ confirmed ⇒ not_replicated；
 * confirmed 但 Owner 暫緩 ⇒ reason "owner_hold"（verdict 仍記 confirmed）。核准的列在 REPLICATION_CONFIRMED。
 * 第三、四個來源（Phase 3a-C3-3／C4）：tools/fixtures/phase_options_result_c3_3.json、phase_options_result_c4.json，規則同上。
 */
const rw = (dimension, choice, verdict, metric, blue, red) => ({ template: "*", dimension, choice, reason: "not_replicated", verdict, metric, blue, red });
const oh = (dimension, choice, metric, blue, red) => ({ template: "*", dimension, choice, reason: "owner_hold", verdict: "confirmed", metric, blue, red });
export const REPLICATION_WITHHELD = deepFreeze([
  rw("lanes.top.stance", "split", "one_sided", "seatFightEntriesPerMin.b1", { n: 400, rel: -0.059062, z: -3.583404 }, { n: 400, rel: -0.015394, z: -0.935816 }),
  rw("lanes.bot.stance", "aggressive", "insufficient", "laneForward.bot", { n: 400, rel: 0.021285, z: 4.177613 }, { n: 400, rel: 0.002445, z: 0.560144 }),
  rw("seats.b1.priority", "core", "one_sided", "coreProtectsPerMin.top", { n: 400, rel: 0.038399, z: 4.140798 }, { n: 400, rel: 0.057683, z: 4.351134 }),
  rw("risk.tolerance", "cautious", "insufficient", "retreatStartsPerMin", { n: 400, rel: 0.025238, z: 3.904687 }, { n: 400, rel: 0.017559, z: 2.725016 }),
  //  Phase 3a-C3-2 收尾（2026-10-22，Owner 裁示）：前期／中期 scaling 在修正儀器的複驗（tools/fixtures/phase_stance_result_c3_2_rev1.json，
  //  seeds 18001–18400）紅藍雙方都 confirmed，但 Owner 指示「維持 design，不開放」⇒ 原因 owner_hold（數字照抄結果檔，不是沒站住）。
  oh("phases.early.stance", "scaling", "engageDecisionsPerMin.early", { n: 400, rel: -0.059975, z: -6.217762 }, { n: 400, rel: -0.07647, z: -8.469172 }),
  oh("phases.mid.stance", "scaling", "engageDecisionsPerMin.mid", { n: 400, rel: -0.063009, z: -5.997 }, { n: 400, rel: -0.072286, z: -7.002594 }),
  //  Phase 3a-C4（tools/fixtures/phase_options_result_c4.json，seeds 3401–3800）：後期巴龍優先 one_sided（藍方 z 2.29）、
  //  後期推塔優先 insufficient（幅度過 5 % 但 z 未達 3）⇒ 不提供；不放大係數（原因假設見 review/tactic-book-3a/C4_物件優先_結果解讀.md）。
  rw("phases.late.objectiveOrder", "baron", "one_sided", "contestShare.baron.late", { n: 209, rel: 0.096459, z: 2.293164 }, { n: 209, rel: 0.142357, z: 3.902204 }),
  rw("phases.late.objectiveOrder", "towers", "insufficient", "siegeWindowsPerMin.late", { n: 236, rel: 0.057889, z: 1.717821 }, { n: 236, rel: 0.073891, z: 2.864628 }),
]);
/** 這個（模板, 維度, 選擇）被複驗撤下嗎？回傳該列或 null。 */
export const replicationWithheld = (template, dimension, choice) =>
  REPLICATION_WITHHELD.find((x) => x.dimension === dimension && x.choice === choice && (x.template === "*" || x.template === template)) ?? null;

/**
 * 以 n=400 新 seeds 紅藍複驗**取代** n=40 真實性列的選擇（Phase 3a-C3-2 收尾，2026-10-22 Owner 核准六個時期姿態）。
 * 來源：tools/fixtures/phase_stance_result_c3_2_rev1.json（seeds 18001–18400、技能層開、修正後的儀器）；
 *       Phase 3a-C3-3／C4 起另有 phase_options_result_c3_3.json（seeds 18401–18800）、phase_options_result_c4.json（seeds 3401–3800）。
 * 真實性結果表（seeds 1–40）仍照常量測、照常記錄；對**這份複驗涵蓋的選擇**，排除與否改由複驗判定（n=400 的證據取代 n=40 的煙霧測試），
 * 所以它們不會出現在 MEASURED_EXCLUSIONS；confirmed 且 Owner 核准的列在這張表，confirmed 但 Owner 暫緩的列在 REPLICATION_WITHHELD（owner_hold）。
 * tools/check_tactic_replication_3a.mjs 驗證：兩張表合起來恰好覆蓋結果檔的每一列，數字照抄；check_tactic_truth_3a.mjs 的推導讀同一個結果檔。
 * ⚠ 證據範圍是 balanceTool.v21（工具規則集）、std 模板；Registry 的 live 狀態是全域的。其他模板仍由真實性表的弱點模板列決定是否對該模板排除。
 * metric 是複驗儀器（phaseStudySim／phaseBucketSim）的名稱 engageDecisionsPerMin.<p>；與 G-A7 的 phaseEngageDecisionsPerMin.<p> 數同一件事（check_tactic_replication_3a V7 綁定）。
 */
const rc = (dimension, choice, metric, blue, red) => ({ template: "*", dimension, choice, reason: "replicated", verdict: "confirmed", metric, blue, red });
export const REPLICATION_CONFIRMED = deepFreeze([
  rc("phases.early.stance", "aggressive", "engageDecisionsPerMin.early", { n: 400, rel: 0.156587, z: 14.42979 }, { n: 400, rel: 0.11385, z: 11.028582 }),
  rc("phases.early.stance", "defensive", "engageDecisionsPerMin.early", { n: 400, rel: -0.110551, z: -11.169319 }, { n: 400, rel: -0.11502, z: -11.357369 }),
  rc("phases.mid.stance", "aggressive", "engageDecisionsPerMin.mid", { n: 400, rel: 0.116298, z: 10.209325 }, { n: 400, rel: 0.127255, z: 10.666868 }),
  rc("phases.mid.stance", "defensive", "engageDecisionsPerMin.mid", { n: 400, rel: -0.117008, z: -9.94678 }, { n: 400, rel: -0.120886, z: -10.617464 }),
  rc("phases.late.stance", "defensive", "engageDecisionsPerMin.late", { n: 243, rel: -0.12713, z: -7.062536 }, { n: 243, rel: -0.119231, z: -7.248935 }),
  rc("phases.late.stance", "scaling", "engageDecisionsPerMin.late", { n: 243, rel: 0.077244, z: 4.210787 }, { n: 243, rel: 0.100371, z: 5.56091 }),
  //  Phase 3a-C3-3（tools/fixtures/phase_options_result_c3_3.json，seeds 18401–18800）：每時期成團，紅藍兩側 confirmed。
  rc("phases.early.grouping", "group", "joinGoGeneralStartsPerMin.early", { n: 400, rel: 0.107018, z: 4.676797 }, { n: 400, rel: 0.16, z: 6.689111 }),
  rc("phases.mid.grouping", "group", "joinGoGeneralStartsPerMin.mid", { n: 400, rel: 0.249005, z: 7.951875 }, { n: 400, rel: 0.168016, z: 5.706359 }),
  rc("phases.late.grouping", "group", "joinGoGeneralStartsPerMin.late", { n: 237, rel: 0.26139, z: 3.901966 }, { n: 237, rel: 0.292017, z: 4.166681 }),
  //  Phase 3a-C4（tools/fixtures/phase_options_result_c4.json，seeds 3401–3800）：每時期物件優先，紅藍兩側 confirmed（整場龍／巴龍見 REPLICATION_V21_SCOPE_ONLY）。
  //  主張是「出現在坑邊」（contestShare），不是拿到物件；推塔優先連帶三路 laneOffset 前移（文案揭露）。
  rc("phases.early.objectiveOrder", "dragon", "contestShare.dragon.early", { n: 400, rel: 0.093023, z: 6.215495 }, { n: 400, rel: 0.125, z: 7.439383 }),
  rc("phases.mid.objectiveOrder", "dragon", "contestShare.dragon.mid", { n: 400, rel: 0.172732, z: 8.148497 }, { n: 400, rel: 0.172471, z: 7.177891 }),
  rc("phases.late.objectiveOrder", "dragon", "contestShare.dragon.late", { n: 228, rel: 0.267101, z: 5.397529 }, { n: 230, rel: 0.346789, z: 7.393996 }),
  rc("phases.mid.objectiveOrder", "baron", "contestShare.baron.mid", { n: 400, rel: 0.062927, z: 5.542482 }, { n: 400, rel: 0.07438, z: 6.157781 }),
  rc("phases.early.objectiveOrder", "towers", "siegeWindowsPerMin.early", { n: 400, rel: 0.766467, z: 5.387618 }, { n: 400, rel: 0.702247, z: 5.314 }),
  rc("phases.mid.objectiveOrder", "towers", "siegeWindowsPerMin.mid", { n: 400, rel: 0.28016, z: 5.441881 }, { n: 400, rel: 0.210547, z: 3.909199 }),
]);
/**
 * 只在 v21 規則集量到的複驗（Phase 3a-C4，2026-10-22 審查後）：整場巨龍 high／low、巴龍 high 在 balanceTool.v21（Director core.v1、laneFrame
 * teamRelative）紅藍兩側 confirmed，但這三個選擇在 v20 規則集（正式站現況）也可選，而 v21 的證據不能直接代表 v20（laneFrame 改變紅方路名）。
 * ⇒ **不**取代真實性表、**不**影響提供清單：v20 是否提供仍由真實性表（seeds 1–40）決定；這張表只留證據；Owner 2026-10-22 已裁定**不**以 v21 證據開放到 v20。
 * 形狀同 REPLICATION_CONFIRMED；tools/check_tactic_replication_3a.mjs 驗證它＝C4 結果檔裡整場選項的 confirmed 列。
 */
export const REPLICATION_V21_SCOPE_ONLY = deepFreeze([
  rc("objectives.dragon", "high", "contestShare.dragon.early+mid+late", { n: 400, rel: 0.148519, z: 10.514663 }, { n: 400, rel: 0.193406, z: 12.537589 }),
  rc("objectives.dragon", "low", "contestShare.dragon.early+mid+late", { n: 400, rel: -0.097228, z: -6.305574 }, { n: 400, rel: -0.100074, z: -6.3118 }),
  rc("objectives.baron", "high", "contestShare.baron.early+mid+late", { n: 400, rel: 0.092886, z: 6.549204 }, { n: 400, rel: 0.089905, z: 6.379305 }),
]);
