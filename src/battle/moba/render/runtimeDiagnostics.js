// ============================================================================
//  battle/moba/render/runtimeDiagnostics.js — Runtime 畫面的**驗收用**診斷探針（H.1）
//
//  【存在的理由】H.1 的驗收要求「不可猜測」：英雄到底是不是被壓成扁平色塊、
//   效能數字是不是真的 GPU 跑出來的，都必須從**真實 Chrome 畫面**讀回來，
//   而不是看程式碼推論。本檔把 three.js 的 scene / renderer 掛到 window 上，
//   讓 tools/shot_moba_runtime.mjs 透過 CDP 讀真實場景圖與 renderer.info。
//
//  【硬規則】
//   · **只讀**。本檔不改任何 transform、材質、模擬狀態，拔掉它畫面不會有一絲差異。
//   · 預設**不啟用**：只有網址帶 ?diag=1 或 ?shot=<id> 時才掛（截圖與除錯情境）。
//     正式玩家路徑不會有任何 window 汙染。
//   · 不 import LogicEngine、不讀寫 store。
// ============================================================================

/**
 * H.2-flicker：Runtime 元件的掛載／卸載計數。
 *
 * 【為什麼要記】「對戰途中元件被反覆卸載重掛」是閃爍的典型根因之一：每次重掛都有幾幀
 * 沒有東西可畫。這件事從畫面上看起來和「visible 跳動」「LOD 裁切」一模一樣，
 * 但修的地方完全不同 ⇒ 必須用計數分辨，不能用猜的。
 *
 * ⚠ 恆常啟用（不受 diagnosticsEnabled 限制）：計數只是三個整數的加減，成本可忽略，
 *   但如果只在診斷模式下記，就永遠抓不到「只在正式路徑才發生」的重掛。
 */
export function countMount(key) {
  if (typeof window === "undefined") return;
  const m = (window.__ESMO_RUNTIME_MOUNTS ??= {});
  m[key + ".mount"] = (m[key + ".mount"] ?? 0) + 1;
}
export function countUnmount(key) {
  if (typeof window === "undefined") return;
  const m = (window.__ESMO_RUNTIME_MOUNTS ??= {});
  m[key + ".unmount"] = (m[key + ".unmount"] ?? 0) + 1;
}

/** 只有截圖 / 明確除錯時才開；一般玩家路徑完全不掛。 */
export function diagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get("diag") === "1" || !!q.get("shot");
  } catch {
    return false;
  }
}

/** three.js 物件 → 可序列化的幾何型別名稱（扁平色塊的關鍵證據）。 */
const geomType = (obj) => obj?.geometry?.type ?? null;

/** ⚠ NaN 一定要留成 null 而不是靜靜變 0：H.1-close 就是靠這個抓到英雄座標爛掉。 */
const n3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null);
const vec3 = (v) => (v ? { x: n3(v.x), y: n3(v.y), z: n3(v.z) } : null);
const finiteVec = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * 把 runtime 場景與 renderer 掛上 window，供截圖工具讀取。
 *
 * @param gl        THREE.WebGLRenderer
 * @param scene     THREE.Scene
 * @param camera    THREE.Camera
 * @param frameRef  MobaRuntimeView3D 的每幀資料（Adapter 輸出）
 */
export function installRuntimeDiagnostics({ gl, scene, camera, frameRef }) {
  if (typeof window === "undefined") return;

  //  FPS：用 renderer 的實際 render 次數估算，取最近 ~1 秒的滑動窗。
  const fps = { frames: 0, last: 0, value: 0, frameMs: 0 };
  const seenEffectIds = new Set();

  // ══ H.2-flicker：逐幀閃爍記錄器 ═══════════════════════════════════════════
  //
  //  【為什麼一定要逐幀】閃爍是「單幀或數幀消失又出現」。用固定間隔（例如每 600ms）
  //  取樣去抓它，取樣頻率比事件本身還慢 ⇒ 幾乎一定漏掉，然後得到「沒有閃爍」的假結論。
  //  （H.2-close 就是這樣誤判的：驗收欄位每 0.6 秒才看一次，真實手機上其實仍在閃。）
  //  本記錄器掛在**每一幀**都會被呼叫的 __ESMO_RUNTIME_TICK 上，由頁面自己統計，
  //  工具只讀彙總 ⇒ 不會因為輪詢間隔漏掉任何一幀。
  //
  //  記錄的是「**畫面上實際畫不畫得到**」，不是資料層的 alive：逐幀走 scene graph，
  //  對每個動態物件算 renderable = 自己與所有祖先的 visible 皆為 true 且 transform 無 NaN。
  const FL_KIND = ["hero", "structure", "objective", "healthbar", "ring", "mapWall"];
  const flick = {
    on: false, frames: 0, startedAt: 0,
    prevVisible: new Map(),
    prevIdentity: new Map(),
    identityChanges: { mapWall: 0 },
    disappear: Object.fromEntries(FL_KIND.map((k) => [k, 0])),
    reappear: Object.fromEntries(FL_KIND.map((k) => [k, 0])),
    countMin: Object.fromEntries(FL_KIND.map((k) => [k, Infinity])),
    countMax: Object.fromEntries(FL_KIND.map((k) => [k, 0])),
    nanFrames: 0, nanSamples: 0, contextLost: 0,
    events: [], series: [],
    infoFirst: null, infoLast: null,
    callsMin: Infinity, callsMax: 0,
    geoMin: Infinity, geoMax: 0,
    texMin: Infinity, texMax: 0,
    progMin: Infinity, progMax: 0,
  };
  const flEvent = (e) => { if (flick.events.length < 400) flick.events.push(e); };

  //  ⚠ WebGL context lost 在手機上是**真的會發生**的閃爍來源（GPU 記憶體壓力下瀏覽器
  //  回收 context，畫布會黑一下再回來）。必須獨立計數，不可混進其它統計。
  const canvas = gl.domElement;
  const onCtxLost = () => { flick.contextLost++; flEvent({ f: flick.frames, kind: "contextlost" }); };
  canvas.addEventListener("webglcontextlost", onCtxLost, false);

  const finite3 = (o) => !!o && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z);
  /** 自己與所有祖先的 visible 都要是 true，才真的畫得出來。 */
  const chainVisible = (obj) => {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  };

  /** 掃一次 scene graph，回報這一幀每個動態物件的可繪製狀態。 */
  const scanFrame = () => {
    const out = [];
    const heroGroup = scene.getObjectByName("moba-runtime-heroes");
    if (heroGroup) {
      for (const root of heroGroup.children) {
        const id = root.userData ? root.userData.heroId : null;
        if (!id) continue;
        let body = null, bar = null, ring = null;
        root.traverse((o) => {
          const part = o.userData ? o.userData.part : null;
          if (part === "hero-body") body = o;
          else if (part === "hero-hpbar") bar = o;
          else if (part === "hero-ring") ring = o;
        });
        const okT = finite3(root.position) && finite3(root.scale)
          && Number.isFinite(root.rotation.x) && Number.isFinite(root.rotation.y);
        out.push({ kind: "hero", key: "hero:" + id, vis: !!body && chainVisible(body) && okT, nan: !okT });
        if (bar) out.push({ kind: "healthbar", key: "bar:" + id, vis: chainVisible(bar) && finite3(bar.scale), nan: !finite3(bar.scale) });
        if (ring) out.push({ kind: "ring", key: "ring:" + id, vis: chainVisible(ring), nan: false });
      }
    }
    const structGroup = scene.getObjectByName("moba-runtime-structures");
    if (structGroup) {
      for (const o of structGroup.children) {
        const ud = o.userData || {};
        if (ud.structureId) {
          const okT = finite3(o.position);
          out.push({ kind: "structure", key: "struct:" + ud.structureId, vis: chainVisible(o) && okT, nan: !okT });
        } else if (ud.objectiveId) {
          const okT = finite3(o.position);
          out.push({ kind: "objective", key: "obj:" + ud.objectiveId, vis: chainVisible(o) && okT, nan: !okT });
        }
      }
    }
    scene.traverse((o) => {
      if (!o.name?.startsWith("moba-map-wall-")) return;
      const ready = Number(o.instanceMatrix?.version ?? 0) > 0;
      out.push({
        kind: "mapWall",
        key: o.name,
        vis: chainVisible(o) && ready,
        nan: false,
        identity: o.uuid,
      });
    });
    return out;
  };

  window.__ESMO_RUNTIME_TICK = () => {
    for (const fx of frameRef?.current?.effects ?? []) seenEffectIds.add(fx.id);
    const now = performance.now();
    fps.frames++;
    if (!fps.last) fps.last = now;
    const dt = now - fps.last;
    if (dt >= 1000) {
      fps.value = (fps.frames * 1000) / dt;
      fps.frameMs = dt / fps.frames;
      fps.frames = 0;
      fps.last = now;
    }
    if (!flick.on) return;
    flick.frames++;
    const rows = scanFrame();
    const counts = Object.fromEntries(FL_KIND.map((k) => [k, 0]));
    let nanThisFrame = 0;
    for (const r of rows) {
      counts[r.kind]++;
      if (r.nan) { nanThisFrame++; flick.nanSamples++; flEvent({ f: flick.frames, kind: "nan", key: r.key }); }
      const was = flick.prevVisible.get(r.key);
      if (was === true && r.vis === false) {
        flick.disappear[r.kind]++;
        flEvent({ f: flick.frames, kind: "disappear", key: r.key });
      } else if (was === false && r.vis === true) {
        flick.reappear[r.kind]++;
        flEvent({ f: flick.frames, kind: "reappear", key: r.key });
      }
      flick.prevVisible.set(r.key, r.vis);
      if (r.identity) {
        const priorIdentity = flick.prevIdentity.get(r.key);
        if (priorIdentity && priorIdentity !== r.identity) {
          flick.identityChanges.mapWall++;
          flEvent({
            f: flick.frames,
            kind: "identity-change",
            key: r.key,
            from: priorIdentity,
            to: r.identity,
          });
        }
        flick.prevIdentity.set(r.key, r.identity);
      }
    }
    if (nanThisFrame) flick.nanFrames++;
    for (const k of FL_KIND) {
      if (counts[k] < flick.countMin[k]) flick.countMin[k] = counts[k];
      if (counts[k] > flick.countMax[k]) flick.countMax[k] = counts[k];
    }
    const info = {
      calls: gl.info.render.calls, geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures, programs: gl.info.programs ? gl.info.programs.length : 0,
    };
    if (!flick.infoFirst) flick.infoFirst = { ...info };
    flick.infoLast = { ...info };
    //  ⚠ 時間序列（每 120 幀一點）：分辨「首次被畫到才上傳 GPU 的延遲上傳」與「真的在洩漏」。
    //  兩者的總量變化看起來一樣（數字變大），但延遲上傳會**收斂到平台**，洩漏會一直爬。
    //  只看頭尾差值會把前者誤判成後者，所以這裡留下軌跡讓 verifier 判斷後半段是否已平。
    if (flick.frames % 120 === 1) flick.series.push({ f: flick.frames, ...info });
    flick.callsMin = Math.min(flick.callsMin, info.calls); flick.callsMax = Math.max(flick.callsMax, info.calls);
    flick.geoMin = Math.min(flick.geoMin, info.geometries); flick.geoMax = Math.max(flick.geoMax, info.geometries);
    flick.texMin = Math.min(flick.texMin, info.textures); flick.texMax = Math.max(flick.texMax, info.textures);
    flick.progMin = Math.min(flick.progMin, info.programs); flick.progMax = Math.max(flick.progMax, info.programs);
  };

  /** 開始／重設逐幀記錄。 */
  window.__ESMO_FLICKER_START = () => {
    flick.on = true; flick.frames = 0; flick.startedAt = performance.now();
    flick.prevVisible.clear(); flick.prevIdentity.clear();
    flick.events.length = 0; flick.series.length = 0;
    flick.identityChanges.mapWall = 0;
    for (const k of FL_KIND) {
      flick.disappear[k] = 0; flick.reappear[k] = 0;
      flick.countMin[k] = Infinity; flick.countMax[k] = 0;
    }
    flick.nanFrames = 0; flick.nanSamples = 0; flick.contextLost = 0;
    flick.infoFirst = null; flick.infoLast = null;
    flick.callsMin = Infinity; flick.callsMax = 0;
    flick.geoMin = Infinity; flick.geoMax = 0;
    flick.texMin = Infinity; flick.texMax = 0;
    flick.progMin = Infinity; flick.progMax = 0;
    return true;
  };

  /** 讀彙總（工具端只讀這個 ⇒ 不會因輪詢間隔漏幀）。 */
  window.__ESMO_FLICKER = () => ({
    on: flick.on,
    frames: flick.frames,
    elapsedMs: flick.startedAt ? Math.round(performance.now() - flick.startedAt) : 0,
    fps: +fps.value.toFixed(1),
    disappear: { ...flick.disappear },
    reappear: { ...flick.reappear },
    countRange: Object.fromEntries(FL_KIND.map((k) => [k, {
      min: Number.isFinite(flick.countMin[k]) ? flick.countMin[k] : null, max: flick.countMax[k],
    }])),
    nanFrames: flick.nanFrames, nanSamples: flick.nanSamples,
    contextLost: flick.contextLost,
    identityChanges: { ...flick.identityChanges },
    mounts: window.__ESMO_RUNTIME_MOUNTS ? { ...window.__ESMO_RUNTIME_MOUNTS } : null,
    renderer: {
      first: flick.infoFirst, last: flick.infoLast,
      calls: { min: Number.isFinite(flick.callsMin) ? flick.callsMin : null, max: flick.callsMax },
      geometries: { min: Number.isFinite(flick.geoMin) ? flick.geoMin : null, max: flick.geoMax },
      textures: { min: Number.isFinite(flick.texMin) ? flick.texMin : null, max: flick.texMax },
      programs: { min: Number.isFinite(flick.progMin) ? flick.progMin : null, max: flick.progMax },
    },
    events: flick.events.slice(0, 120),
    series: flick.series.slice(-40),
  });

  window.__ESMO_FLICKER_DISPOSE = () => canvas.removeEventListener("webglcontextlost", onCtxLost, false);

  /**
   * 每一名英雄在**真實場景圖裡**的狀態。
   * 走的是 scene graph（不是 Adapter 的資料），所以 scale/visible 被誰改壞都看得出來。
   */
  const heroDiagnostics = () => {
    const group = scene.getObjectByName("moba-runtime-heroes");
    if (!group) return [];
    const byData = new Map((frameRef?.current?.heroes ?? []).map((h) => [h.id, h]));
    const out = [];
    for (const root of group.children) {
      const id = root.userData?.heroId ?? null;
      const data = id ? byData.get(id) : null;
      //  本體 = 被標記成 hero-body 的 mesh（不是選取環、不是血條）
      let body = null, ring = null, deathMark = null;
      root.traverse((o) => {
        if (o.userData?.part === "hero-body") body = o;
        else if (o.userData?.part === "hero-ring") ring = o;
        else if (o.userData?.part === "hero-death-mark") deathMark = o;
      });
      const world = new (root.position.constructor)();
      root.getWorldPosition(world);
      //  【真正的「看得到嗎」】只看 object.visible 會說謊：座標一旦變成 NaN，
      //  visible 仍然是 true，但畫面上什麼都沒有（H.1-close 實測）。
      //  這裡把英雄胸口的世界座標投影到畫面，回報它是不是真的落在畫面內。
      let onScreen = false, screen = null;
      if (finiteVec(world)) {
        const p = world.clone();
        p.y += 4;                                   // 取胸口高度，避免腳點被地形擋住的誤判
        p.project(camera);
        onScreen = Number.isFinite(p.x) && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z > -1 && p.z < 1;
        screen = {
          xPct: n3(((p.x + 1) / 2) * 100),
          yPct: n3(((1 - p.y) / 2) * 100),
        };
      }
      out.push({
        id,
        team: data?.team ?? root.userData?.team ?? null,
        alive: data?.alive ?? null,
        hpRatio: data ? +data.hpRatio.toFixed(3) : null,
        level: data?.level ?? null,
        //  ⚠ H.2-close：行為狀態。「站著不動」在交戰／回城時是**正常**的，
        //  卡死判定必須排除那些狀態，否則會把團戰站樁誤報成卡在牆裡。
        actionState: data?.actionState ?? null,
        respawnIn: data?.respawnIn ?? null,
        //  ⚠ 這兩個欄位**不四捨五入**。碰撞驗收是拿座標去查 1.0 格點的距離場，
        //  格點取樣用的是 Math.round ⇒ 小數第 2 位的進位就足以讓取樣格整個換一格：
        //  實測 x=87.4999（淨距 2.41、可走）被 toFixed(2) 寫成 87.50 之後，
        //  查到的是隔壁的牆邊格（淨距 1.41）⇒ 驗收誤報成「英雄站在牆裡」。
        //  可讀性讓給正確性：驗收欄位一律給全精度。
        simPosition: data ? { x: data.position.x, y: data.position.y } : null,
        //  未內插的引擎座標（H.2-close 歸因用；見 mobaRuntimeMapAdapter 的 rawPosition）
        rawSimPosition: data?.rawPosition ? { x: data.rawPosition.x, y: data.rawPosition.y } : null,
        //  root 的世界座標（含地面吸附後的 y）
        position: vec3(world),
        rootScale: vec3(root.scale),
        bodyScale: vec3(body?.scale),
        bodyPosition: vec3(body?.position),
        //  visible = 場景圖層級的顯示旗標 **且** 座標有效 **且** 真的落在畫面內
        visible: !!(root.visible && body?.visible) && finiteVec(world) && onScreen,
        sceneVisibleFlag: !!(root.visible && body?.visible),
        positionFinite: finiteVec(world),
        onScreen,
        screen,
        bodyVisible: !!body?.visible,
        ringVisible: !!ring?.visible,
        //  陣亡呈現的三個可查證訊號：地面標記亮起、本體橫躺、本體不透明度
        deathMarkVisible: !!deathMark?.visible,
        bodyLyingDown: !!body && Math.abs(body.rotation.x) > 1,
        geometryType: geomType(body),
        materialType: body?.material?.type ?? null,
        materialOpacity: body?.material
          ? +(body.material.transparent ? body.material.opacity : 1).toFixed(3)
          : null,
        rotationY: root.rotation ? +root.rotation.y.toFixed(3) : null,
      });
    }
    return out;
  };

  /** renderer.info 是 three.js 的真實計數（不是估計值）。 */
  const perf = () => {
    const ctx = gl.getContext();
    const debugRenderer = (() => {
      try {
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
      } catch { return null; }
    })();
    const debugVendor = (() => {
      try {
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        return ext ? String(ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : null;
      } catch { return null; }
    })();
    return {
      fps: +fps.value.toFixed(1),
      frameTimeMs: +fps.frameMs.toFixed(2),
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? null,
      //  真實 GPU 還是 SwiftShader？驗收要求必須分辨得出來。
      renderer: debugRenderer,
      vendor: debugVendor,
      webglVersion: gl.capabilities.isWebGL2 ? 2 : 1,
      depthBits: (() => {
        try { return ctx.getParameter(ctx.DEPTH_BITS); } catch { return null; }
      })(),
      contextAttributes: (() => {
        try { return ctx.getContextAttributes(); } catch { return null; }
      })(),
      pixelRatio: gl.getPixelRatio(),
      drawingBuffer: { width: gl.domElement.width, height: gl.domElement.height },
      cssCanvas: {
        width: gl.domElement.clientWidth,
        height: gl.domElement.clientHeight,
      },
    };
  };

  /**
   * 把任意世界座標投影到畫面（截圖工具用來確認「主堡有沒有入鏡」）。
   * 回傳畫面百分比與是否在視錐內；座標無效時回 null，不回假值。
   */
  window.__ESMO_RUNTIME_PROJECT = (x, y, z) => {
    if (![x, y, z].every(Number.isFinite)) return null;
    const p = new camera.position.constructor(x, y, z);
    p.project(camera);
    if (!Number.isFinite(p.x)) return null;
    return {
      xPct: n3(((p.x + 1) / 2) * 100),
      yPct: n3(((1 - p.y) / 2) * 100),
      onScreen: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z > -1 && p.z < 1,
    };
  };

  //  H.2-flicker：塔的世界座標（塔冠會旋轉浮動，像素比對要把它們排除）。
  //  只在診斷模式掛，純唯讀。
  window.__ESMO_TOWER_WORLD = (() => {
    const g = scene.getObjectByName("moba-runtime-structures");
    if (!g) return [];
    return g.children
      .filter((o) => o.userData && o.userData.structureId)
      .map((o) => ({ x: o.position.x, y: 8, z: o.position.z }));
  })();

  window.__ESMO_RUNTIME_DIAG = () => {
    const f = frameRef?.current ?? {};
    const heroes = heroDiagnostics();
    const structures = f.structures ?? [];
    const objectives = f.objectives ?? [];
    return {
      ts: f.ts ?? null,
      over: !!f.over,
      warnings: f.warnings ?? [],
      heroCount: heroes.length,
      blueHeroCount: heroes.filter((h) => h.team === "blue").length,
      redHeroCount: heroes.filter((h) => h.team === "red").length,
      deadHeroCount: heroes.filter((h) => h.alive === false).length,
      minionCount: (f.minions ?? []).length,
      activeEffectCount: (f.effects ?? []).length,
      effectEventsSeen: seenEffectIds.size,
      // Milestone D：正式 GameView 驗收要能在單幀內鎖定塔彈／技能的
      // cast → travel → impact。僅在 ?diag=1 暴露唯讀摘要，不改 frame。
      activeEffects: (f.effects ?? []).map((fx) => ({
        id: fx.id,
        type: fx.type,
        style: fx.style,
        phase: fx.phase,
        phaseProgress: Number.isFinite(fx.phaseProgress) ? +fx.phaseProgress.toFixed(3) : null,
        sourceId: fx.sourceId ?? null,
        targetId: fx.targetId ?? null,
        feedback: fx.feedback ?? null,
        combatClass: fx.combatClass ?? null,
      })),
      visibleHeroIds: heroes.filter((h) => h.visible).map((h) => h.id),
      towerAliveCount: structures.filter((s) => s.type === "tower" && s.alive).length,
      towerDestroyedCount: structures.filter((s) => s.type === "tower" && !s.alive).length,
      nexusCount: structures.filter((s) => s.type === "nexus").length,
      //  ⚠ H.2-close：**逐座**結構的存活狀態。碰撞驗收必須知道「這一刻哪些塔還擋人」——
      //  已摧毀的塔在 H.2 是明確放行的（見 mobaNavigation 檔頭），只給總數的話，
      //  驗收腳本會把「站在已拆掉的塔原地」誤判成穿塔（第一次跑就誤報 135 次）。
      structureState: structures.map((s) => ({ id: s.id, type: s.type, alive: !!s.alive })),
      //  主堡世界座標（**snapshot 模擬座標換算**，不是 Renderer 用的呈現錨點；
      //  只拿來當「把相機大致對到主堡」的瞄準點，不可當呈現位置的真值）
      nexusWorld: structures.filter((s) => s.type === "nexus").map((s) => ({
        id: s.id, team: s.team, alive: s.alive,
        world: { x: +s.world.x.toFixed(2), z: +s.world.z.toFixed(2) },
        //  有沒有真的入鏡（驗收要求手機低階模式仍看得到主堡）
        screen: window.__ESMO_RUNTIME_PROJECT(s.world.x, 6, s.world.z),
      })),
      objectiveState: objectives.map((o) => ({
        id: o.id, type: o.type, alive: o.alive, respawnState: o.respawnState,
        //  世界座標讓截圖工具能把相機對準大型目標區（不必自己重算一次座標換算）
        world: { x: +o.world.x.toFixed(2), z: +o.world.z.toFixed(2) },
        fallbackPosition: !!o.fallbackPosition,
      })),
      cameraDistance: (() => {
        const t = window.__ESMO_RUNTIME_CAM?.();
        return t ? +t.dist.toFixed(1) : null;
      })(),
      camera: { position: vec3(camera.position), fov: camera.fov, near: camera.near, far: camera.far },
      heroRenderDiagnostics: heroes,
      performance: perf(),
    };
  };
}

/** 卸載（HMR / 換模式時不要留下失效的閉包）。 */
export function removeRuntimeDiagnostics() {
  if (typeof window === "undefined") return;
  if (window.__ESMO_FLICKER_DISPOSE) window.__ESMO_FLICKER_DISPOSE();
  delete window.__ESMO_RUNTIME_DIAG;
  delete window.__ESMO_RUNTIME_TICK;
  delete window.__ESMO_RUNTIME_CAM;
  delete window.__ESMO_FLICKER;
  delete window.__ESMO_FLICKER_START;
  delete window.__ESMO_FLICKER_DISPOSE;
}
