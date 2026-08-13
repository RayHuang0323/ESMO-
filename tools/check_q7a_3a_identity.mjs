#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_3a_identity.mjs — Q7a-3a：Circuit / Event 契約與 legacy 升級
//
//  執行：repo 根目錄 `node tools/check_q7a_3a_identity.mjs`；**失敗時 exit 1**。
//
//  ── 3a 的紅線只有一條 ────────────────────────────────────────────────────
//  **舊存檔升級之後，每一個既有 id 逐字元不變。**
//  `competition.id` 是 stage → fixture → seed → session 的上游；改了它，
//  既有 fixture 與已封存賽果就全部對不上。所以 3a 只補
//  `circuitId` / `eventId` / `idScheme`，一個既有欄位都不動。
//
//  本檔驗四件事：
//    ① Circuit / Event 契約本身（id 決定性、驗證擋得住壞資料）
//    ② 升級是**純增量**：既有欄位逐字元不變、id 一個都沒動
//    ③ 升級**冪等**：跑第二次回傳同一個物件參考（不是只有值相同）
//    ④ 走完整 store：新局 → 建賽季 → 存檔 → 重載，所有 id 不變
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const {
  CIRCUIT_VERSION, EVENT_VERSION, ID_SCHEMES, LEGACY_KEY,
  createCircuit, createEvent, validateCircuit, validateEvent,
  competitionIdForEvent, upgradeCompetitionIdentity, needsIdentityUpgrade, isLegacyIdentity,
} = await import("../src/platform/contracts/circuit.js");
const { createCompetition } = await import("../src/platform/contracts/competition.js");
const { createSeasonState, upgradeSeasonIdentity } = await import("../src/platform/competition/seasonState.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

console.log("══ Q7a-3a：Circuit / Event 身分與 legacy 升級 ══\n");

// ── 1) Circuit / Event 契約 ────────────────────────────────────────────
{
  const c = createCircuit({ gameMode: "moba", season: 1, circuitKey: "asia-pro" });
  ck("1) 建得出 Circuit", c.ok && c.circuit.schema === CIRCUIT_VERSION, c.circuit.id);
  ck("1b) id 決定性（同輸入同 id）",
    createCircuit({ gameMode: "moba", season: 1, circuitKey: "asia-pro" }).circuit.id === c.circuit.id);
  ck("1c) 不同賽季／不同 key ⇒ 不同 id",
    createCircuit({ gameMode: "moba", season: 2, circuitKey: "asia-pro" }).circuit.id !== c.circuit.id &&
    createCircuit({ gameMode: "moba", season: 1, circuitKey: "asia-am" }).circuit.id !== c.circuit.id);
  ck("1d) 缺 circuitKey / 壞 gameMode ⇒ 拒絕",
    !createCircuit({ gameMode: "moba", season: 1 }).ok &&
    !createCircuit({ gameMode: "lol", season: 1, circuitKey: "x" }).ok);

  const e = createEvent({ circuit: c.circuit, eventKey: "spring-split" });
  ck("2) 建得出 Event，且掛在 Circuit 底下",
    e.ok && e.event.schema === EVENT_VERSION && e.event.circuitId === c.circuit.id, e.event.id);
  ck("2b) Event id 含 Circuit id ⇒ 不同 Circuit 的同名站不會撞",
    createEvent({ circuit: createCircuit({ gameMode: "moba", season: 1, circuitKey: "asia-am" }).circuit, eventKey: "spring-split" }).event.id !== e.event.id);
  ck("2c) 沒有合法 Circuit ⇒ 拒絕", !createEvent({ circuit: null, eventKey: "x" }).ok);
  ck("2d) 驗證擋得住壞資料",
    !validateCircuit({}).ok && !validateEvent({}).ok &&
    validateCircuit(c.circuit).ok && validateEvent(e.event).ok);
  ck("3) v2 的 competition.id 推導含 Event 身分（3a 尚無呼叫端）",
    competitionIdForEvent(e.event, "regular") === `comp:${e.event.id}:regular`,
    competitionIdForEvent(e.event, "regular"));
}

// ── 2) 升級是純增量，一個既有欄位都不動 ────────────────────────────────
{
  const made = createCompetition({ gameMode: "moba", season: 1 });
  const before = made.competition;
  const beforeJson = JSON.stringify(before);
  ck("4) 既有賽事一開始沒有身分資訊", needsIdentityUpgrade(before) === true, before.id);

  const up = upgradeCompetitionIdentity(before);
  ck("4b) **`competition.id` 逐字元不變**", up.competition.id === before.id, up.competition.id);
  ck("4c) **所有既有欄位逐字元不變**（只增不改）",
    Object.keys(before).every((k) => JSON.stringify(up.competition[k]) === JSON.stringify(before[k])),
    `既有 ${Object.keys(before).length} 個欄位`);
  ck("4d) 新增的正好是三個身分欄位",
    JSON.stringify(Object.keys(up.competition).filter((k) => !(k in before)).sort()) ===
    JSON.stringify(["circuitId", "eventId", "idScheme"]));
  ck("4e) 標記為 legacy 推導", isLegacyIdentity(up.competition) && up.competition.idScheme === ID_SCHEMES.legacy);
  ck("4f) 合成的容器互相指得到",
    up.circuit.eventIds.includes(up.event.id) && up.event.competitionIds.includes(before.id) &&
    up.event.circuitId === up.circuit.id && up.circuit.circuitKey === LEGACY_KEY);
  ck("4g) **原物件沒有被就地改動**", JSON.stringify(before) === beforeJson);

  //  冪等：不是「值相同」，是**同一個參考**
  const again = upgradeCompetitionIdentity(up.competition);
  ck("5) 升級冪等，且回傳同一個物件參考（不會每次載入都重繪）",
    again.alreadyUpgraded === true && again.competition === up.competition);
}

// ── 3) 賽季狀態層級的升級：所有 fixture id 不變 ────────────────────────
{
  const team = { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GSEAL" };
  const s = createSeasonState({ playerTeam: team, season: 1, seasonSeed: 12345 });
  ck("6) 新建賽季也帶身分容器（新舊同一條路徑）",
    s.ok && isLegacyIdentity(s.state.competition) &&
    Object.keys(s.state.circuits).length === 1 && Object.keys(s.state.events).length === 1,
    s.state.competition.circuitId);

  //  模擬「Q7a 之前的舊存檔」：把身分欄位與容器拿掉
  const { circuitId, eventId, idScheme, ...legacyComp } = s.state.competition;
  const legacy = { ...s.state, competition: legacyComp };
  delete legacy.circuits; delete legacy.events;
  const idsBefore = {
    comp: legacy.competition.id,
    stage: legacy.stage.id,
    fixtures: legacy.fixtures.map((f) => f.id),
  };

  const upped = upgradeSeasonIdentity(legacy);
  ck("6b) **升級後 competition / stage id 逐字元不變**",
    upped.competition.id === idsBefore.comp && upped.stage.id === idsBefore.stage);
  ck("6c) **每一個 fixture id 逐字元不變**",
    JSON.stringify(upped.fixtures.map((f) => f.id)) === JSON.stringify(idsBefore.fixtures),
    `${idsBefore.fixtures.length} 場`);
  ck("6d) fixtures 陣列本身沒有被換掉（沒有多餘的重建）", upped.fixtures === legacy.fixtures);
  ck("6e) 升級後補上容器", Object.keys(upped.circuits).length === 1 && Object.keys(upped.events).length === 1);
  ck("6f) 賽季層級升級也冪等（同一個參考）", upgradeSeasonIdentity(upped) === upped);
  ck("6g) 沒有賽季時原樣回傳", upgradeSeasonIdentity(null) === null);
}

// ── 4) 走完整 store：存檔 → 重載，id 全部不變 ──────────────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const c0 = store().competition;
  const snapshot = {
    comp: c0.competition.id,
    stage: c0.stage.id,
    fixtures: c0.fixtures.map((f) => f.id),
    scheme: c0.competition.idScheme,
  };
  ck("7) 新局建的賽季帶 legacy 身分", snapshot.scheme === ID_SCHEMES.legacy, snapshot.comp);

  //  ⚠ 模擬真正的舊存檔：把落盤的 JSON 裡的身分欄位拔掉再重載
  const raw = JSON.parse(LS);
  delete raw.competition.competition.circuitId;
  delete raw.competition.competition.eventId;
  delete raw.competition.competition.idScheme;
  delete raw.competition.circuits;
  delete raw.competition.events;
  LS = JSON.stringify(raw);

  //  ⚠ profileStore 的 load 是模組建立時跑的，不是 action ⇒ 用 cache-busting
  //    重新 import 一份，才是真正的「重載存檔」（沿用 q5 的做法）。
  const fresh = (await import("../src/platform/profileStore.js?q7a3a=1")).useProfileStore;
  const c1 = fresh.getState().competition;
  ck("7b) **重載舊存檔後 competition / stage id 不變**",
    c1.competition.id === snapshot.comp && c1.stage.id === snapshot.stage);
  ck("7c) **重載舊存檔後每一個 fixture id 不變**",
    JSON.stringify(c1.fixtures.map((f) => f.id)) === JSON.stringify(snapshot.fixtures),
    `${snapshot.fixtures.length} 場`);
  ck("7d) 重載時自動補上身分（不必玩家做任何事）",
    isLegacyIdentity(c1.competition) && !!c1.circuits && !!c1.events);
  ck("7e) 賽事仍可正常運作（推進日曆不受影響）", (() => {
    const before = fresh.getState().meta.days;
    const r = fresh.getState().advanceDay(3);
    return fresh.getState().meta.days > before || r.stoppedBy?.code === "player_fixture";
  })());
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
