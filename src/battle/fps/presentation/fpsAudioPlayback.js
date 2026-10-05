const finitePosition = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 聲音來源只讀取權威事件／選手位置；缺來源時保留未知，不以hash假造方向。
export function resolveFpsAudioEmitter(event, frame) {
  for (const position of [event?.pos, event?.position, event]) {
    if (finitePosition(position)) return { x: position.x, y: position.y };
  }
  const id = event?.playerId ?? event?.attackerId ?? event?.killerId;
  const player = id == null ? null : frame?.players?.find(value => value.id === id);
  return finitePosition(player?.pos) ? { x: player.pos.x, y: player.pos.y } : null;
}

// 觀戰使用鏡頭焦點作虛擬聽者，第一人稱使用眼睛位置；right來自同一鏡頭。
// FPS地圖為平面座標，不聲稱提供HRTF或真實室內聲學。
export function resolveFpsAudioSpatial(position, listener, fallbackDistance = 20) {
  const fallback = Number.isFinite(fallbackDistance) ? Math.max(0, fallbackDistance) : 20;
  if (!finitePosition(position) || !finitePosition(listener)) return { distance: fallback, pan: 0 };
  const dx = position.x - listener.x, dy = position.y - listener.y, distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return { distance: fallback, pan: 0 };
  const rightLength = Math.hypot(listener.rightX, listener.rightY);
  const lateral = Number.isFinite(rightLength) && rightLength > .0001
    ? (dx * listener.rightX + dy * listener.rightY) / rightLength / Math.max(1, distance)
    : 0;
  return { distance, pan: clamp(lateral * .85, -.85, .85) };
}

// 只播放向前的新frame。resume／同frame／倒帶／手動seek不排歷史槍聲。
// 純呈現游標；不改frames、模擬時鐘或回放契約。
export function createFpsAudioPlaybackGate() {
  let last = null;
  return {
    reset() { last = null; },
    seek({ simulation, frameIndex, seekNonce }) { last = { simulation, frameIndex, seekNonce }; },
    update({ simulation, frameIndex, seekNonce, playing, soundOn }) {
      const previous = last;
      last = { simulation, frameIndex, seekNonce };
      return Boolean(previous && simulation != null && simulation === previous.simulation && seekNonce === previous.seekNonce
        && Number.isFinite(frameIndex) && Number.isFinite(previous.frameIndex)
        && frameIndex >= 0 && frameIndex > previous.frameIndex && playing && soundOn);
    },
  };
}
