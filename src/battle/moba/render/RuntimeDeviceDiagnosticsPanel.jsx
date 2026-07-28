import React, { useEffect, useMemo, useState } from "react";
import { diagnosticsEnabled } from "./runtimeDiagnostics.js";

function buildDeviceReport() {
  if (typeof window === "undefined") return null;
  const diag = window.__ESMO_RUNTIME_DIAG?.();
  if (!diag) return null;
  const perf = diag.performance ?? {};
  return {
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? null,
      visualHeight: window.visualViewport?.height ?? null,
      visualScale: window.visualViewport?.scale ?? null,
    },
    depthBits: perf.depthBits ?? null,
    renderer: perf.renderer ?? null,
    vendor: perf.vendor ?? null,
    webglVersion: perf.webglVersion ?? null,
    contextAttributes: perf.contextAttributes ?? null,
    camera: diag.camera ?? null,
    pixelRatio: {
      device: window.devicePixelRatio,
      renderer: perf.pixelRatio ?? null,
    },
    drawingBuffer: perf.drawingBuffer ?? null,
    cssCanvas: perf.cssCanvas ?? null,
    contextLost: window.__ESMO_FLICKER?.().contextLost ?? 0,
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

/**
 * Android 真機診斷面板。只在 ?diag=1 / ?shot= 時存在，不進正式玩家路徑。
 * 讓沒有遠端 DevTools 的手機也能直接讀、複製或下載 WebGL context 證據。
 */
export default function RuntimeDeviceDiagnosticsPanel() {
  const enabled = useMemo(() => diagnosticsEnabled(), []);
  const [report, setReport] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [copyState, setCopyState] = useState("複製 JSON");

  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = () => {
      const next = buildDeviceReport();
      if (!next) return;
      window.__ESMO_RUNTIME_DEVICE_REPORT = next;
      setReport(next);
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      window.clearInterval(timer);
      delete window.__ESMO_RUNTIME_DEVICE_REPORT;
    };
  }, [enabled]);

  if (!enabled) return null;
  const json = report ? JSON.stringify(report, null, 2) : "";
  const p = report ?? {};
  const summary = report
    ? [
      `DEPTH_BITS  ${p.depthBits}`,
      `WebGL       ${p.webglVersion}`,
      `renderer    ${p.renderer ?? "unavailable"}`,
      `vendor      ${p.vendor ?? "unavailable"}`,
      `camera      near ${p.camera?.near} / far ${p.camera?.far}`,
      `pixel ratio device ${p.pixelRatio?.device} / renderer ${p.pixelRatio?.renderer}`,
      `buffer      ${p.drawingBuffer?.width}×${p.drawingBuffer?.height}`,
      `context     ${JSON.stringify(p.contextAttributes)}`,
    ].join("\n")
    : "等待 WebGL context…";

  const download = () => {
    if (!json) return;
    const href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `esmo-runtime-device-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  return (
    <section style={{
      position: "absolute", left: 8, bottom: 8, zIndex: 100,
      width: "min(420px, calc(100% - 16px))", maxHeight: collapsed ? 38 : "48%",
      overflow: "auto", boxSizing: "border-box", padding: 8,
      color: "#dff7ff", background: "rgba(2,10,18,.94)",
      border: "1px solid rgba(103,232,249,.65)", borderRadius: 8,
      font: "10px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace",
      boxShadow: "0 4px 20px rgba(0,0,0,.5)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: collapsed ? 0 : 6 }}>
        <strong style={{ color: "#67e8f9", marginRight: "auto" }}>Android WebGL 診斷</strong>
        <button type="button" onClick={() => setCollapsed((value) => !value)}
          style={{ font: "inherit", color: "#fff", background: "#243447", border: 0, borderRadius: 4, padding: "3px 6px" }}>
          {collapsed ? "展開" : "收合"}
        </button>
      </div>
      {!collapsed && (
        <>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "0 0 6px" }}>{summary}</pre>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={async () => {
              const copied = await copyText(json);
              setCopyState(copied ? "已複製" : "複製失敗");
              window.setTimeout(() => setCopyState("複製 JSON"), 1600);
            }} disabled={!report}
              style={{ font: "inherit", color: "#fff", background: "#0369a1", border: 0, borderRadius: 4, padding: "4px 8px" }}>
              {copyState}
            </button>
            <button type="button" onClick={download} disabled={!report}
              style={{ font: "inherit", color: "#fff", background: "#166534", border: 0, borderRadius: 4, padding: "4px 8px" }}>
              下載 JSON
            </button>
          </div>
        </>
      )}
    </section>
  );
}
