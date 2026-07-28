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
  window.__ESMO_RUNTIME_TICK = () => {
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
  };

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
  const perf = () => ({
    fps: +fps.value.toFixed(1),
    frameTimeMs: +fps.frameMs.toFixed(2),
    drawCalls: gl.info.render.calls,
    triangles: gl.info.render.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    programs: gl.info.programs?.length ?? null,
    //  真實 GPU 還是 SwiftShader？驗收要求必須分辨得出來。
    renderer: (() => {
      try {
        const ctx = gl.getContext();
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
      } catch { return null; }
    })(),
    vendor: (() => {
      try {
        const ctx = gl.getContext();
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        return ext ? String(ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : null;
      } catch { return null; }
    })(),
    pixelRatio: gl.getPixelRatio(),
    drawingBuffer: { width: gl.domElement.width, height: gl.domElement.height },
  });

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
  delete window.__ESMO_RUNTIME_DIAG;
  delete window.__ESMO_RUNTIME_TICK;
  delete window.__ESMO_RUNTIME_CAM;
}
