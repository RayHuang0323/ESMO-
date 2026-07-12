// ============================================================================
//  screens/manage/FinanceScreen.jsx — 財務儀表板（Sprint21）
//  Legacy 來源：EsportsGame.jsx FinanceModule(line3573) Component 化。
//  Presentation 逐項保留：紫色餘額大卡（三欄指標）/ 總覽・分析・預算三分頁 /
//    RevenueChart（近 7 月折線＋收入面積漸層＋支出虛線）/ 四宮格指標 /
//    近期交易（全部・收入・支出篩選）/ 雙 DonutChart 結構分析 / 預算條（>85% 警示）。
//  Adapter（不造假）：四張表（monthly / incomeBd / expenseBd / transactions /
//    budget）由 Legacy 元件內寫死 → 移進 profileStore.finance 成單一來源；
//    餘額與本週收支改讀 profileStore.finance.funds / weeklyIncome / weeklyCost。
//  ⚠ 賽事獎金等真實金流要等 matchRecorder 回寫財務（尚未接，見交付報告）。
// ============================================================================
import React, { useMemo, useState } from "react";
import { Award, Users, Star, Package, Zap, BarChart2, ArrowUpRight, ArrowDownLeft, TrendingUp } from "lucide-react";
import { useProfileStore } from "../../platform/profileStore.js";
import ManageFrame from "./ManageFrame.jsx";

// Legacy FinanceModule 專用色票（比主幹 GC 更深的紫調，保留 Legacy 視覺階層）
const T = {
  c1: "#1a1720", c2: "#1e1b26",
  border: "rgba(255,255,255,0.07)", b2: "rgba(255,255,255,0.05)", sep: "rgba(39,39,42,0.9)",
  purpL: "#c4b5fd", amber: "#fbbf24", green: "#34d399", red: "#f87171",
  gray: "#71717a", gray2: "#52525b", gray3: "#3f3f46",
};
const card = (e) => ({ borderRadius: 14, border: `1px solid ${T.border}`, background: `linear-gradient(148deg,${T.c2},${T.c1})`, boxShadow: "0 4px 16px rgba(0,0,0,0.4)", ...e });

// 交易類別 → icon（Legacy TX 逐筆帶 Icon；Store 只存 cat，這裡查表還原）
const TX_ICON = { prize: Award, salary: Users, sponsor: Star, equip: Package, stream: Zap, train: BarChart2 };

function RevenueChart({ monthly }) {
  const w = 340, h = 110, pad = { t: 10, r: 12, b: 22, l: 40 };
  const W = w - pad.l - pad.r, H = h - pad.t - pad.b, N = monthly.length;
  if (N < 2) return null;
  const maxV = Math.max(...monthly.map((d) => Math.max(d.income, d.expense)));
  const xS = (i) => pad.l + (i / (N - 1)) * W;
  const yS = (v) => pad.t + H - (v / maxV) * H;
  const incPath = monthly.map((d, i) => `${i === 0 ? "M" : "L"} ${xS(i).toFixed(1)} ${yS(d.income).toFixed(1)}`).join(" ");
  const expPath = monthly.map((d, i) => `${i === 0 ? "M" : "L"} ${xS(i).toFixed(1)} ${yS(d.expense).toFixed(1)}`).join(" ");
  const incArea = [
    `M ${xS(0).toFixed(1)} ${yS(monthly[0].income).toFixed(1)}`,
    ...monthly.slice(1).map((d, i) => `L ${xS(i + 1).toFixed(1)} ${yS(d.income).toFixed(1)}`),
    `L ${xS(N - 1).toFixed(1)} ${(pad.t + H).toFixed(1)} L ${xS(0).toFixed(1)} ${(pad.t + H).toFixed(1)} Z`,
  ].join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible", maxWidth: "100%" }}>
      <defs>
        <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.green} stopOpacity="0.25" />
          <stop offset="100%" stopColor={T.green} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((r, i) => (
        <g key={i}>
          <line x1={pad.l} y1={pad.t + H * r} x2={pad.l + W} y2={pad.t + H * r} stroke="rgba(255,255,255,0.06)" strokeWidth={0.8} strokeDasharray="3,3" />
          <text x={pad.l - 4} y={pad.t + H * r + 3} fill="rgba(255,255,255,0.25)" fontSize={7} textAnchor="end" fontFamily="monospace">{`${((maxV * (1 - r)) / 1000).toFixed(0)}k`}</text>
        </g>
      ))}
      <path d={incArea} fill="url(#gI)" />
      <path d={incPath} fill="none" stroke={T.green} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={expPath} fill="none" stroke={T.red} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4,2" />
      {monthly.map((d, i) => (
        <text key={i} x={xS(i)} y={h - 4} fill="rgba(255,255,255,0.3)" fontSize={7} textAnchor="middle" fontFamily="system-ui">{d.month}</text>
      ))}
      <circle cx={xS(N - 1)} cy={yS(monthly[N - 1].income)} r={4} fill={T.green} stroke="#121113" strokeWidth={1.5} />
    </svg>
  );
}

function DonutChart({ data, label, value }) {
  const sz = 90, cx = 45, cy = 45, r = 34, inner = 19;
  let cum = -90;
  const slices = data.map((d) => {
    const s = cum, deg = (d.pct / 100) * 360;
    cum += deg;
    const rad = Math.PI / 180;
    return { ...d, x1: cx + r * Math.cos(s * rad), y1: cy + r * Math.sin(s * rad), x2: cx + r * Math.cos((s + deg) * rad), y2: cy + r * Math.sin((s + deg) * rad), large: deg > 180 ? 1 : 0 };
  });
  return (
    <svg width={sz} height={sz}>
      {slices.map((s, i) => (
        <path key={i} d={`M ${cx} ${cy} L ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} A ${r} ${r} 0 ${s.large} 1 ${s.x2.toFixed(2)} ${s.y2.toFixed(2)} Z`} fill={s.color} stroke="#121113" strokeWidth={1.5} opacity={0.88} />
      ))}
      <circle cx={cx} cy={cy} r={inner} fill="#1a1720" />
      <text x={cx} y={cy - 3} fill="white" fontSize={10} textAnchor="middle" fontWeight="bold" fontFamily="monospace">{label}</text>
      <text x={cx} y={cy + 9} fill="rgba(255,255,255,0.5)" fontSize={7} textAnchor="middle" fontFamily="system-ui">{value}</text>
    </svg>
  );
}

const TABS = [{ id: "overview", label: "總覽" }, { id: "analysis", label: "分析" }, { id: "budget", label: "預算" }];

export default function FinanceScreen({ onBack }) {
  const fin = useProfileStore((s) => s.finance);
  const [tab, setTab] = useState("overview");
  const [txFilter, setTxFilter] = useState("all");

  const monthly = fin.monthly ?? [];
  const cur = monthly[monthly.length - 1] ?? { income: 0, expense: 0 };
  const prev = monthly[monthly.length - 2] ?? { income: 0, expense: 0 };
  const net = cur.income - cur.expense;
  const prevNet = prev.income - prev.expense;
  const netChg = prevNet !== 0 ? ((net - prevNet) / prevNet * 100).toFixed(1) : "0.0";

  const tx = fin.transactions ?? [];
  const filteredTx = useMemo(() => (txFilter === "all" ? tx : tx.filter((t) => t.type === txFilter)), [txFilter, tx]);
  const incomeBd = fin.incomeBd ?? [], expenseBd = fin.expenseBd ?? [], budget = fin.budget ?? [];
  const k = (n) => `${Math.round(n / 1000)}k`;

  return (
    <ManageFrame title="財務儀表板" subtitle="FINANCE DASHBOARD" onBack={onBack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 餘額大卡 */}
        <div style={{ borderRadius: 20, padding: 16, background: "linear-gradient(145deg,#1a1528,#0f0c18)", border: "1px solid rgba(167,139,250,0.25)", position: "relative", overflow: "hidden" }}>
          <div style={{ color: T.gray2, fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>當前總餘額</div>
          <div style={{ color: "white", fontSize: 32, fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>${(fin.funds ?? 0).toLocaleString()}</div>
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { Icon: ArrowUpRight, val: `$${(fin.weeklyIncome ?? 0).toLocaleString()}`, label: "本週收入", c: T.green },
              { Icon: TrendingUp,   val: `${parseFloat(netChg) >= 0 ? "+" : ""}${netChg}%`, label: "月淨利成長", c: T.purpL },
              { Icon: ArrowDownLeft, val: `$${(fin.weeklyCost ?? 0).toLocaleString()}`, label: "本週支出", c: T.amber },
            ].map(({ Icon, val, label, c }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Icon size={12} style={{ color: c }} />
                <div><div style={{ color: c, fontSize: 12, fontWeight: 800 }}>{val}</div><div style={{ color: T.gray2, fontSize: 8 }}>{label}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* 分頁 */}
        <div style={{ display: "flex", background: T.c1, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", padding: 3 }}>
          {TABS.map((t) => {
            const a = tab === t.id;
            return <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: 7, borderRadius: 7, border: "none", cursor: "pointer", background: a ? T.c2 : "transparent", color: a ? "white" : T.gray3, fontSize: 10.5, fontWeight: 700 }}>{t.label}</button>;
          })}
        </div>

        {tab === "overview" && (
          <>
            <div style={card({ padding: "12px 13px" })}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color: T.gray2, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>近 {monthly.length} 個月收支趨勢</span>
                <div style={{ display: "flex", gap: 10, fontSize: 8.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 10, height: 2, background: T.green, borderRadius: 99 }} /><span style={{ color: T.gray }}>收入</span></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 10, height: 2, background: T.red, borderRadius: 99 }} /><span style={{ color: T.gray }}>支出</span></span>
                </div>
              </div>
              <RevenueChart monthly={monthly} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "本月收入", val: `$${cur.income.toLocaleString()}`, Icon: ArrowUpRight, c: T.green },
                { label: "本月支出", val: `$${cur.expense.toLocaleString()}`, Icon: ArrowDownLeft, c: T.red },
                { label: "本月淨利", val: `$${net.toLocaleString()}`, Icon: TrendingUp, c: T.purpL },
                { label: "較上月", val: `${parseFloat(netChg) >= 0 ? "+" : ""}${netChg}%`, Icon: BarChart2, c: parseFloat(netChg) >= 0 ? T.green : T.red },
              ].map(({ label, val, Icon, c }) => (
                <div key={label} style={card({ padding: "11px 12px" })}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}><Icon size={12} style={{ color: c }} /><span style={{ color: T.gray2, fontSize: 9 }}>{label}</span></div>
                  <div style={{ color: c, fontSize: 17, fontWeight: 900, fontFamily: "monospace" }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={card({ padding: 0, overflow: "hidden" })}>
              <div style={{ padding: "9px 13px 7px", borderBottom: `1px solid ${T.sep}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: T.gray2, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>近期交易</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {["all", "income", "expense"].map((f) => {
                    const a = txFilter === f;
                    const c = f === "income" ? T.green : f === "expense" ? T.red : T.gray;
                    return <button key={f} onClick={() => setTxFilter(f)} style={{ padding: "2px 7px", borderRadius: 99, border: `1px solid ${a ? c : T.border}`, background: a ? `${c}12` : T.c1, color: a ? c : T.gray3, fontSize: 8.5, fontWeight: 700, cursor: "pointer" }}>{f === "all" ? "全部" : f === "income" ? "收入" : "支出"}</button>;
                  })}
                </div>
              </div>
              {filteredTx.map((t, i) => {
                const Icon = TX_ICON[t.cat] ?? BarChart2;
                const isIn = t.amount > 0;
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 13px", borderBottom: i < filteredTx.length - 1 ? `1px solid ${T.b2}` : "none" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${t.color}12`, border: `1px solid ${t.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={12} style={{ color: t.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "white", fontSize: 10.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
                      <div style={{ color: T.gray2, fontSize: 8.5, marginTop: 1 }}>{t.date}</div>
                    </div>
                    <span style={{ color: isIn ? T.green : T.red, fontSize: 12, fontWeight: 800, fontFamily: "monospace", flexShrink: 0 }}>{isIn ? "+" : ""}{t.amount.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "analysis" && (
          <div style={card({ padding: "12px 13px" })}>
            <div style={{ color: T.gray2, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>收入 vs 支出結構</div>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: T.green, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>收入來源</div>
                <DonutChart data={incomeBd} label={k(cur.income)} value="本月收入" />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: T.red, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>支出分布</div>
                <DonutChart data={expenseBd} label={k(cur.expense)} value="本月支出" />
              </div>
            </div>
            {[{ title: "收入結構", data: incomeBd }, { title: "支出結構", data: expenseBd }].map(({ title, data }) => (
              <div key={title} style={{ marginBottom: 12 }}>
                <div style={{ color: T.gray2, fontSize: 9, fontWeight: 600, marginBottom: 6 }}>{title}</div>
                {data.map(({ label, value, color, pct }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ color: T.gray, fontSize: 9.5, flex: 1 }}>{label}</span>
                    <div style={{ width: 70, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: color }} /></div>
                    <span style={{ color: "white", fontSize: 9.5, fontWeight: 700, fontFamily: "monospace", width: 36, textAlign: "right" }}>${(value / 1000).toFixed(0)}k</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === "budget" && (
          <div style={card({ padding: "12px 13px" })}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: T.gray2, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>月度預算規劃</span>
              <span style={{ color: T.purpL, fontSize: 9, fontWeight: 700 }}>{cur.month ?? ""}</span>
            </div>
            {budget.map(({ label, budgeted, spent, color }) => {
              const pct = budgeted > 0 ? (spent / budgeted) * 100 : 0;
              const over = pct > 85;
              const rem = budgeted - spent;
              return (
                <div key={label} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${T.b2}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <span style={{ color: "white", fontSize: 10, fontWeight: 700 }}>{label}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ color: over ? T.red : T.gray, fontSize: 9 }}>${spent.toLocaleString()}</span>
                      <span style={{ color: T.gray3, fontSize: 9 }}> / ${budgeted.toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 3 }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: 99, background: over ? T.red : color }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: over ? T.red : T.gray2, fontSize: 8 }}>{pct.toFixed(0)}%{over ? " ⚠ 接近上限" : ""}</span>
                    <span style={{ color: rem >= 0 ? T.green : T.red, fontSize: 8, fontWeight: 600 }}>{rem >= 0 ? `剩餘 $${rem.toLocaleString()}` : `超支 $${Math.abs(rem).toLocaleString()}`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ManageFrame>
  );
}
