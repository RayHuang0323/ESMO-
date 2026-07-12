// ============================================================================
//  screens/manage/InboxScreen.jsx — 收件匣（Sprint21）
//  Legacy 來源：EsportsGame.jsx NotifyModule(line5978) Component 化。
//  Presentation 逐項保留：全部已讀鈕 / 類型篩選膠囊 / 左側彩色邊條 /
//    未讀圓點 / 類型 badge / 時間 / 「前往 XX」CTA / 空狀態 📭。
//  Adapter：通知來自 profileStore.inbox（唯一來源）；已讀狀態寫回 Store
//    （Legacy 只存在元件 state，重進頁面就重置 → 這裡升級為持久化）。
//  導覽：CTA 透過 onNav(target) 交還 AppShell，模組本身不持有 Router。
// ============================================================================
import React, { useState } from "react";
import { Bell, ArrowLeftRight, FileText, Users, Trophy, DollarSign, ChevronRight } from "lucide-react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC } from "../../ui/theme.js";
import ManageFrame from "./ManageFrame.jsx";

// Legacy TYPE_CFG 逐字（icon / 顏色 / 跳轉目標 / CTA 文案）
const TYPE_CFG = {
  transfer: { Icon: ArrowLeftRight, c: "#fb923c",  label: "轉會", nav: "recruit", cta: "前往轉會市場" },
  contract: { Icon: FileText,       c: GC.green,   label: "合約", nav: "recruit", cta: "查看選手名單" },
  recruit:  { Icon: Users,          c: GC.purp,    label: "招募", nav: "roster",  cta: "查看選手名單" },
  match:    { Icon: Trophy,         c: GC.gold,    label: "賽事", nav: "season",  cta: "前往賽事" },
  sponsor:  { Icon: DollarSign,     c: GC.blue,    label: "贊助", nav: "sponsor", cta: "查看贊助" },
};

export default function InboxScreen({ onBack, onNav }) {
  const inbox = useProfileStore((s) => s.inbox) ?? [];
  const markRead = useProfileStore((s) => s.markRead);
  const markAllRead = useProfileStore((s) => s.markAllRead);
  const [filter, setFilter] = useState("all");

  const unreadCount = inbox.filter((n) => n.unread).length;
  const types = [...new Set(inbox.map((n) => n.type))];
  const filtered = filter === "all" ? inbox : inbox.filter((n) => n.type === filter);

  return (
    <ManageFrame
      title="收件匣" subtitle="INBOX" onBack={onBack}
      right={unreadCount > 0 && (
        <button onClick={markAllRead} style={{ background: "rgba(167,139,250,0.15)", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: GC.purp, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>全部已讀</button>
      )}
    >
      <div style={{ color: GC.gray, fontSize: 10, marginBottom: 12 }}>
        {inbox.length} 則通知{unreadCount > 0 ? ` · ${unreadCount} 則未讀` : ""} · 點擊跳轉對應頁面
      </div>

      {/* 類型篩選 */}
      {types.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto" }}>
          <button onClick={() => setFilter("all")} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", background: filter === "all" ? GC.purp : "rgba(255,255,255,0.06)", color: filter === "all" ? "#fff" : GC.gray, fontSize: 10, fontWeight: 700 }}>全部</button>
          {types.map((t) => {
            const cfg = TYPE_CFG[t];
            if (!cfg) return null;
            return (
              <button key={t} onClick={() => setFilter(t)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", background: filter === t ? cfg.c : "rgba(255,255,255,0.06)", color: filter === t ? "#fff" : GC.gray, fontSize: 10, fontWeight: 700 }}>{cfg.label}</button>
            );
          })}
        </div>
      )}

      {/* 通知列表 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: GC.gray, fontSize: 12, padding: "60px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          {inbox.length === 0 ? "目前沒有通知" : "此類別沒有通知"}<br />
          <span style={{ fontSize: 10 }}>簽約、比賽、轉會、贊助等事件會出現在這裡</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((n) => {
            const cfg = TYPE_CFG[n.type] || { Icon: Bell, c: GC.gray, label: "通知", nav: null, cta: null };
            const { Icon } = cfg;
            const isRead = !n.unread;
            return (
              <div key={n.id} onClick={() => markRead(n.id)} style={{ background: isRead ? "rgba(255,255,255,0.02)" : GC.card, borderRadius: 12, padding: "12px 14px", borderLeft: `3px solid ${isRead ? "rgba(255,255,255,0.1)" : cfg.c}`, opacity: isRead ? 0.6 : 1, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${cfg.c}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={17} style={{ color: cfg.c }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ background: `${cfg.c}22`, color: cfg.c, fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>{cfg.label}</span>
                      {!isRead && <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.c }} />}
                      <span style={{ color: GC.gray, fontSize: 8, marginLeft: "auto" }}>{n.time}</span>
                    </div>
                    {n.subject && <div style={{ color: isRead ? GC.gray : "#e4e4e7", fontSize: 11.5, fontWeight: 800, marginBottom: 2 }}>{n.subject}</div>}
                    <div style={{ color: isRead ? GC.gray : "#a1a1aa", fontSize: 10.5, lineHeight: 1.5 }}>{n.text}</div>
                    <div style={{ color: GC.gray, fontSize: 8.5, marginTop: 3 }}>{n.from}</div>
                    {cfg.nav && onNav && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markRead(n.id); onNav(cfg.nav); }}
                        style={{ marginTop: 8, background: `${cfg.c}1a`, border: `1px solid ${cfg.c}44`, borderRadius: 7, padding: "5px 12px", cursor: "pointer", color: cfg.c, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {cfg.cta}<ChevronRight size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ManageFrame>
  );
}
