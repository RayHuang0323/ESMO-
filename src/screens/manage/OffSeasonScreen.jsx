//  screens/manage/OffSeasonScreen.jsx — 休賽期（Season vNext V6-3）
//
//  ── 為什麼現在才有這個畫面 ────────────────────────────────────────────────
//  V5 設計 §6 立過判準：**Off-season 至少要有一個「會影響下一年、且不可逆」的
//  決策；做不到就不要做畫面**。到 V6-2 為止已經有三個：
//    ① 有人宣布最後一年 ⇒ 要不要現在簽接班人
//    ② 有人合約即將到期 ⇒ 續約還是放走
//    ③ 續約要花錢 ⇒ 和補強搶同一份預算
//
//  ⚠ 本畫面**不擁有任何規則**：續約／放走／補強全部呼叫既有的 Store action，
//    估值一律用 V4 的市場價值。這裡只是把散落的決策排在一頁上。
//  ⚠ 視覺沿用既有的 `esmo-*` 語彙（Competition / Team / Recruit 同一套），
//    不另造一套設計系統。
import React, { useMemo, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC } from "../../ui/theme.js";
import EsmoIcon from "../../ui/EsmoIcon.jsx";
import { renewCostOf, contractStatusOf } from "../../platform/progress/contract.js";
import { marketValueOf } from "../../platform/economy/marketValue.js";
//  ⚠ 階段標籤走 UI 既有的那一份（`CAREER_STAGE_LABELS`），不在畫面裡另訂中文。
import { careerStageOf, CAREER_STAGE_LABELS } from "../../ui/playerProfileFoundation.js";
import { genProspects } from "../../data/recruitPool.js";
import "../dashboard/dashboard.css";

const wan = (cash) => `$${Math.round((Number(cash) || 0) / 10000)}萬`;
const POOL_SEED = 7;

function Section({ id, label, title, note, children }) {
  return (
    <section className="esmo-section" data-testid={id}>
      <div className="esmo-section-heading">
        <div>
          <div className="esmo-section-label">{label}</div>
          <h2 className="esmo-section-heading__title">{title}</h2>
        </div>
        {note && <div className="esmo-section-heading__note">{note}</div>}
      </div>
      {children}
    </section>
  );
}

function Row({ children, testid }) {
  return <div className="esmo-card esmo-offseason-row" data-testid={testid}>{children}</div>;
}

export default function OffSeasonScreen({ onBack }) {
  const profile = useProfileStore();
  const view = profile.offSeasonSessionView();
  const offSeason = profile.offSeasonView();
  const [note, setNote] = useState(null);

  const players = profile.players ?? [];
  const funds = Number(profile.finance?.funds) || 0;

  //  ⚠ 補強候選走**既有的新秀池**（`genProspects`），不另生一套選手。
  const prospects = useMemo(
    () => genProspects(POOL_SEED).filter((p) => !profile.recruitment?.signed?.[p.id]).slice(0, 6),
    [profile.recruitment],
  );

  const byId = (id) => players.find((p) => p.id === id);
  const say = (r, ok, fail) => setNote(r?.ok ? ok : (r?.reason ?? fail));

  const doRenew = (id) => say(profile.renewPlayerContract(id), `已完成續約`, "續約失敗");
  const doRelease = (id) => say(profile.releasePlayer(id), `已放走 ${byId(id)?.name ?? id}`, "放走失敗");
  const doSign = (p) => {
    const r = profile.signProspect(p, POOL_SEED);
    say(r, `已簽下 ${p.name}`, r?.reason ?? "簽約失敗");
  };
  const doComplete = () => { profile.completeOffSeason(); onBack?.(); };

  return (
    <div className="esmo-screen esmo-offseason" data-testid="offseason-screen">
      <header className="esmo-section-heading" style={{ padding: "18px 16px 0" }}>
        <div>
          <div className="esmo-section-label">OFF SEASON</div>
          <h1 className="esmo-section-heading__title">第 {view.careerYear ?? offSeason.currentYear} 生涯年度 休賽期</h1>
        </div>
        <button className="esmo-status-card__link" type="button" onClick={onBack}>返回 <EsmoIcon name="chevron" size={13} /></button>
      </header>

      {note && <div className="esmo-card esmo-offseason-note" data-testid="offseason-note" style={{ color: GC.gold }}>{note}</div>}

      {/* ── 年度摘要 ────────────────────────────────────────────────── */}
      <Section id="offseason-summary" label="SUMMARY" title="年度摘要"
        note={offSeason.latest ? `第 ${offSeason.latest.careerYear} 年度已封存` : null}>
        <Row testid="offseason-summary-row">
          <div>名單 <strong>{players.length}</strong> 人</div>
          <div>平均年齡 <strong>{players.length ? (players.reduce((s, p) => s + (Number(p.age) || 0), 0) / players.length).toFixed(1) : "—"}</strong></div>
          <div>待處理決策 <strong data-testid="offseason-pending">{view.total}</strong> 項</div>
        </Row>
      </Section>

      {/* ── 退役 / 最後一年 ─────────────────────────────────────────── */}
      <Section id="offseason-retirement" label="RETIREMENT" title="退役與最後一年"
        note="宣布退役意向的選手不可續約——請及早找接班人">
        {view.intents.length === 0
          ? <Row testid="offseason-retirement-empty">目前沒有人宣布退役意向。</Row>
          : view.intents.map((p) => (
            <Row key={p.id} testid={`offseason-intent-${p.id}`}>
              <div><strong>{p.name}</strong>．{p.age} 歲
                <span style={{ color: GC.gray }}>　{careerStageOf(byId(p.id))?.label ?? ""}</span></div>
              <div style={{ color: GC.gold }}>這是他的最後一年</div>
            </Row>
          ))}
      </Section>

      {/* ── 合約決策 ────────────────────────────────────────────────── */}
      <Section id="offseason-contracts" label="CONTRACTS" title="合約決策"
        note={`可用資金 ${wan(funds)}`}>
        {view.expiring.length === 0
          ? <Row testid="offseason-contracts-empty">目前沒有即將到期的合約。</Row>
          : view.expiring.map((c) => {
            const p = byId(c.id);
            if (!p) return null;
            const cost = renewCostOf(p);
            const afford = cost * 10000 <= funds;
            return (
              <Row key={c.id} testid={`offseason-contract-${c.id}`}>
                <div><strong>{p.name}</strong>．{p.age} 歲　剩 {c.days} 天（{contractStatusOf(p) === "expired" ? "已到期" : "即將到期"}）</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="esmo-status-card__link" type="button" disabled={!afford}
                    data-testid={`offseason-renew-${c.id}`} onClick={() => doRenew(c.id)}>
                    續約 ${cost}萬{afford ? "" : "（資金不足）"}
                  </button>
                  <button className="esmo-status-card__link" type="button" style={{ color: GC.red }}
                    data-testid={`offseason-release-${c.id}`} onClick={() => doRelease(c.id)}>
                    放走（免費）
                  </button>
                </div>
              </Row>
            );
          })}
      </Section>

      {/* ── 補強候選 ────────────────────────────────────────────────── */}
      <Section id="offseason-recruit" label="RECRUIT" title="補強候選"
        note="走既有球探名單；估值為 V4 市場價值">
        {prospects.map((p) => (
          <Row key={p.id} testid={`offseason-prospect-${p.id}`}>
            <div><strong>{p.name}</strong>．{p.age} 歲　{p.role}　潛力 {p.potential}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: GC.gray }}>市場價值 ${marketValueOf(p)}萬</span>
              <button className="esmo-status-card__link" type="button"
                data-testid={`offseason-sign-${p.id}`} onClick={() => doSign(p)}>
                簽約 ${p.cost}萬
              </button>
            </div>
          </Row>
        ))}
      </Section>

      {/* ── 預算變化 ────────────────────────────────────────────────── */}
      <Section id="offseason-budget" label="BUDGET" title="預算變化">
        <Row testid="offseason-budget-row">
          <div>休賽期開始 <strong>{wan(view.fundsAtOpen)}</strong></div>
          <div>目前 <strong data-testid="offseason-funds">{wan(view.fundsNow)}</strong></div>
          <div style={{ color: view.fundsNow - view.fundsAtOpen < 0 ? GC.red : GC.green }}>
            {view.fundsNow - view.fundsAtOpen >= 0 ? "+" : "−"}{wan(Math.abs(view.fundsNow - view.fundsAtOpen))}
          </div>
        </Row>
      </Section>

      {/* ── 完成休賽期 ──────────────────────────────────────────────── */}
      <Section id="offseason-complete" label="DONE" title="完成休賽期"
        note="什麼都不做也可以完成——名單不足時會由青訓補位">
        <Row testid="offseason-complete-row">
          <button className="esmo-status-card__link" type="button" style={{ color: GC.green, fontSize: 12 }}
            data-testid="offseason-complete-btn" onClick={doComplete}>
            完成休賽期，進入下一個生涯年度 <EsmoIcon name="chevron" size={13} />
          </button>
        </Row>
      </Section>
    </div>
  );
}
