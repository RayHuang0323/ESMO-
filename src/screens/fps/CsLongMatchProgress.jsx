// ============================================================================
//  CsLongMatchProgress.jsx — C6C 長對局進度回饋（外層呈現層）
//
//  這個元件只讀 MatchSession.activeMatch 與同一筆 simulation snapshot。
//  不持有比分、回合、地圖或比賽計時器，也不介入 EsportsFPS3D 的播放／模擬。
//  C5C 的 HUD 留在引擎內；C6C 只在 CsMatchScreen 外層提供「現在進行到哪」摘要，
//  讓兩條工作線未來可以分開整合。
// ============================================================================
import React, { useEffect, useMemo, useState } from "react";
import { csMapByKey } from "../../battle/fps/csPrepData.js";
import { GC, FONT, MONO } from "../../ui/theme.js";

// 這是 UI-only liveness watchdog，不是比賽 timer；只在 authoritative
// activeMatch.updatedAt 長時間沒有更新時顯示提示，不會改變 simulation。
export const CS_PROGRESS_STALE_AFTER_MS = 5000;

const asFinite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const asScore = (value) => {
  const number = asFinite(value);
  return number == null ? null : Math.max(0, Math.floor(number));
};

const mapNameOf = (mapKey) => csMapByKey(mapKey)?.name ?? mapKey ?? "尚未決定";

const formatSeconds = (value) => {
  const seconds = asFinite(value);
  if (seconds == null) return "—";
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};

const formatTime = (value) => {
  const timestamp = asFinite(value);
  if (timestamp == null || timestamp <= 0) return "—";
  return new Date(timestamp).toLocaleTimeString("zh-TW", { hour12: false });
};

const winnerLabel = (winner) => (winner === "us" ? "我方勝" : winner === "opponent" ? "對手勝" : "未定");

/**
 * 從正式 MatchSession / ActiveMatch 建立可讀摘要。
 * 這個純函式刻意不接受 UI 自己的 round/score/timer；方便 verifier 直接檢查資料來源。
 */
export function buildCsLongMatchProgress({ session = null, snapshot = null, config = null, now = Date.now() } = {}) {
  const activeMatch = session?.activeMatch ?? null;
  const series = session?.series?.schema ? session.series : null;
  const isSeries = !!series;
  const maxMaps = isSeries ? Math.max(1, Math.floor(asFinite(series.maxMaps) ?? 1)) : 1;
  const playedMaps = Array.isArray(series?.maps) ? series.maps.length : 0;
  const rawNextMapIndex = asFinite(series?.nextMapIndex);
  const nextMapIndex = rawNextMapIndex == null
    ? playedMaps
    : Math.max(0, Math.floor(rawNextMapIndex));
  const currentMapIndex = Math.min(Math.max(0, nextMapIndex), maxMaps - 1);
  const mapKey = config?.mapKey ?? series?.mapPool?.[currentMapIndex] ?? null;
  const mapName = config?.mapName ?? mapNameOf(mapKey);

  const frameIndex = asFinite(snapshot?.frameIndex);
  const totalFrames = asFinite(snapshot?.totalFrames);
  const safeTotalFrames = totalFrames == null ? 0 : Math.max(0, Math.floor(totalFrames));
  const safeFrameIndex = frameIndex == null ? null : Math.max(0, Math.floor(frameIndex));
  const frameNumber = safeFrameIndex == null ? null : Math.min(safeFrameIndex + 1, Math.max(1, safeTotalFrames));
  const frameMax = Math.max(0, safeTotalFrames - 1);
  const frameValue = safeFrameIndex == null ? null : Math.min(safeFrameIndex, frameMax);
  const frameRatio = frameValue == null || safeTotalFrames <= 0
    ? null
    : safeTotalFrames === 1 ? 1 : frameValue / frameMax;

  const roundIndex = asFinite(snapshot?.rnd);
  const roundNumber = roundIndex == null ? null : Math.max(1, Math.floor(roundIndex) + 1);
  const simulationTimeSec = asFinite(snapshot?.simulationTimeSec)
    ?? asFinite(activeMatch?.simulation?.timeSec);
  const tScore = asScore(snapshot?.tScore);
  const ctScore = asScore(snapshot?.ctScore);
  const timestamps = [activeMatch?.simulation?.updatedAt, activeMatch?.updatedAt]
    .map(asFinite)
    .filter((value) => value != null && value > 0);
  const lastSyncAt = timestamps.length ? Math.max(...timestamps) : null;
  const status = activeMatch?.status ?? activeMatch?.simulation?.status ?? "unknown";
  const phase = activeMatch?.phase ?? "battle";
  const stale = status === "active"
    && !!snapshot
    && lastSyncAt != null
    && now - lastSyncAt >= CS_PROGRESS_STALE_AFTER_MS;

  return {
    activeMatch,
    series,
    isSeries,
    format: series?.format ?? "bo1",
    maxMaps,
    playedMaps,
    currentMapIndex,
    currentMapNumber: currentMapIndex + 1,
    mapKey,
    mapName,
    frameIndex: safeFrameIndex,
    totalFrames: safeTotalFrames,
    frameNumber,
    frameRatio,
    roundNumber,
    simulationTimeSec,
    tScore,
    ctScore,
    lastSyncAt,
    status,
    phase,
    stale,
  };
}

const phaseLabel = (phase) => ({
  map: "地圖準備",
  tactic: "戰術部署",
  loading: "進入 Battle",
  battle: "比賽進行中",
})[phase] ?? "準備中";

function StatusPill({ progress }) {
  const tone = progress.status === "paused"
    ? GC.gold
    : progress.stale
      ? GC.gold
      : progress.activeMatch
        ? GC.green
        : GC.gray;
  const label = !progress.activeMatch
    ? "未接入場次"
    : progress.status === "paused"
      ? "已暫停，可恢復"
      : progress.stale
        ? "等待下一次同步"
        : progress.activeMatch && progress.frameNumber != null
          ? "同步正常"
          : "正在同步";
  return (
    <span data-testid="cs-match-session-state" style={{ flexShrink: 0, color: tone, border: `1px solid ${tone}66`, background: `${tone}18`, borderRadius: 999, padding: "4px 8px", fontSize: 9, fontWeight: 900 }}>
      {label}
    </span>
  );
}

function SeriesMapStrip({ progress }) {
  if (!progress.isSeries) return null;
  const maps = Array.isArray(progress.series?.maps) ? progress.series.maps : [];
  const mapPool = Array.isArray(progress.series?.mapPool) ? progress.series.mapPool : [];
  return (
    <div data-testid="cs-match-series-progress" style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${GC.line}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ color: GC.gold, fontSize: 10, fontWeight: 900 }}>{String(progress.format).toUpperCase()} 系列賽</span>
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 900, fontFamily: MONO }}>
          {Number(progress.series?.wins?.us) || 0} : {Number(progress.series?.wins?.opponent) || 0}
        </span>
        <span style={{ color: GC.gray, fontSize: 9 }}>已完成 {progress.playedMaps} / {progress.maxMaps} 張地圖</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${progress.maxMaps}, minmax(0, 1fr))`, gap: 5, marginTop: 7 }}>
        {Array.from({ length: progress.maxMaps }, (_, index) => {
          const completed = maps[index] ?? null;
          const isCurrent = !completed && index === progress.currentMapIndex && !progress.series?.winner;
          const key = completed?.mapKey ?? mapPool[index] ?? (isCurrent ? progress.mapKey : null);
          const color = completed?.winner === "us"
            ? GC.green
            : completed?.winner === "opponent"
              ? GC.red
              : isCurrent ? GC.gold : GC.gray;
          return (
            <div key={`${index}-${key ?? "pending"}`} style={{ minWidth: 0, border: `1px solid ${color}55`, background: `${color}12`, borderRadius: 7, padding: "5px 6px" }}>
              <div style={{ color: GC.gray, fontSize: 8, fontWeight: 900 }}>MAP {index + 1}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e8ebf0", fontSize: 9, fontWeight: 800 }}>{mapNameOf(key)}</div>
              <div style={{ color, fontSize: 8, fontWeight: 900 }}>{completed ? winnerLabel(completed.winner) : isCurrent ? "目前進行中" : "待進行"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CsLongMatchProgress({ session = null, snapshot = null, config = null }) {
  const [watchdogTick, setWatchdogTick] = useState(0);
  const initialProgress = useMemo(
    () => buildCsLongMatchProgress({ session, snapshot, config, now: Date.now() }),
    [session, snapshot, config],
  );
  const lastSyncAt = initialProgress.lastSyncAt;

  // 僅在最後一筆 authoritative snapshot 應該已經過期時喚醒一次 UI；
  // 不推進 match、不估算 ETA，也不建立第二套 round/score/timer。
  useEffect(() => {
    if (!lastSyncAt || initialProgress.status !== "active" || typeof window === "undefined") return undefined;
    const delay = Math.max(0, lastSyncAt + CS_PROGRESS_STALE_AFTER_MS - Date.now()) + 1;
    const timer = window.setTimeout(() => setWatchdogTick(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [initialProgress.status, lastSyncAt]);

  const progress = useMemo(
    () => buildCsLongMatchProgress({ session, snapshot, config, now: Date.now() }),
    [session, snapshot, config, watchdogTick],
  );
  const phase = phaseLabel(progress.phase);
  const statusText = !progress.activeMatch
    ? "此畫面尚未接入可恢復場次"
    : progress.status === "paused"
      ? "比賽已暫停；返回後會從最後同步的 frame 繼續。"
      : progress.stale
        ? "畫面暫時沒有新快照，正在等待下一次同步；這裡不提供不可靠的剩餘時間預估。"
        : progress.frameNumber == null
          ? "正在建立第一個比賽快照；模擬仍由正式引擎執行。"
          : "比賽仍在進行；frame、回合與比分都來自同一份場次快照。";

  return (
    <section data-testid="cs-long-match-progress" aria-label="CS 比賽進度" style={{ maxWidth: 760, margin: "0 auto", padding: "0 10px 10px", boxSizing: "border-box", fontFamily: FONT }}>
      <div style={{ background: GC.card, border: `1px solid ${GC.line}`, borderRadius: 12, padding: "10px 12px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: GC.gray, fontSize: 8, letterSpacing: "0.16em", fontWeight: 900 }}>MATCH PROGRESS</div>
            <div data-testid="cs-match-phase" style={{ color: "#f3f4f6", fontSize: 13, fontWeight: 900, marginTop: 3 }}>{phase}</div>
          </div>
          <StatusPill progress={progress} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(130px, 0.8fr)", gap: 8, marginTop: 9 }}>
          <div data-testid="cs-match-map-progress" style={{ minWidth: 0, background: "rgba(251,191,36,0.08)", border: `1px solid ${GC.gold}44`, borderRadius: 9, padding: "7px 9px" }}>
            <div style={{ color: GC.gray, fontSize: 8, fontWeight: 900 }}>目前地圖</div>
            <div style={{ color: GC.gold, fontSize: 15, fontWeight: 900, marginTop: 2 }}>Map {progress.currentMapNumber} / {progress.maxMaps}</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e8ebf0", fontSize: 10, fontWeight: 800 }}>{progress.mapName}</div>
          </div>
          <div data-testid="cs-match-live-score" style={{ minWidth: 0, background: "rgba(59,130,246,0.08)", border: `1px solid ${GC.blue}44`, borderRadius: 9, padding: "7px 9px" }}>
            <div style={{ color: GC.gray, fontSize: 8, fontWeight: 900 }}>即時比分</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, fontFamily: MONO, marginTop: 2 }}>{progress.tScore == null ? "—" : progress.tScore} : {progress.ctScore == null ? "—" : progress.ctScore}</div>
            <div style={{ color: GC.gray, fontSize: 9 }}>T 方 : CT 方</div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span data-testid="cs-match-round-progress" style={{ color: "#fff", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "4px 7px", fontSize: 9, fontWeight: 900 }}>回合 {progress.roundNumber ?? "—"}</span>
          <span data-testid="cs-match-simulation-state" style={{ color: progress.stale ? GC.gold : GC.green, fontSize: 9, fontWeight: 800 }}>{progress.stale ? "等待 simulation 快照" : phase}</span>
          <span data-testid="cs-match-simulation-clock" style={{ color: GC.gray, fontSize: 9, fontFamily: MONO }}>模擬時間 {formatSeconds(progress.simulationTimeSec)}</span>
          <span data-testid="cs-match-sync" style={{ color: GC.gray, fontSize: 9, fontFamily: MONO }}>最後同步 {formatTime(progress.lastSyncAt)} · Frame {progress.frameNumber ?? "—"}</span>
        </div>

        {progress.totalFrames > 0 && progress.frameRatio != null ? (
          <div data-testid="cs-match-frame-progress" style={{ marginTop: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: GC.gray, fontSize: 8, fontWeight: 800 }}>
              <span>播放位置（正式 simulation frame）</span>
              <span style={{ flexShrink: 0, fontFamily: MONO }}>{progress.frameNumber} / {progress.totalFrames} 格</span>
            </div>
            <div role="progressbar" aria-label="正式 simulation frame 播放位置" aria-valuemin={1} aria-valuemax={progress.totalFrames} aria-valuenow={progress.frameNumber} style={{ height: 5, marginTop: 5, overflow: "hidden", background: "rgba(255,255,255,0.08)", borderRadius: 99 }}>
              <div style={{ width: `${Math.round(progress.frameRatio * 100)}%`, height: "100%", background: `linear-gradient(90deg,${GC.blue},${GC.green})`, transition: "width 0.2s linear" }} />
            </div>
            <div style={{ color: GC.gray, fontSize: 8, marginTop: 4 }}>這是目前 frame 位置，不是剩餘時間預估。</div>
          </div>
        ) : (
          <div data-testid="cs-match-frame-progress" style={{ marginTop: 9, color: GC.gray, fontSize: 8 }}>等待第一個正式 simulation frame；不估算剩餘時間。</div>
        )}

        <SeriesMapStrip progress={progress} />

        <div data-testid="cs-long-match-hint" role="status" aria-live="polite" style={{ marginTop: 9, padding: "7px 8px", borderRadius: 8, background: progress.stale ? "rgba(251,191,36,0.10)" : "rgba(52,211,153,0.08)", border: `1px solid ${progress.stale ? `${GC.gold}44` : `${GC.green}33`}`, color: progress.stale ? "#fde68a" : "#bbf7d0", fontSize: 9, lineHeight: 1.45 }}>
          {statusText}
        </div>

        <div data-testid="cs-match-speed-status" style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "baseline", marginTop: 7, color: GC.gray, fontSize: 8, lineHeight: 1.45 }}>
          <span style={{ color: "#c8cdd6", fontWeight: 900 }}>播放倍率</span>
          <span>請看下方播放器的選取按鈕：1× / 2.4× / 4×；C6C 不另建速度狀態。</span>
        </div>
      </div>
    </section>
  );
}

