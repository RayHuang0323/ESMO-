// ============================================================================
//  debug/ItemsUiGallery/ItemsUiGallery.jsx — 裝備 UI 視覺樣張（Item System M3a，DEV only）
//
//  入口：`npm run dev` 後開 `?debug=items-ui`（main.jsx 以 import.meta.env.DEV 把關，正式 build 不存在）。
//  用途：Owner Review 外觀用。不是正式玩家畫面。
//  資料：頁內跑一顆 headless 引擎（seed 7，照正式配置＋configureItems，推進 12 模擬分鐘），
//        所有金錢、背包、下一件、理由、購買事件都讀這份**真實 snapshot**；
//        只有「元件狀態目錄」會刻意把同一件真實裝備畫成各種狀態（區塊內標明）。
//  規格：docs/design/MOBA_裝備UI_M3規格_v1.md §8。
// ============================================================================
import React, { useEffect, useMemo, useState } from "react";
import { LogicEngine } from "../../LogicEngine.js";
import { CHAMPIONS_100, heroById } from "../../data/heroDatabase.js";
import { toEngineHeroMods } from "../../battle/moba/mobaHeroProfile.js";
import { toEngineArchetypes } from "../../data/heroCombatArchetypes.js";
import { buildLoadout, toEngineSpells } from "../../battle/moba/mobaHeroLoadout.js";
import { toEngineTactic, STANDARD_OPP_TACTIC } from "../../platform/contracts/MobaTacticConfig.js";
import { toEngineItems } from "../../battle/moba/items/itemsEngineAdapter.js";
import { ITEM_IDS, getItem } from "../../battle/moba/items/itemCatalog.js";
import { selectPlayerItemsView, selectPurchaseFeed } from "../../battle/moba/items/itemsViewModel.js";
import { coachNotes, itemVisual, previewStrategy, selectHudItems } from "../../battle/moba/items/itemsUiSelectors.js";
import { useIsMobile } from "../../ui/useViewport.js";
import { ItemSlot, InventoryBar } from "../../battle/ui/items/ItemSlot.jsx";
import { GoldChip } from "../../battle/ui/items/GoldChip.jsx";
import { PurchaseToast } from "../../battle/ui/items/PurchaseToast.jsx";
import { NextItemCard } from "../../battle/ui/items/NextItemCard.jsx";
import { BuildPathTrack } from "../../battle/ui/items/BuildPathTrack.jsx";
import { CoachNote } from "../../battle/ui/items/CoachNote.jsx";
import { BuildStrategyCards } from "../../battle/ui/items/BuildStrategyCards.jsx";
import { HeroItemDetail } from "../../battle/ui/items/HeroItemDetail.jsx";
import { GOLD, ITEM_FONT, NUM, SIDE_TINT, SURFACE, TEXT, alpha, cornerCut } from "../../battle/ui/items/itemsTheme.js";

const SEATS = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
const COMP = { b: ["坦克", "刺客", "法師", "射手", "輔助"], r: ["戰士", "戰士", "法師", "射手", "坦克"] };
const FIXTURE_SEED = 7;
const FIXTURE_TICKS = 1440;   // 0.5 模擬秒 × 1440 = 第 12 分鐘
const DETAIL_SEAT = "b4";

function fixedRoster() {
  const used = new Set(), roster = {};
  for (const seat of SEATS) {
    const hero = CHAMPIONS_100.find((h) => h.arch === COMP[seat[0]][Number(seat[1]) - 1] && !used.has(h.id));
    used.add(hero.id);
    roster[seat] = { heroId: hero.id };
  }
  for (const [seat, e] of Object.entries(buildLoadout(roster, heroById))) roster[seat].spells = e.spells;
  return roster;
}

/** 真實對局：照正式 configure 順序，並把整場購買事件依 seq 收齊（snapshot 只保留最近 40 筆）。 */
function runFixture() {
  const roster = fixedRoster();
  const e = new LogicEngine(FIXTURE_SEED);
  e.configureHeroes(toEngineHeroMods(roster, heroById));
  const blue = {}, red = {};
  for (const [pid, m] of Object.entries(toEngineArchetypes(roster))) (pid[0] === "r" ? red : blue)[pid] = m;
  e.configureArchetypes({ blue, red, meta: null });
  e.configureSpells(toEngineSpells(roster));
  e.configureMatch({ blue: toEngineTactic(STANDARD_OPP_TACTIC), red: toEngineTactic(STANDARD_OPP_TACTIC), meta: null });
  e.configureItems(toEngineItems({ roster, heroLookup: heroById }));
  const events = new Map();
  const collect = () => { for (const ev of e.snapshot().items.purchases) events.set(ev.seq, ev); };
  collect();
  for (let i = 0; i < FIXTURE_TICKS && !e.over; i++) {
    e.tick(0.5);
    if (i % 10 === 0) collect();
  }
  collect();
  const snapshot = e.snapshot();
  return { roster, snapshot, events: [...events.values()].sort((a, b) => a.seq - b.seq), minute: Math.round(e.t / 60) };
}

const heroName = (roster, seat) => heroById(roster[seat]?.heroId)?.zh ?? seat;

/**
 * bleed：手機上讓內容貼齊螢幕左右（抵銷頁面內距 12px），用來展示真實 bottom sheet 的寬度——
 * 否則樣張外框會吃掉 50px 以上，量到的是「樣張頁」的尺寸而不是元件在手機上的尺寸。
 */
function Section({ id, title, note, wide = false, bleed = false, children }) {
  return (
    <section data-gallery-section={id} style={{
      gridColumn: wide ? "1 / -1" : "auto", minWidth: 0, boxSizing: "border-box",
      padding: bleed ? "16px 0 18px" : "16px 16px 18px",
      margin: bleed ? "0 -12px" : 0,
      background: alpha(SURFACE.panel, 0.92), clipPath: bleed ? "none" : cornerCut(16),
      boxShadow: bleed ? "none" : `inset 0 0 0 1px ${SURFACE.line}`,
    }}>
      <div style={{ padding: bleed ? "0 16px" : 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: TEXT.primary }}>{title}</h2>
        {note && <p style={{ margin: "4px 0 14px", fontSize: 12.5, lineHeight: 1.5, color: TEXT.secondary }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

const Caption = ({ children }) => (
  <span style={{ display: "block", marginTop: 5, fontSize: 11, color: TEXT.secondary, textAlign: "center", lineHeight: 1.3, maxWidth: 72 }}>{children}</span>
);

function Swatch({ itemId, label, ...slot }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
      <ItemSlot itemId={itemId} size="md" {...slot} />
      <Caption>{label ?? itemVisual(itemId)?.name ?? "空格"}</Caption>
    </div>
  );
}

const Row = ({ children, gap = 14 }) => <div style={{ display: "flex", flexWrap: "wrap", gap, alignItems: "flex-start" }}>{children}</div>;
const SubTitle = ({ children }) => <div style={{ margin: "14px 0 8px", fontSize: 12, fontWeight: 800, color: TEXT.secondary }}>{children}</div>;

export default function ItemsUiGallery() {
  const isMobile = useIsMobile();
  const [fixture, setFixture] = useState(null);
  const [strategy, setStrategy] = useState("standard");
  const [toastKey, setToastKey] = useState(0);
  const [acquire, setAcquire] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setFixture(runFixture()), 30);
    return () => clearTimeout(id);
  }, []);

  const data = useMemo(() => {
    if (!fixture) return null;
    const { snapshot, events, roster } = fixture;
    const hud = selectHudItems(snapshot);
    const views = Object.fromEntries(SEATS.map((s) => [s, selectPlayerItemsView(snapshot, s)]));
    const feed = selectPurchaseFeed({ items: { purchases: events } }, { limit: events.length });
    const latest = (pred) => feed.find((ev) => ev.action !== "dropStarter" && pred(itemVisual(ev.itemId)));
    const toasts = [
      latest((v) => v?.state === "completed"),
      latest((v) => v?.state === "boots" && v.tier === "BOOTS" && v.itemId !== "bt_base"),
      latest((v) => v?.state === "component"),
    ].filter(Boolean);
    const me = snapshot.items.players[DETAIL_SEAT];
    const enemies = SEATS.filter((s) => snapshot.items.players[s].side !== me.side)
      .map((s) => ({ arch: snapshot.items.players[s].arch, healer: false, items: snapshot.items.players[s].inventory.filter(Boolean) }));
    const previews = Object.fromEntries(["standard", "early", "scaling", "counter", "survival"]
      .map((id) => [id, previewStrategy({ arch: me.arch, seatRole: me.seatRole, strategy: id, enemies })]));
    const examples = {
      t3: "ABCDEFGH".split("").map((f) => ITEM_IDS.find((id) => getItem(id).tier === "T3" && getItem(id).family === f && getItem(id).batch === "1.0")).filter(Boolean),
      components: [...new Map(ITEM_IDS.filter((id) => ["T1", "T2"].includes(getItem(id).tier)).map((id) => [itemVisual(id).glyph, id])).values()],
      boots: ITEM_IDS.filter((id) => getItem(id).tier === "BOOTS"),
      starters: ITEM_IDS.filter((id) => getItem(id).tier === "STARTER"),
    };
    const noteSeats = SEATS.filter((s) => coachNotes(views[s]).length).slice(0, 3);
    return { snapshot, roster, hud, views, toasts, previews, examples, noteSeats };
  }, [fixture]);

  const page = {
    minHeight: "100vh", boxSizing: "border-box", fontFamily: ITEM_FONT, color: TEXT.primary,
    background: `radial-gradient(1200px 520px at 20% -10%, ${alpha(GOLD, 0.08)}, transparent 60%), ${SURFACE.base}`,
    padding: isMobile ? "16px 12px 40px" : "28px 28px 56px",
  };

  if (!data) {
    return <main style={page}><p style={{ color: TEXT.secondary }}>正在產生真實對局樣張…</p></main>;
  }

  const { snapshot, roster, hud, views, toasts, previews, examples, noteSeats } = data;
  const detail = views[DETAIL_SEAT];
  const t3 = examples.t3[0];

  return (
    <main data-gallery-ready="1" style={page}>
      <header style={{ maxWidth: 1180, margin: "0 auto 20px" }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 800 }}>裝備 UI 視覺樣張</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT.secondary, lineHeight: 1.5 }}>
          M3a 外觀審查用（僅開發模式）。資料來自真實對局：seed {FIXTURE_SEED}，第 {fixture.minute} 分鐘。
        </p>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 14, gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))" }}>
        <Section id="icons" wide title="裝備圖示" note="外框材質＝階級（鐵、鋼、金、青、銅），插槽底色＝流派。完成裝各流派一件，組件依主屬性。">
          <SubTitle>完成裝（八個流派）</SubTitle>
          <Row>{examples.t3.map((id) => <Swatch key={id} itemId={id} />)}</Row>
          <SubTitle>組件（依主屬性）</SubTitle>
          <Row>{examples.components.map((id) => <Swatch key={id} itemId={id} />)}</Row>
          <SubTitle>鞋子與起始裝</SubTitle>
          <Row>{[...examples.boots, ...examples.starters].map((id) => <Swatch key={id} itemId={id} />)}</Row>
        </Section>

        <Section id="slots" wide title="插槽與 6 格背包" note="上排是狀態目錄（同一件真實裝備畫成各種狀態）；下排是第 12 分鐘十名英雄的真實背包。">
          <SubTitle>狀態目錄</SubTitle>
          <Row>
            <Swatch itemId={null} label="空格" />
            <Swatch itemId="st_blade" />
            <Swatch itemId="t2_gale" />
            <Swatch itemId="bt_swift" />
            <Swatch itemId={t3} />
            <Swatch itemId={t3} highlight="next" label="下一件" />
            <Swatch itemId={t3} selected label="選中" />
            <Swatch itemId="t2_scope" owned label="已擁有" />
            <Swatch itemId="t2_scope" dim label="尚未取得" />
          </Row>
          <SubTitle>尺寸（HUD 20／面板 30／卡片 40／手機詳情 48）</SubTitle>
          <Row gap={18}>
            {["xs", "sm", "md", "lg"].map((s) => <ItemSlot key={s} itemId={t3} size={s} />)}
          </Row>
          <SubTitle>十人背包（HUD 精簡列）</SubTitle>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))" }}>
            {SEATS.map((s) => (
              <div key={s} style={{ display: "grid", gridTemplateColumns: "76px auto minmax(0, 1fr)", alignItems: "center", gap: 10, padding: "6px 10px", background: SURFACE.raised, clipPath: cornerCut(8) }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: SIDE_TINT[hud[s].side], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{heroName(roster, s)}</span>
                <InventoryBar slots={hud[s].slots} size="xs" ariaLabel={`${heroName(roster, s)}的裝備`} />
                <span style={{ justifySelf: "end" }}><GoldChip amount={hud[s].unspent} /></span>
              </div>
            ))}
          </div>
          <SubTitle>獲得新裝的回饋（點按鈕重播）</SubTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <InventoryBar slots={detail.slots} size="md" acquireKeys={acquire ? { [acquire.index]: acquire.key } : null} />
            <button type="button" data-touch onClick={() => setAcquire((a) => ({ index: Math.max(0, detail.slots.findIndex((x) => x.tier === "T3")), key: (a?.key ?? 0) + 1 }))}
              style={{ minHeight: 44, padding: "0 16px", border: 0, cursor: "pointer", fontFamily: ITEM_FONT, fontWeight: 800, fontSize: 13, color: TEXT.primary, background: SURFACE.raised, boxShadow: `inset 0 0 0 1px ${SURFACE.line2}`, clipPath: cornerCut(8) }}>
              重播獲得動畫
            </button>
          </div>
        </Section>

        <Section id="gold" title="金錢籌碼" note="HUD 用小尺寸，英雄詳情用大尺寸。數字直接讀帳本的可用金錢。">
          <Row gap={12}>
            <GoldChip amount={hud[DETAIL_SEAT].unspent} />
            <GoldChip amount={hud[DETAIL_SEAT].unspent} size="lg" />
            <GoldChip amount={Math.round(snapshot.bGold)} size="lg" label="藍隊總金錢" />
          </Row>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: TEXT.faint }}>
            {heroName(roster, DETAIL_SEAT)}可用金錢　｜　藍隊總金錢 <span style={NUM}>{Math.round(snapshot.bGold).toLocaleString("en-US")}</span>
          </p>
        </Section>

        <Section id="toast" title="購買通知" note="戰鬥中只為完成裝與鞋子升級跳出（組件購買只示範外觀）。不擋點擊，系統開啟減少動態時直接顯示。">
          <div style={{ display: "grid", gap: 10 }}>
            {toasts.map((ev) => (
              <PurchaseToast key={`${ev.seq}-${toastKey}`} event={ev} heroName={heroName(roster, ev.playerId)} side={snapshot.items.players[ev.playerId].side} replayKey={toastKey} />
            ))}
          </div>
          <button type="button" data-touch onClick={() => setToastKey((k) => k + 1)}
            style={{ marginTop: 12, minHeight: 44, padding: "0 16px", border: 0, cursor: "pointer", fontFamily: ITEM_FONT, fontWeight: 800, fontSize: 13, color: TEXT.primary, background: SURFACE.raised, boxShadow: `inset 0 0 0 1px ${SURFACE.line2}`, clipPath: cornerCut(8) }}>
            重播通知動畫
          </button>
        </Section>

        <Section id="next-item" title="下一件" note="差價與進度來自出裝計畫；買得起時顯示「回城就能合成」，因為只有回城、復活或走進泉水才會購買。">
          <NextItemCard nextItem={detail.nextItem} hud={hud[DETAIL_SEAT]} buildComplete={detail.buildComplete} />
          <SubTitle>狀態樣張：六件出裝完成</SubTitle>
          <NextItemCard nextItem={null} buildComplete />
        </Section>

        <Section id="build-path" title="出裝路徑" note="連線代表購買順序：金勾＝已擁有，金色虛框＝下一件，半透明＝之後。">
          <SubTitle>{heroName(roster, DETAIL_SEAT)}（{detail.arch}）</SubTitle>
          <BuildPathTrack buildPath={detail.buildPath} />
          <SubTitle>{heroName(roster, "r5")}（{views.r5.arch}）</SubTitle>
          <BuildPathTrack buildPath={views.r5.buildPath} />
        </Section>

        <Section id="coach-note" title="AI 教練筆記" note="每人最多兩句，只說現在在做什麼、為什麼改路線。">
          <div style={{ display: "grid", gap: 10 }}>
            {noteSeats.map((s) => (
              <div key={s}>
                <div style={{ fontSize: 12, fontWeight: 800, color: SIDE_TINT[views[s].side], marginBottom: 6 }}>{heroName(roster, s)}</div>
                <CoachNote notes={coachNotes(views[s])} />
              </div>
            ))}
          </div>
        </Section>

        <Section id="strategy-cards" wide title="出裝策略戰術卡" note={`賽前選一張，全隊套用。卡片下方是${heroName(roster, DETAIL_SEAT)}（${detail.arch}）在這套策略下的前三件核心，直接由出裝規則算出。`}>
          <BuildStrategyCards selected={strategy} onSelect={setStrategy} previews={previews} />
        </Section>

        <Section id="hero-detail" wide bleed={isMobile} title="英雄裝備詳情" note="第一層只放背包、可用金、下一件與教練筆記；完整路徑與屬性收在「看完整出裝」。">
          {isMobile ? (
            <div style={{ display: "grid", gap: 16 }}>
              <HeroItemDetail layout="sheet" view={detail} hud={hud[DETAIL_SEAT]} notes={coachNotes(detail)}
                heroId={roster[DETAIL_SEAT].heroId} heroName={heroName(roster, DETAIL_SEAT)} expanded={sheetOpen} onToggle={() => setSheetOpen((v) => !v)} />
              <HeroItemDetail layout="sheet" view={detail} hud={hud[DETAIL_SEAT]} notes={coachNotes(detail)}
                heroId={roster[DETAIL_SEAT].heroId} heroName={heroName(roster, DETAIL_SEAT)} expanded onToggle={() => {}} />
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
              <div>
                <SubTitle>桌機面板（收合）</SubTitle>
                <HeroItemDetail layout="panel" view={detail} hud={hud[DETAIL_SEAT]} notes={coachNotes(detail)}
                  heroId={roster[DETAIL_SEAT].heroId} heroName={heroName(roster, DETAIL_SEAT)} expanded={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
              </div>
              <div>
                <SubTitle>桌機面板（展開）</SubTitle>
                <HeroItemDetail layout="panel" view={detail} hud={hud[DETAIL_SEAT]} notes={coachNotes(detail)}
                  heroId={roster[DETAIL_SEAT].heroId} heroName={heroName(roster, DETAIL_SEAT)} expanded onToggle={() => {}} />
              </div>
              <div style={{ width: 390, maxWidth: "100%" }}>
                <SubTitle>手機 bottom sheet（390 寬）</SubTitle>
                <div style={{ padding: "40px 0 0", background: `linear-gradient(180deg, ${alpha(SURFACE.raised, 0.4)}, ${SURFACE.base})`, clipPath: cornerCut(14) }}>
                  <HeroItemDetail layout="sheet" view={detail} hud={hud[DETAIL_SEAT]} notes={coachNotes(detail)}
                    heroId={roster[DETAIL_SEAT].heroId} heroName={heroName(roster, DETAIL_SEAT)} expanded={sheetOpen} onToggle={() => setSheetOpen((v) => !v)} />
                </div>
              </div>
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}
