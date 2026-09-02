// C5C Match Presentation adapter
// Authoritative frame/event -> read-only HUD/audio/camera intents.
// This module never changes gameplay state and never infers a kill from HP.

const WEAPON_LABELS = Object.freeze({
  pistol: "手槍",
  smg: "衝鋒槍",
  rifle: "步槍",
  sniper: "狙擊槍",
  shotgun: "霰彈槍",
  awp: "狙擊槍",
  scout: "狙擊槍",
  ak: "步槍",
  m4: "步槍",
  m4a4: "步槍",
  famas: "步槍",
  galil: "步槍",
  aug: "步槍",
  sg: "步槍",
  ump: "衝鋒槍",
  mp9: "衝鋒槍",
  mac10: "衝鋒槍",
  p90: "衝鋒槍",
  glock: "手槍",
  usp: "手槍",
  p250: "手槍",
  tec9: "手槍",
  deagle: "手槍",
  he: "高爆手榴彈",
  molly: "燃燒彈",
});

const EVENT_SCORE = Object.freeze({
  "bomb-exploded": 100,
  "bomb-defused": 100,
  "round-end": 98,
  clutch: 96,
  "bomb-planted": 92,
  multikill: 84,
  kill: 62,
  "defuse-start": 78,
});

const ROUND_REASON = Object.freeze({
  elim: "全隊淘汰",
  bomb: "炸彈爆炸",
  defuse: "炸彈拆除",
  time: "時間到",
});

const clone = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
};

const eventId = (event, frame, suffix = "event") => String(
  event?.id
  ?? event?.eventId
  ?? `${suffix}-${frame?.rnd ?? 0}-${frame?.fi ?? 0}-${event?.type ?? "unknown"}-${event?.playerId ?? event?.killerId ?? ""}`,
);

const distance2 = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));

export const C5C_PRESENTATION_EVENT_CONTRACT = Object.freeze({
  version: 1,
  authority: "authoritative FPS frame.events / roundStart / roundEnd",
  direction: "simulation -> presentation",
  killAuthority: "frame.events[type=kill]",
  bombAuthority: "frame.events[type=bomb-*] + frame.planted/c4t/c4pos",
  resumePolicy: "do not replay events before the first resumed frame",
  maxFeedItems: 5,
  feedLifetimeSec: 3.6,
  directorCooldownSec: 0.8,
});

function emptyState() {
  return {
    feed: [],
    multiKill: null,
    banner: null,
    history: [],
    score: { t: 0, ct: 0 },
    objective: { planted: false, timer: null, position: null, state: "carried", defuse: null },
    director: null,
    audio: [],
    diagnostics: {
      version: C5C_PRESENTATION_EVENT_CONTRACT.version,
      processedEvents: 0,
      duplicateEvents: 0,
      skippedHistoricalEvents: 0,
      feedEvents: 0,
      objectiveEvents: 0,
      roundStartEvents: 0,
      roundEndEvents: 0,
      clutchEvents: 0,
      audioRequests: 0,
      directorSwitches: 0,
      rapidDirectorSwitches: 0,
      rewindResets: 0,
      sameFramePublishes: 0,
      lastFrameIndex: null,
      presentationBacklog: 0,
      lastEventId: null,
      updateCalls: 0,
      framesWithEvents: 0,
    },
    seen: new Set(),
    lastFrameIndex: null,
    lastFrameTime: null,
    resumeFrameIndex: 0,
    lastDirectorAt: -Infinity,
    lastFootstepFrame: new Map(),
    lastThrowableIds: new Set(),
  };
}

function weaponLabel(event) {
  const family = String(event?.weaponFamily ?? event?.gun ?? "").toLowerCase();
  return event?.gunLabel ?? WEAPON_LABELS[family] ?? (family || "武器");
}

function roundBanner(result) {
  if (!result) return null;
  const winner = result.winnerSide === "ct" ? "CT" : "T";
  return {
    kind: "round-end",
    title: `${winner} 回合勝利`,
    detail: `${ROUND_REASON[result.how] ?? "回合結束"}　${result.tS ?? 0} : ${result.cS ?? 0}`,
    at: Number(result.round ?? 0),
    until: Number(result.ts ?? 0) + 2.2,
    result: clone(result),
  };
}

export function createFpsMatchPresentation() {
  let state = emptyState();

  const reset = ({ resumeFrameIndex = 0 } = {}) => {
    state = emptyState();
    state.resumeFrameIndex = Math.max(0, Number(resumeFrameIndex) || 0);
    return getView();
  };

  const addAudio = (type, event, frame) => {
    const id = `${type}-${eventId(event, frame, type)}`;
    state.audio.push({ type, id, eventId: id, distance: Number(event?.distance ?? 20), position: clone(event?.pos ?? event?.position ?? null) });
    state.diagnostics.audioRequests += 1;
  };

  const maybeDirect = (event, frame) => {
    const type = event?.type;
    const score = EVENT_SCORE[type] ?? 0;
    if (!score) return;
    const at = Number(frame?.ts ?? frame?.roundSec ?? 0);
    const last = state.director;
    if (last && at - state.lastDirectorAt < C5C_PRESENTATION_EVENT_CONTRACT.directorCooldownSec) {
      // Several authoritative events can share one frame timestamp (for
      // example a final kill, clutch and round-end). Allow only a same-frame
      // priority upgrade; a later event inside the cooldown cannot cause an
      // A -> B -> A visible camera jump.
      if (at !== last.at || score <= last.score) return;
    }
    const position = event?.pos ?? event?.position ?? (event?.playerId ? frame?.players?.find((player) => player.id === event.playerId)?.pos : null) ?? null;
    state.director = {
      kind: type,
      at,
      score,
      targetId: event?.playerId ?? event?.killerId ?? null,
      position: clone(position),
      expiresAt: at + (score >= 90 ? 3.2 : 2.2),
      reason: type === "clutch" ? "關鍵殘局" : type === "round-end" ? "回合結果" : type === "bomb-planted" ? "炸彈事件" : "關鍵擊殺",
    };
    state.lastDirectorAt = at;
    state.diagnostics.directorSwitches += 1;
  };

  const consumeEvent = (event, frame) => {
    const id = eventId(event, frame);
    if (state.seen.has(id)) {
      state.diagnostics.duplicateEvents += 1;
      return;
    }
    state.seen.add(id);
    state.diagnostics.processedEvents += 1;
    state.diagnostics.lastEventId = id;
    const at = Number(frame?.ts ?? frame?.roundSec ?? 0);
    const type = event?.type;
    maybeDirect(event, frame);
    if (type === "kill") {
      const entry = {
        ...clone(event),
        id,
        weaponLabel: weaponLabel(event),
        at,
        expiresAt: at + C5C_PRESENTATION_EVENT_CONTRACT.feedLifetimeSec,
        critical: Boolean(event.firstKill || event.finalKill),
      };
      state.feed = [...state.feed, entry].slice(-C5C_PRESENTATION_EVENT_CONTRACT.maxFeedItems);
      state.diagnostics.feedEvents += 1;
      addAudio("kill", event, frame);
    } else if (type === "multikill") {
      state.multiKill = { ...clone(event), id, at, expiresAt: at + 2.2 };
      state.banner = { kind: "moment", title: event.label ?? "多殺", detail: event.player ?? "", at, until: at + 2.2 };
      addAudio("multikill", event, frame);
    } else if (type === "clutch") {
      state.diagnostics.clutchEvents += 1;
      state.banner = { kind: "moment", title: event.label ?? "關鍵殘局", detail: event.player ?? "", at, until: at + 2.8 };
      addAudio("clutch", event, frame);
    } else if (type === "bomb-planted") {
      state.banner = { kind: "objective", title: "炸彈已安放", detail: event.site ? `炸彈點 ${String(event.site).toUpperCase()}` : "進入倒數", at, until: at + 2.4 };
      state.diagnostics.objectiveEvents += 1;
      addAudio("bomb-planted", event, frame);
      maybeDirect(event, frame);
    } else if (type === "defuse-start") {
      state.banner = { kind: "objective", title: "正在拆除炸彈", detail: event.playerName ?? "CT 正在處理", at, until: at + 1.8 };
      state.diagnostics.objectiveEvents += 1;
      addAudio("defuse-start", event, frame);
    } else if (type === "bomb-defused") {
      state.banner = { kind: "objective", title: "炸彈拆除成功", detail: "CT 守住了這一回合", at, until: at + 2.5 };
      state.diagnostics.objectiveEvents += 1;
      addAudio("bomb-defused", event, frame);
    } else if (type === "bomb-exploded") {
      state.banner = { kind: "objective", title: "炸彈爆炸", detail: "T 完成了目標", at, until: at + 2.5 };
      state.diagnostics.objectiveEvents += 1;
      addAudio("bomb-exploded", event, frame);
    } else if (type === "round-end") {
      state.diagnostics.roundEndEvents += 1;
      state.banner = roundBanner(event.result ?? event);
      addAudio("round-end", event, frame);
    }
  };

  const consumeRoundStart = (frame, time) => {
    if (!frame?.roundStart) return;
    const startEvent = { ...frame.roundStart, type: "round-start", id: frame.roundStart.id ?? `round-start-${frame.roundStart.round}` };
    const startId = eventId(startEvent, frame, "round-start");
    if (state.seen.has(startId)) return;
    state.seen.add(startId);
    state.diagnostics.roundStartEvents += 1;
    state.banner = { kind: "round-start", title: `第 ${frame.roundStart.round} 回合`, detail: "回合開始", at: time, until: time + 1.7 };
    addAudio("round-start", startEvent, frame);
  };

  const update = ({ frame, previousFrame = null, frameIndex = 0 }) => {
    if (!frame) return getView();
    state.diagnostics.updateCalls += 1;
    if ((frame.events?.length ?? 0) > 0) state.diagnostics.framesWithEvents += 1;
    const time = Number(frame.ts ?? frame.roundSec ?? 0);
    const firstFrame = state.lastFrameIndex == null;
    const sameFrame = !firstFrame && frameIndex === state.lastFrameIndex && time === state.lastFrameTime;
    const rewound = !firstFrame && frameIndex < state.lastFrameIndex;
    if (sameFrame) {
      // React may publish the same authoritative frame more than once while
      // persistence/audio state settles. Keep the presentation cursor and do
      // not replay or clear the current feed.
      state.diagnostics.duplicateEvents += (frame.events?.length ?? 0) > 0 ? 1 : 0;
      state.diagnostics.sameFramePublishes += 1;
    } else if (rewound) {
      // A manual seek can move the cursor backwards. Keep the dedup set and
      // current diagnostics so a seek cannot erase proof of already consumed
      // events; the explicit reset on a new simulation handles reload/map
      // resume and starts with an empty presentation cursor.
      state.lastFrameIndex = frameIndex;
      state.lastFrameTime = time;
      state.diagnostics.skippedHistoricalEvents += (frame.events?.length ?? 0);
      state.diagnostics.rewindResets += 1;
    } else if (firstFrame) {
      state.lastFrameIndex = frameIndex;
      state.lastFrameTime = time;
      state.history = clone((frame.roundHist ?? []).slice(0, frame.roundHistCount ?? frame.roundHist?.length ?? 0));
      if (frameIndex === 0 && state.resumeFrameIndex === 0) consumeRoundStart(frame, time);
    } else {
      (frame.events ?? []).forEach((event) => consumeEvent(event, frame));
      consumeRoundStart(frame, time);
      const newRoundCount = frame.roundHistCount ?? frame.roundHist?.length ?? 0;
      if (newRoundCount > state.history.length) {
        state.history = clone((frame.roundHist ?? []).slice(0, newRoundCount));
      }
      state.lastFrameIndex = frameIndex;
      state.lastFrameTime = time;
    }
    state.diagnostics.lastFrameIndex = frameIndex;

    state.objective = {
      planted: Boolean(frame.planted),
      timer: frame.planted && frame.c4t != null ? Number(frame.c4t) : null,
      position: clone(frame.c4pos ?? null),
      state: frame.bombState ?? (frame.planted ? "planted" : "carried"),
      defuse: frame.players?.find((player) => player.objectiveState === "DEFUSE")?.name ?? null,
    };
    state.score = { t: Number(frame.tScore ?? 0), ct: Number(frame.ctScore ?? 0) };
    const previousIds = new Set((previousFrame?.throwables ?? []).map((throwable) => throwable.id));
    (frame.throwables ?? []).forEach((throwable) => {
      if (!previousIds.has(throwable.id)) addAudio("utility-throw", throwable, frame);
      if (throwable.flying === false && previousFrame?.throwables?.some((item) => item.id === throwable.id && item.flying)) addAudio("utility-bounce", throwable, frame);
      if ((throwable.boom ?? 0) >= 3 && (previousFrame?.throwables?.find((item) => item.id === throwable.id)?.boom ?? 0) < 3) addAudio(`${throwable.type ?? "he"}-deploy`, throwable, frame);
    });
    const moving = (player) => player && !player.dead && (player.state === "ROTATE" || player.state === "EXECUTE") && distance2(player.pos, player.prevPos) >= 0.55;
    if (!firstFrame && frameIndex % 2 === 0) {
      (frame.players ?? []).forEach((player) => {
        if (!moving(player)) return;
        const last = state.lastFootstepFrame.get(player.id) ?? -Infinity;
        if (frameIndex - last < 2) return;
        state.lastFootstepFrame.set(player.id, frameIndex);
        addAudio("footstep", { id: player.id, distance: 20, playerId: player.id }, frame);
      });
    }
    if (frame.planted && previousFrame?.planted && Number(frame.c4t) !== Number(previousFrame.c4t) && Number(frame.c4t) > 0) {
      addAudio("bomb-tick", { id: `tick-${frame.rnd}-${frame.c4t}`, distance: 20 }, frame);
    }
    state.audio = state.audio.slice(-24);
    state.feed = state.feed.filter((entry) => entry.expiresAt > time);
    if (state.multiKill && state.multiKill.expiresAt <= time) state.multiKill = null;
    if (state.banner && state.banner.until <= time) state.banner = null;
    state.diagnostics.presentationBacklog = state.audio.length;
    return getView();
  };

  function getView() {
    return {
      feed: state.feed.map(clone),
      multiKill: clone(state.multiKill),
      banner: clone(state.banner),
      history: state.history.map(clone),
      score: { ...state.score },
      objective: clone(state.objective),
      audio: state.audio.map(clone),
      diagnostics: { ...state.diagnostics },
    };
  }

  const drainAudio = () => {
    const audio = state.audio.splice(0).map(clone);
    return audio;
  };

  const getDirectorIntent = () => {
    if (!state.director || Number(state.director.expiresAt) <= Number(state.lastFrameTime ?? 0)) return null;
    return clone(state.director);
  };

  const diagnostics = () => ({ ...state.diagnostics, feedCount: state.feed.length, historyCount: state.history.length, director: clone(state.director) });
  return { update, reset, getView, drainAudio, getDirectorIntent, diagnostics, contract: C5C_PRESENTATION_EVENT_CONTRACT };
}

export { ROUND_REASON, WEAPON_LABELS };
