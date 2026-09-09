// ============================================================================
//  ui/Disclosure.jsx — 漸進式說明（UI Clarity & Game Feel Pass v1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  新功能上線時，說明文字會一段一段長在主畫面上。每一段單看都合理，
//  加起來就變成「一頁要先讀完才能玩」——像官方說明頁，不像遊戲。
//
//  ⇒ 資訊分三層，這個檔提供第二、三層的容器：
//      第一層 主畫面常駐：玩家**當下要做決策**才需要的東西（狀態／數值／CTA）
//      第二層 `<InfoHint>`：某個欄位的補充，點一下才看
//      第三層 `<HelpPanel>`：完整規則，統一一個入口，不散落在每張卡上
//
//  ── 三條紅線 ─────────────────────────────────────────────────────────────
//  ① **重要資訊不得只靠 hover。** 手機沒有 hover。本檔一律以 click/tap 開關，
//     hover 只是桌機的額外提示，不是取得資訊的唯一路徑。
//  ② **手機不是桌機縮小。** 桌機開 popover（貼著觸發點），手機開 bottom sheet
//     （從下方滑上來、吃得到 safe-area）。同一個 API，兩種呈現。
//  ③ **不新增 UI framework。** 只用 React ＋ 既有的 lucide icon ＋ 既有的
//     GSAP 慣例（`gsap.matchMedia()` 處理 `prefers-reduced-motion`）。
//
//  純呈現層：不碰 Store、不碰引擎、不影響任何模擬或數值。
// ============================================================================
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GC, FONT } from "./theme.js";
import { EsmoIcon } from "./EsmoIcon.jsx";
import { useIsMobile } from "./useViewport.js";
import "./disclosure.css";

/** 觸控目標下限。⚠ 桌機也用同一個值——滑鼠使用者不會因為好按而受害。 */
const HIT = 44;

/**
 * 關掉一個浮層的方式：Esc、點外面。
 *
 * ⚠ **刻意不做「捲動即關閉」。** 初版做了，結果有兩個問題：
 *   ① 觸發點自己的 `scrollIntoView` 會在浮層開啟之後才把捲動事件送到 window，
 *      浮層等於一開就被自己關掉（瀏覽器 gate 抓到的）。
 *   ② 對真實使用者也是壞的——手指稍微滑一下說明就消失了。
 *   ⇒ 改成讓 popover **跟著觸發點重新定位**（見 `Popover`），不關閉。
 */
function useDismiss(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e) => { if (!e.target.closest?.("[data-disclosure-surface]")) onClose(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, onClose]);
}

/**
 * 桌機：貼著觸發點開的小面板。
 *
 * ⚠ 會自己閃避視窗邊界（放不下就翻到上面），不會被切掉。
 * ⚠ 收到的是觸發點的 **ref** 而不是一次性的 rect：捲動或改變視窗大小時
 *   要跟著移動。用 rect 快照的話，捲一下就會飄到別的地方。
 */
function Popover({ anchorRef, title, onClose, children, testid }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useEffect(() => {
    const place = () => {
      const el = ref.current;
      const anchor = anchorRef?.current;
      if (!el || !anchor) return;
      const a = anchor.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const pad = 10;
      let left = a.left + a.width / 2 - r.width / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - r.width - pad));
      //  預設開在下面；下面放不下就翻到上面。
      let top = a.bottom + 8;
      if (top + r.height > window.innerHeight - pad) top = Math.max(pad, a.top - r.height - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      className="esmo-pop"
      data-disclosure-surface=""
      data-testid={testid}
      ref={ref}
      role="dialog"
      aria-label={title}
      style={{ left: pos.left, top: pos.top, fontFamily: FONT }}
    >
      <div className="esmo-pop__head">
        <span className="esmo-pop__title">{title}</span>
        <button type="button" className="esmo-pop__x" onClick={onClose} aria-label="關閉說明">
          <EsmoIcon name="close" size={14} />
        </button>
      </div>
      <div className="esmo-pop__body">{children}</div>
    </div>,
    document.body,
  );
}

/** 手機：從下面滑上來的面板。⚠ 吃 safe-area，不壓到 home indicator。 */
function Sheet({ title, onClose, children, testid }) {
  return createPortal(
    <div className="esmo-sheet-root" data-testid={testid}>
      <div className="esmo-sheet-scrim" />
      <div className="esmo-sheet" data-disclosure-surface="" role="dialog" aria-label={title} style={{ fontFamily: FONT }}>
        <div className="esmo-sheet__grip" aria-hidden="true" />
        <div className="esmo-sheet__head">
          <span className="esmo-sheet__title">{title}</span>
          <button type="button" className="esmo-sheet__x" onClick={onClose} aria-label="關閉說明">
            <EsmoIcon name="close" size={16} />
          </button>
        </div>
        <div className="esmo-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 第二／三層說明的觸發點。
 *
 * @param {object}  p
 * @param {string}  p.title    面板標題（也是無障礙名稱）
 * @param {"info"|"help"} [p.icon]  info = 欄位補充；help = 完整規則
 * @param {string}  [p.text]   觸發點旁邊要不要顯示文字（例如「挑戰規則」）
 * @param {node}    p.children 面板內容
 *
 * ⚠ 桌機 popover / 手機 bottom sheet 由 `useIsMobile()` 決定，
 *   呼叫端不必也不應該自己判斷裝置。
 */
export function InfoHint({ title, icon = "info", text = null, children, testid = null, tone = GC.gray }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const mobile = useIsMobile();
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    //  ⚠ 焦點要回到觸發點，否則鍵盤使用者關掉之後會掉到頁面最上面。
    btnRef.current?.focus?.();
  }, []);
  useDismiss(open, close);

  const toggle = () => setOpen((v) => !v);

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        data-testid={testid}
        className="esmo-hint"
        style={{ color: tone, minHeight: HIT, minWidth: text ? undefined : HIT }}
      >
        <EsmoIcon name={icon} size={14} />
        {text ? <span className="esmo-hint__text">{text}</span> : null}
      </button>
      {open && (mobile
        ? <Sheet title={title} onClose={close} testid={testid ? `${testid}-panel` : undefined}>{children}</Sheet>
        : <Popover anchorRef={btnRef} title={title} onClose={close} testid={testid ? `${testid}-panel` : undefined}>{children}</Popover>)}
    </>
  );
}

/**
 * 就地展開的細節區塊（不浮起來，適合「這張卡的完整資料」）。
 *
 * ⚠ 用 `<details>` 語意會比較省事，但它的展開動畫在各家瀏覽器不一致，
 *   而且沒辦法在 `prefers-reduced-motion` 下乾淨地關掉，所以自己做。
 *   無障礙由 `aria-expanded` ＋ `aria-controls` 補齊。
 */
export function ExpandableDetail({ summary, children, defaultOpen = false, testid = null, count = null }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="esmo-exp">
      <button
        type="button"
        className="esmo-exp__btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        data-testid={testid}
        style={{ minHeight: HIT }}
      >
        <span className={`esmo-exp__chev${open ? " is-open" : ""}`} aria-hidden="true">
          <EsmoIcon name="chevronDown" size={14} />
        </span>
        <span className="esmo-exp__label">{summary}</span>
        {count != null && <span className="esmo-exp__count">{count}</span>}
      </button>
      <div id={id} className={`esmo-exp__body${open ? " is-open" : ""}`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/**
 * 狀態 chip 列：用來取代一整段「這個模式不會怎樣」的說明文字。
 *
 * ⚠ **不得只用顏色表達狀態**——每個 chip 都必須有文字。顏色只是強化。
 * @param {Array<{text:string, tone?:string}>} items
 */
export function ChipRow({ items = [], testid = null, dense = false }) {
  return (
    <div className="esmo-chiprow" data-testid={testid} style={{ gap: dense ? 4 : 6 }}>
      {items.filter(Boolean).map((it) => (
        <span
          key={it.text}
          className="esmo-chip"
          style={{
            color: it.tone ?? GC.gray,
            borderColor: `${it.tone ?? GC.gray}55`,
            padding: dense ? "2px 6px" : "3px 8px",
          }}
        >
          {it.text}
        </span>
      ))}
    </div>
  );
}

export default InfoHint;
