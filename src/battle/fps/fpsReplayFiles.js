import { readCsReplay, serializeCsReplay } from "./fpsReplay.js";

export async function downloadCsReplay(replay) {
  let blob = new Blob([serializeCsReplay(replay)], { type: "application/json" });
  let suffix = ".json";
  if (typeof CompressionStream === "function") {
    blob = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    suffix += ".gz";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cs-replay-${replay.metadata.mapKey}-${replay.metadata.seed}${suffix}`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function loadCsReplayFile(file) {
  if (!file || file.size > 64 * 1024 * 1024) throw new Error("重播檔過大，請選擇小於 64 MB 的 JSON 或壓縮重播檔。");
  let stream = file.stream();
  if (file.name.endsWith(".gz")) {
    if (typeof DecompressionStream !== "function") throw new Error("此瀏覽器無法讀取壓縮重播，請改用 JSON 檔。");
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  }
  const reader = stream.getReader(), decoder = new TextDecoder(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 256 * 1024 * 1024) { await reader.cancel(); throw new Error("解壓後的重播檔過大，無法開啟。"); }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error.message.includes("過大")) throw error;
    throw new Error("無法讀取重播檔，請確認檔案完整。");
  } finally { reader.releaseLock(); }
  return readCsReplay(chunks.join(""));
}
