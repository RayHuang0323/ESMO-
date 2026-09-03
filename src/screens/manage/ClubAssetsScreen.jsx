// ============================================================================
//  screens/manage/ClubAssetsScreen.jsx — 俱樂部資產（Club Assets v1）
//
//  ── 這一頁在回答一個問題：「這一週誰在帶隊？」──────────────────────────
//  `ClubMasteryScreen` 回答「我怎麼打」（Doctrine），這一頁回答
//  「我的俱樂部投資什麼」。兩者刻意正交——如果有 synergy，就會出現唯一最佳
//  組合，而兩邊的三選一都會塌成一選一。
//
//  ⚠ **本頁不判任何規則。** 買不買得起、夠不夠格、這週還能不能換人，
//    全部來自 `profile.clubAssetsView()`。畫面自己算一次，規則就有兩份。
//
//  ⚠ **specialty 是分類，不是等級。** 三個專長同飽和、同權重，沒有星等、
//    沒有金框、沒有稀有度標籤——任何有序視覺都會被讀成強度排序。
//    價格只代表取得節奏（700 / 1100 / 1700）。
//
//  手機優先：單欄、flex-wrap、minWidth:0，390px 不水平溢出。
// ============================================================================
import React from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { assetById, SPECIALTY_ZH } from "../../platform/assets/coachCatalog.js";
import { IDENTITY_TYPE_LIST, IDENTITY_TYPE_ZH } from "../../platform/assets/identityCatalog.js";
import { ESMO_CSS_VARS } from "../../ui/designSystem.js";
import "./clubAssets.css";

/**
 * 專長色相。**純呈現**，不進 domain。三個同亮度同飽和 ⇒ 並列，不成階梯。
 * 綠色刻意不在這張表裡：綠色在這一頁只代表「現在可以做這件事」。
 */
const SPECIALTY_ACCENT = Object.freeze({
  conditioning: "#4ade80",
  scouting: "#38bdf8",
  tactical: "#fb923c",
});
const NO_COACH_ACCENT = "#94a3b8";

/**
 * 專長標記。與專精頁同一個決定：不用 Emoji（Windows fallback 難看，且設計系統
 * §4 明文說 navigation / status 不用 Emoji 當主要 icon）。
 * 體能＝心跳線、球探＝望遠的準星、戰術＝白板上的路線。
 */
const SPECIALTY_MARK = Object.freeze({
  conditioning: <path d="M2.5 12h4l2-5 3.5 10 2.5-7 1.8 2h5.2" />,
  scouting: (
    <>
      <circle cx="10.5" cy="10.5" r="6.4" />
      <path d="M15.2 15.2L21 21" />
      <path d="M10.5 7.6v5.8M7.6 10.5h5.8" opacity="0.5" />
    </>
  ),
  tactical: (
    <>
      <path d="M3 5.5h18v11H3z" opacity="0.45" />
      <path d="M6 13.5c2.4 0 2.4-4 4.8-4s2.4 4 4.8 4 2.4-2.5 2.4-2.5" />
      <circle cx="6" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
});

function SpecialtyMark({ specialty, size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SPECIALTY_MARK[specialty] ?? <circle cx="12" cy="12" r="7.6" />}
    </svg>
  );
}

/** 阻擋碼 → 玩家看得懂的一句話。**文案在這裡，判定在 domain。** */
function statusTextOf(item, view) {
  if (item.equipped) return "現任總教練";
  if (item.owned) {
    if (item.canEquip) return "已聘用，可以讓他接手";
    return view.canChangeCoach ? "已聘用" : "已聘用——本週已經換過總教練，下週才能再換";
  }
  if (!item.prerequisiteMet) return `需要俱樂部累計 ${item.prerequisite.min} 點才能聘用`;
  if (!item.affordable) return `還差 ${item.shortBy} 點`;
  return "點數足夠，可以聘用";
}

function CoachCard({ item, onBuy, onEquip, view, flash, delay }) {
  const accent = SPECIALTY_ACCENT[item.specialty] ?? NO_COACH_ACCENT;
  const status = statusTextOf(item, view);
  const statusClass = item.canBuy ? " ca__status--ready" : item.owned ? " ca__status--owned" : "";
  return (
    <div
      className={`ca__card ca-rise${flash ? " ca__card--flash" : ""}`}
      style={{ "--card-accent": accent, "--ca-delay": `${delay}ms` }}
      data-testid={`asset-card-${item.assetId}`}
      data-owned={item.owned ? "1" : "0"}
      data-equipped={item.equipped ? "1" : "0"}
      data-affordable={item.affordable ? "1" : "0"}>
      <div className="ca__card-head">
        <span className="ca__card-mark"><SpecialtyMark specialty={item.specialty} size={20} /></span>
        <span className="ca__card-name">{item.name}</span>
        <span className="ca__specialty">{SPECIALTY_ZH[item.specialty] ?? item.specialty}</span>
        {item.owned
          ? <span className="ca__price ca__price--owned">已聘用</span>
          : <span className="ca__price">◆ {item.price}</span>}
      </div>

      <div className="ca__card-desc">{item.description}</div>

      {/* 換到什麼、放棄什麼。三位教練互不可比，這兩欄就是在說這件事。 */}
      <div className="ca__trade">
        <div className="ca__trade-col ca__trade-col--gain">
          <span className="ca__trade-label">帶來</span>
          <div className="ca__trade-value">{item.capabilityText}</div>
        </div>
        <div className="ca__trade-col ca__trade-col--cost">
          <span className="ca__trade-label">不提供</span>
          <div className="ca__trade-value">{item.tradeoffText}</div>
        </div>
      </div>

      <div className="ca__card-foot">
        <span className={`ca__status${statusClass}`}>{status}</span>
        {item.owned ? (
          <button type="button"
            className={`ca__action${item.canEquip ? " ca__action--swap" : ""}`}
            data-testid={`asset-equip-${item.assetId}`}
            disabled={!item.canEquip}
            onClick={() => item.canEquip && onEquip(item.assetId)}>
            {item.equipped ? "帶隊中" : "讓他接手"}
          </button>
        ) : (
          <button type="button"
            className={`ca__action${item.canBuy ? " ca__action--ready" : ""}`}
            data-testid={`asset-buy-${item.assetId}`}
            disabled={!item.canBuy}
            onClick={() => item.canBuy && onBuy(item.assetId)}>
            聘用
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 一件外觀。
 *
 * ⚠ 與教練卡刻意長得不一樣：外觀**沒有能力、沒有取捨、沒有冷卻**，
 *   所以這裡不畫「帶來／不提供」兩欄——那兩欄在教練卡上是在說取捨，
 *   放到沒有取捨的東西上只會製造「它是不是也有效果」的誤會。
 *   這裡改成直接把外觀本身**預覽出來**：主題色給色票、稱號給實際的膠囊、
 *   隊徽框給一個小圓框。看得到才知道自己在買什麼。
 */
function IdentityCard({ item, onBuy, onEquip, onClear, flash, delay }) {
  const t = item.visualToken ?? {};
  const accent = t.accent ?? t.ring ?? (item.earned ? "#fbbf24" : "#94a3b8");
  //  ⚠ 實績稱號的文案要說「怎麼拿到」，不是「還差幾點」——它跟點數無關。
  const status = item.equipped ? "使用中"
    : item.owned ? (item.earned ? "已取得的榮譽稱號" : "已擁有")
      : item.earned
        ? (item.earnedMet
          ? "實績已達成，即將入手"
          : `年度冠軍 ${item.earnedHave} / ${item.earnedNeed} 次——點數買不到`)
        : item.retired ? "已下架，無法取得"
          : !item.prerequisiteMet ? `需要俱樂部累計 ${item.prerequisite.min} 點`
            : !item.affordable ? `還差 ${item.shortBy} 點`
              : "點數足夠，可以取得";
  return (
    <div
      className={`ca__card ca-rise${flash ? " ca__card--flash" : ""}`}
      style={{ "--card-accent": accent, "--ca-delay": `${delay}ms` }}
      data-testid={`identity-card-${item.assetId}`}
      data-owned={item.owned ? "1" : "0"}
      data-equipped={item.equipped ? "1" : "0"}
      data-affordable={item.affordable ? "1" : "0"}
      data-source={item.source ?? "identity"}
      data-slot={item.slot}>
      <div className="ca__card-head">
        {/*  預覽：四種型別各自畫自己的樣子。**主題預覽不是兩個色票**——
             它要看得出光向與材質，否則卡片會再一次把「換皮膚」講成「換顏色」。 */}
        <span className="ca__look-preview" data-kind={item.type}>
          {item.type === "clubTheme" && (
            <b data-skin={t.skin} style={{ "--p-a": t.accent, "--p-b": t.accent2 }} />
          )}
          {item.type === "clubTitle" && <em data-earned={item.earned ? "1" : "0"}>{t.label}</em>}
          {item.type === "clubCrestFrame" && <b data-pattern={t.pattern} style={{ borderColor: t.ring }} />}
          {item.type === "clubBanner" && (
            <b data-motif={t.motif} style={{ "--p-a": "currentColor", "--p-b": "currentColor" }} />
          )}
        </span>
        <span className="ca__card-name">{item.name}</span>
        {item.owned
          ? <span className="ca__price ca__price--owned">{item.retired ? "典藏" : "已擁有"}</span>
          : item.earned
            ? <span className="ca__price ca__price--earned">實績取得</span>
            : <span className="ca__price">◆ {item.price}</span>}
      </div>

      <div className="ca__card-desc">{item.description}</div>

      <div className="ca__card-foot">
        <span className={`ca__status${item.canBuy ? " ca__status--ready" : item.owned ? " ca__status--owned" : ""}`}>
          {status}
        </span>
        {item.owned ? (
          item.equipped ? (
            <button type="button" className="ca__action ca__action--swap"
              data-testid={`identity-clear-${item.assetId}`}
              onClick={() => onClear(item.slot)}>
              換回預設
            </button>
          ) : (
            <button type="button" className="ca__action ca__action--swap"
              data-testid={`identity-equip-${item.assetId}`}
              onClick={() => onEquip(item.assetId)}>
              使用
            </button>
          )
        ) : item.earned ? (
          //  ⚠ 實績稱號**沒有購買鍵**，而且 domain 也擋（`purchaseAsset` 回
          //     `earned_only`）。這裡只是不畫一顆按不下去的鍵。
          <span className="ca__action ca__action--locked" data-testid={`identity-locked-${item.assetId}`}>
            打出來的
          </span>
        ) : (
          <button type="button"
            className={`ca__action${item.canBuy ? " ca__action--ready" : ""}`}
            data-testid={`identity-buy-${item.assetId}`}
            disabled={!item.canBuy}
            onClick={() => item.canBuy && onBuy(item.assetId)}>
            取得
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClubAssetsScreen({ onBack }) {
  const profile = useProfileStore();
  //  ⚠ 這兩份都是**推導**出來的，畫面不保存任何一份。
  const view = profile.clubAssetsView();
  const identity = profile.identityView();

  //  一次性回饋旗標。只是動畫用，不是狀態來源——不進 store、不進存檔。
  const [flash, setFlash] = React.useState(null);
  const [spent, setSpent] = React.useState(false);
  React.useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 1300);
    return () => clearTimeout(id);
  }, [flash]);
  React.useEffect(() => {
    if (!spent) return undefined;
    const id = setTimeout(() => setSpent(false), 1000);
    return () => clearTimeout(id);
  }, [spent]);

  const buy = (assetId) => {
    const r = profile.buyClubAsset(assetId);
    if (r?.ok) { setFlash(assetId); setSpent(true); }
  };
  const equip = (assetId) => {
    const r = profile.equipHeadCoach(assetId);
    if (r?.ok) setFlash(assetId);
  };
  //  外觀：裝備免費、隨時可換，所以按下去就換，不需要任何確認。
  const equipLook = (assetId) => {
    const r = profile.equipClubIdentity(assetId);
    if (r?.ok) setFlash(assetId);
  };
  const clearLook = (slot) => profile.equipClubIdentity(null, slot);

  const head = view.headCoachId ? assetById(view.headCoachId) : null;
  const accent = head ? (SPECIALTY_ACCENT[head.specialty] ?? NO_COACH_ACCENT) : NO_COACH_ACCENT;

  return (
    <div className="ca" data-testid="club-assets-screen"
      data-head-coach={view.headCoachId ?? "none"}
      style={{ ...ESMO_CSS_VARS, "--specialty-accent": accent }}>
      <div className="ca__canvas">

        <div className="ca__bar ca-rise">
          {onBack && (
            <button type="button" className="ca__back" onClick={onBack}
              data-testid="club-assets-back" aria-label="回上一頁">←</button>
          )}
          <div className="ca__titles">
            <div className="ca__title">俱樂部資產</div>
            <div className="ca__subtitle">教練與收藏</div>
          </div>
          <div className="ca__wallet">
            <div className={`ca__wallet-value${spent ? " ca__wallet--spent" : ""}`} data-testid="club-assets-balance">
              ◆ {view.clubPoints}
            </div>
            <div className="ca__wallet-label">可花點數</div>
          </div>
        </div>

        {/*  Hero：現任總教練。key 綁 id ⇒ 換人時整段重新進場，換色是看得見的事件。 */}
        <div key={view.headCoachId ?? "none"}
          className={`ca__hero ca-rise${head ? "" : " ca__hero--empty"}`}
          style={{ "--ca-delay": "50ms" }}
          data-testid="head-coach-hero">
          <div className="ca__hero-eyebrow">總教練</div>
          <div className="ca__hero-head">
            <span className="ca__hero-mark">
              {head
                ? <SpecialtyMark specialty={head.specialty} size={30} />
                : <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeDasharray="3 3.4" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>}
            </span>
            <span className="ca__hero-name">{head ? head.name : "尚未聘用"}</span>
          </div>
          <div className="ca__hero-body">
            {head ? head.description : "俱樂部點數可以聘用教練。第一位上任免費，之後每個賽季週最多換一次人。"}
          </div>
          {head && (
            <div className="ca__hero-effect">
              <span className="ca__chip ca__chip--gain">{head.capabilityText}</span>
              <span className="ca__chip ca__chip--cost">{head.tradeoffText}</span>
            </div>
          )}
          <div className="ca__hero-rule">
            {head
              ? (view.canChangeCoach
                ? `一次只有一位總教練帶隊。這一週（第 ${view.careerWeek} 週）還可以換一次人。`
                : `一次只有一位總教練帶隊。第 ${view.careerWeek} 週已經換過了，下週才能再換。`)
              : "聘用的教練永久保留，但同時只有一位帶隊——換誰上場才是每週的決定。"}
          </div>
        </div>

        <div className="ca__eyebrow ca-rise" style={{ "--ca-delay": "120ms" }}>
          教練　·　已聘用 {view.ownedCount} / {view.items.length}
        </div>
        {view.items.map((item, i) => (
          <CoachCard key={item.assetId} item={item} view={view}
            onBuy={buy} onEquip={equip}
            flash={flash === item.assetId} delay={150 + i * 60} />
        ))}

        {/*  ── 外觀 ────────────────────────────────────────────────────────
             與教練分區，因為規則不同：外觀不影響任何數值、裝備免費、隨時可換。
             三個槽各自獨立，所以按型別分組列出。 */}
        {IDENTITY_TYPE_LIST.map((type, gi) => {
          const rows = identity.items.filter((it) => it.type === type);
          if (rows.length === 0) return null;
          const equippedId = identity.equipped[rows[0].slot];
          const equippedName = rows.find((r) => r.assetId === equippedId)?.name ?? "預設";
          return (
            <React.Fragment key={type}>
              <div className="ca__eyebrow ca-rise" style={{ "--ca-delay": `${340 + gi * 40}ms` }}>
                {IDENTITY_TYPE_ZH[type]}　·　使用中：{equippedName}
              </div>
              {rows.map((item, i) => (
                <IdentityCard key={item.assetId} item={item}
                  onBuy={buy} onEquip={equipLook} onClear={clearLook}
                  flash={flash === item.assetId} delay={360 + gi * 40 + i * 50} />
              ))}
            </React.Fragment>
          );
        })}

        {/*  ⚠ 這句要寫在畫面上：玩家看到「聘用」會擔心花掉的點數讓等級掉下去。 */}
        <div className="ca__note ca-rise" style={{ "--ca-delay": "330ms" }} data-testid="club-assets-note">
          聘用只花可用點數，不影響累計 {view.clubPointsLifetime} 點——俱樂部聲望看累計，不會因為花錢而下降。
          三位教練專長不同、沒有高低之分，價格只代表開放的先後。教練的效果只在生涯模式生效，不進線上競技。
        </div>
      </div>
    </div>
  );
}
