// ============================================================================
//  screens/manage/ClubMasteryScreen.jsx — 俱樂部專精（Meta Progression v1）
//
//  ── 這一頁在回答一個問題：「我的戰隊是什麼流派？」──────────────────────
//  `ObjectivesScreen` 回答「今天做什麼」，`TeamDevelopmentScreen` 回答
//  「俱樂部投資什麼」，這一頁回答**打法認同**。三個是不同的 domain，
//  所以是三頁，不是三個分頁——把它們併在一起，玩家就分不出
//  「我今天該做的事」與「我這支隊伍長成什麼樣子」的差別。
//
//  ⚠ **本頁不算任何進度、不判任何規則。** 目標、進度、可不可領、變體能不能
//    裝備，全部來自 `profile.masteryView()` 與 `profile.variantsForTactic()`。
//    畫面自己算一次，規則就有兩份，而被修的永遠是另外那一份。
//
//  ⚠ **BASIC 永遠可用**這件事要寫在畫面上，不能只寫在程式裡。玩家看到
//    「解鎖」兩個字的直覺是「有東西被鎖住了」——必須當場告訴他不是。
//
//  ── Visual V2：層級就是規則 ──────────────────────────────────────────────
//  規則是「只有進行中的流派會累積」。V1 把它寫成灰色小字，三條流派長得一樣，
//  於是規則只存在於文字裡。V2 改成：現行流派是 hero，帶自己的色相並整段點亮；
//  另外兩條保持完整可讀，但明顯沉睡、且點一下就能換過去。**沒有藏任何資訊**，
//  只是重量不同——玩家不用讀說明就知道哪一條在跑。
//
//  進度用**分段刻度**而不是百分比條：條件本來就是「打幾場」這種整數，
//  連續進度條會謊報精度。樣式全部在 `clubMastery.css`，含 reduced-motion。
//
//  手機優先：單欄、flex-wrap、minWidth:0，390px 不水平溢出。
// ============================================================================
import React from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { DOCTRINES, doctrineById } from "../../platform/mastery/doctrine.js";
import { variantById, variantsOfDoctrine } from "../../platform/mastery/tacticVariant.js";
import { mobaTacticById } from "../../platform/contracts/MobaTacticConfig.js";
import { ESMO_CSS_VARS } from "../../ui/designSystem.js";
import "./clubMastery.css";

/**
 * 每條流派的色相。**純呈現**，不進 domain——`doctrine.js` 不該知道自己是橘的。
 * 綠色刻意不在這張表裡：綠色在這一頁只代表「可以領了 / 現在能用」。
 */
const DOCTRINE_ACCENT = Object.freeze({
  tempo: "#fb923c",     // 強攻：熱度與前壓
  control: "#38bdf8",   // 控圖：視野與冷靜
  adaptive: "#a78bfa",  // 應變：與 MOBA 既有紫同源
});
const NO_DOCTRINE_ACCENT = "#94a3b8";

/**
 * 流派標記。**刻意不用 `doctrine.emoji`**：
 *   ① Windows 上 `🔄` 會 fallback 成一個帶 END 字樣的箭頭，難看且語意錯。
 *   ② 設計系統 §4 明文說 navigation / status 不用 Emoji 當主要 icon。
 * 三個記號各自說一件事：強攻＝連續前壓的箭頭、控圖＝守住中央的格盤、
 * 應變＝保留兩條路的分岔。emoji 仍留在 `doctrine.js` 供其他畫面使用。
 */
const DOCTRINE_MARK = Object.freeze({
  tempo: (
    <>
      <path d="M3.5 6l5 6-5 6" />
      <path d="M10.5 6l5 6-5 6" />
      <path d="M17.5 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  control: (
    <>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.6" />
      <path d="M9.2 3.4v17.2M14.8 3.4v17.2M3.4 9.2h17.2M3.4 14.8h17.2" opacity="0.42" />
      <rect x="9.2" y="9.2" width="5.6" height="5.6" fill="currentColor" stroke="none" />
    </>
  ),
  adaptive: (
    <>
      <path d="M2.8 12h5.4" />
      <path d="M8.2 12l4.6-5.4h3.8" />
      <path d="M8.2 12l4.6 5.4h3.8" />
      <circle cx="19" cy="6.6" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="17.4" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
});

function DoctrineMark({ id, size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DOCTRINE_MARK[id] ?? <circle cx="12" cy="12" r="7.6" />}
    </svg>
  );
}

/** 阻擋原因 → 玩家看得懂的一句話。**文案在這裡，判定在 domain。** */
const BLOCKED_ZH = {
  incomplete: "條件還沒完成",
  not_active: "先切換到這個流派才能領取",
  already_claimed: "已領取",
  already_unlocked: "已解鎖",
  unknown_reward: "獎勵無法解析",
  unknown_track: "找不到這條進度",
};

/**
 * 分段刻度。`target` 顆，前 `progress` 顆亮起，下一顆呼吸提示「還差這個」。
 * 全部完成時整排轉綠——綠在這一頁只代表達成，與流派色分開。
 */
function Notches({ progress, target, done, small = false }) {
  const total = Math.max(1, Math.min(12, Math.floor(target) || 1));
  const lit = Math.max(0, Math.min(total, Math.floor(progress) || 0));
  return (
    <div className={`cm__notches${small ? " cm__notches--small" : ""}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const on = i < lit;
        const next = !on && i === lit;
        return (
          <span key={i}
            className={`cm__notch${on ? " cm__notch--on" : ""}${on && done ? " cm__notch--done" : ""}${next ? " cm__notch--next" : ""}`} />
        );
      })}
    </div>
  );
}

/** 一個變體：解鎖與否、能不能用、換到什麼付出什麼。 */
function Variant({ variantId, unlocked, equippable, trackName, delay }) {
  const v = variantById(variantId);
  if (!v) return null;
  const base = mobaTacticById(v.baseTacticId);
  const pill = equippable
    ? { cls: "cm__pill--live", text: "賽前可選" }
    : unlocked
      ? { cls: "cm__pill--owned", text: "已擁有" }
      : { cls: "cm__pill--locked", text: "未解鎖" };
  return (
    <div className="cm__variant cm-rise"
      style={{ "--cm-delay": `${delay}ms` }}
      data-testid={`mastery-variant-${variantId}`}
      data-unlocked={unlocked ? "1" : "0"}
      data-equippable={equippable ? "1" : "0"}>
      <div className="cm__variant-head">
        <span className="cm__variant-name">{v.name}</span>
        <span className="cm__variant-base">改自 {base?.emoji} {base?.name}</span>
        <span className={`cm__pill ${pill.cls}`}>{pill.text}</span>
      </div>
      <div className="cm__variant-desc">{v.desc}</div>

      {/* 取捨：換到什麼、付出什麼。高階打法不等於更強，這兩欄就是在說這件事。 */}
      <div className="cm__trade">
        <div className="cm__trade-col cm__trade-col--gain">
          <span className="cm__trade-label">換到</span>
          <div className="cm__trade-value">{v.benefitAxes.map((a) => a.label).join("、")}</div>
        </div>
        <div className="cm__trade-col cm__trade-col--cost">
          <span className="cm__trade-label">付出</span>
          <div className="cm__trade-value">{v.costAxes.map((a) => a.label).join("、")}</div>
        </div>
      </div>

      {unlocked && !equippable && (
        <div className="cm__variant-hint">
          已擁有——把流派切回「{doctrineById(v.doctrine)?.zh}」就能在賽前選用
        </div>
      )}
      {!unlocked && (
        <div className="cm__variant-hint cm__variant-hint--locked">
          領取「{trackName}」後解鎖
        </div>
      )}
    </div>
  );
}

/** 現行流派的專精進度：一條流派恰好一條進度。 */
function Track({ track, onClaim, celebrating }) {
  const status = track.claimable
    ? "條件已達成，可以領取"
    : track.claimed
      ? "已領取"
      : (BLOCKED_ZH[track.blockedBy] ?? "尚未完成");
  return (
    <div
      className={`cm__track cm-rise${celebrating ? " cm__track--celebrate" : ""}`}
      style={{ "--cm-delay": "190ms" }}
      data-testid={`mastery-track-${track.trackId}`}
      data-claimable={track.claimable ? "1" : "0"}
      data-claimed={track.claimed ? "1" : "0"}
      data-done={track.done ? "1" : "0"}>
      <div className="cm__track-head">
        <span className="cm__track-name">{track.name}</span>
        <Notches progress={track.progress} target={track.target} done={track.done} />
        <span className="cm__track-count cm__data">{track.progress} / {track.target}</span>
      </div>
      <div className="cm__track-desc">{track.desc}</div>
      <div className="cm__track-foot">
        <span className="cm__track-status">{status}</span>
        <button type="button"
          className={`cm__claim${track.claimable ? " cm__claim--ready" : ""}`}
          data-testid={`mastery-claim-${track.trackId}`}
          disabled={!track.claimable}
          onClick={() => track.claimable && onClaim(track.trackId)}>
          {track.claimed ? "已領取" : "領取獎勵"}
        </button>
      </div>
    </div>
  );
}

/** 沉睡的流派：完整可讀、沒有顏色，點一下就換過去。 */
function DormantDoctrine({ doctrine, track, variants, onSwitch, delay }) {
  const owned = variants.filter((v) => v.unlocked).length;
  const variantLine = variants.length === 0
    ? "尚無變體"
    : owned > 0
      ? `已擁有 ${owned} 個變體，切回這條才能選用`
      : "變體未解鎖";
  return (
    <button type="button"
      className="cm__dormant cm-rise"
      //  hover 時透出「換過去會變成什麼顏色」，是換派前的預告，不是裝飾。
      style={{ "--cm-delay": `${delay}ms`, "--cm-preview-accent": DOCTRINE_ACCENT[doctrine.id] ?? NO_DOCTRINE_ACCENT }}
      data-testid={`doctrine-${doctrine.id}`}
      data-active="0"
      onClick={() => onSwitch(doctrine.id)}>
      <span className="cm__dormant-mark"><DoctrineMark id={doctrine.id} size={22} /></span>
      <span className="cm__dormant-copy">
        <span className="cm__dormant-name">{doctrine.zh}</span>
        <span className="cm__dormant-line">
          {track && (
            <>
              <span>{track.name}</span>
              <Notches progress={track.progress} target={track.target} done={track.done} small />
              <span className="cm__data">{track.progress}/{track.target}</span>
              <span>·</span>
            </>
          )}
          <span>{variantLine}</span>
        </span>
      </span>
      <span className="cm__dormant-switch">改打這條</span>
    </button>
  );
}

export default function ClubMasteryScreen({ onBack }) {
  const profile = useProfileStore();
  //  ⚠ 兩份 view 都是**推導**出來的，畫面不保存任何一份。
  const view = profile.masteryView();
  const retention = typeof profile.retentionView === "function" ? profile.retentionView() : null;
  const tier = retention?.tier ?? null;

  //  領取後的一次性回饋。只是動畫旗標，不是狀態來源。
  const [celebrating, setCelebrating] = React.useState(null);
  React.useEffect(() => {
    if (!celebrating) return undefined;
    const id = setTimeout(() => setCelebrating(null), 1600);
    return () => clearTimeout(id);
  }, [celebrating]);

  const setDoctrine = (id) => profile.setActiveDoctrine(id);
  const claim = (trackId) => {
    const r = profile.claimMasteryTrack(trackId);
    if (r?.ok) setCelebrating(trackId);
  };

  //  把 domain 的三份資料（流派、進度、變體）在呈現層對齊成一包，不重算規則。
  const bundles = DOCTRINES.map((d) => ({
    doctrine: d,
    track: view.tracks.find((t) => t.doctrine === d.id) ?? null,
    variants: variantsOfDoctrine(d.id).map((v) => {
      const info = profile.variantsForTactic(v.baseTacticId).variants.find((x) => x.variantId === v.variantId);
      return { variantId: v.variantId, unlocked: Boolean(info?.unlocked), equippable: Boolean(info?.equippable) };
    }),
  }));
  const active = bundles.find((b) => b.doctrine.id === view.activeDoctrine) ?? null;
  const dormant = bundles.filter((b) => b.doctrine.id !== view.activeDoctrine);
  const accent = active ? (DOCTRINE_ACCENT[active.doctrine.id] ?? NO_DOCTRINE_ACCENT) : NO_DOCTRINE_ACCENT;

  return (
    <div className="cm" data-testid="club-mastery-screen"
      data-doctrine={active?.doctrine.id ?? "none"}
      style={{ ...ESMO_CSS_VARS, "--doctrine-accent": accent }}>
      <div className="cm__canvas">

        {/* 頂列：回上一頁、頁名、可花點數 */}
        <div className="cm__bar cm-rise">
          {onBack && (
            <button type="button" className="cm__back" onClick={onBack}
              data-testid="club-mastery-back" aria-label="回上一頁">←</button>
          )}
          <div className="cm__titles">
            <div className="cm__title">俱樂部專精</div>
            <div className="cm__subtitle">你的戰隊打成什麼樣子</div>
          </div>
          {retention && (
            <div className="cm__wallet">
              <div className="cm__wallet-value cm__data" data-testid="mastery-club-balance">◆ {retention.clubPoints}</div>
              <div className="cm__wallet-label">可花點數</div>
            </div>
          )}
        </div>

        {/*  Hero：現行流派。key 綁流派 id ⇒ 切換時整段重新進場，換色是看得見的事件。 */}
        <div key={active?.doctrine.id ?? "none"}
          className="cm__hero cm-rise"
          style={{ "--cm-delay": "50ms" }}
          {...(active ? { "data-testid": `doctrine-${active.doctrine.id}`, "data-active": "1" } : {})}>
          <div className="cm__hero-head">
            <span className="cm__hero-mark">
              {active
                ? <DoctrineMark id={active.doctrine.id} size={34} />
                : <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeDasharray="3 3.4" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>}
            </span>
            <span className="cm__hero-name">{active ? active.doctrine.zh : "尚未選定"}</span>
            {active && (
              <span className="cm__hero-live"><span className="cm__hero-dot" />進行中</span>
            )}
          </div>
          <div className="cm__hero-claim">
            {active
              ? active.doctrine.claim
              : "選一條流派，之後的比賽才會開始累積專精。切換免費，進度永久保留。"}
          </div>
          <div className="cm__hero-rule">
            {active
              ? `只有「${active.doctrine.zh}」的比賽會累積專精，也只有它的變體能在賽前選用。切換免費，已累積的進度永久保留。`
              : "目前沒有任何流派在累積。往下挑一條開始。"}
            {/*  V1 的「點現行流派＝取消選定」在 V2 沒有了（hero 不是按鈕），
                 所以把那條功能明確留在這裡——不常用，但不能悄悄消失。 */}
            {active && (
              <button type="button" className="cm__hero-pause"
                data-testid="doctrine-clear" onClick={() => setDoctrine(null)}>
                暫停累積
              </button>
            )}
          </div>
        </div>

        {/*  等級與「基礎戰術永遠可用」是兩則背景資訊，桌機並排、手機自然疊起來。 */}
        <div className="cm__meta">
        {/*  俱樂部**聲望**（Prestige Tier）：由 `clubPointsLifetime` 推導。
             ⚠ 這不是 Club Level。Club Level 住在 `platform/progression/clubProgression.js`，
             由比賽產出的 Club XP 決定；這一格看的是累計拿過多少俱樂部點數。
             以前這張卡沒有標題，只放一個「職業俱樂部」，玩家分不出兩者 ⇒ 補上標籤。 */}
        {tier && (
          <div className="cm__club cm-rise" style={{ "--cm-delay": "110ms" }} data-testid="mastery-club-card">
            <div className="cm__club-row">
              <span className="cm__club-label" data-testid="mastery-prestige-label">俱樂部聲望</span>
              <span className="cm__club-icon">{tier.icon}</span>
              <span className="cm__club-name" data-testid="mastery-club-tier">{tier.name}</span>
              <span className="cm__club-next cm__data">
                累計 {retention.clubPointsLifetime}
                {tier.next ? `　再 ${tier.toNext} 到 ${tier.next.name}` : "　已達頂級"}
              </span>
            </div>
            <div className="cm__rail">
              <div className="cm__rail-fill" style={{ width: `${Math.max(2, Math.min(100, tier.percent))}%` }} />
            </div>
          </div>
        )}

        {/*  ⚠ 刻意放在流派清單之前：玩家看到「解鎖」會以為有東西被鎖住。 */}
        <div className="cm__note cm-rise" style={{ "--cm-delay": "150ms" }} data-testid="mastery-basic-note">
          <strong>八套基礎戰術永遠可用。</strong>
          專精解鎖的是變體：它換到某些東西，同時也付出代價——不是更強的版本，是另一種打法。
        </div>
        </div>

        {/* 現行流派的專精進度與變體 */}
        {active?.track && (
          <>
            <div className="cm__eyebrow cm-rise" style={{ "--cm-delay": "170ms" }}>專精進度</div>
            <Track track={active.track} onClaim={claim} celebrating={celebrating === active.track.trackId} />
            <div className="cm__eyebrow cm-rise" style={{ "--cm-delay": "230ms" }}>這條流派的變體</div>
            {active.variants.map((v, i) => (
              <Variant key={v.variantId} {...v} trackName={active.track.name} delay={250 + i * 50} />
            ))}
          </>
        )}

        {/* 其他流派：可讀但沉睡，點一下就換 */}
        <div className="cm__eyebrow cm-rise" style={{ "--cm-delay": "300ms" }}>
          {active ? "換一條打法" : "選一條打法"}
        </div>
        {dormant.map((b, i) => (
          <DormantDoctrine key={b.doctrine.id}
            doctrine={b.doctrine} track={b.track} variants={b.variants}
            onSwitch={setDoctrine} delay={320 + i * 60} />
        ))}
      </div>
    </div>
  );
}
