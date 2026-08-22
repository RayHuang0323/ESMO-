// ESMO Design System v1 — shared presentation tokens.
//
// This file deliberately derives its colour accents from the existing GC
// palette.  It is additive: legacy screens can keep using theme.js while new
// screens adopt the command-deck vocabulary below one surface at a time.
import { GC, FONT, MONO } from "./theme.js";

export const ESMO_DESIGN_SYSTEM = {
  colors: {
    ink: GC.bg,
    surface: GC.card,
    surfaceRaised: GC.card2,
    line: GC.line,
    text: "#ffffff",
    muted: GC.gray,
    signal: GC.green,
    info: GC.blue,
    moba: GC.purp,
    tactical: GC.gold,
    danger: GC.red,
  },
  typography: {
    display: FONT,
    body: FONT,
    utility: MONO,
  },
  radius: {
    hero: "28px",
    card: "18px",
    control: "12px",
    pill: "999px",
  },
  motion: {
    fast: "160ms",
    base: "240ms",
    reveal: "560ms",
    ease: "power2.out",
  },
};

// React style object used by the Home shell.  Keeping these variables in one
// place lets future screens share the same CSS vocabulary without importing
// business data or changing the Store shape.
export const ESMO_CSS_VARS = {
  "--esmo-ink": ESMO_DESIGN_SYSTEM.colors.ink,
  "--esmo-surface": ESMO_DESIGN_SYSTEM.colors.surface,
  "--esmo-surface-raised": ESMO_DESIGN_SYSTEM.colors.surfaceRaised,
  "--esmo-line": ESMO_DESIGN_SYSTEM.colors.line,
  "--esmo-text": ESMO_DESIGN_SYSTEM.colors.text,
  "--esmo-muted": ESMO_DESIGN_SYSTEM.colors.muted,
  "--esmo-signal": ESMO_DESIGN_SYSTEM.colors.signal,
  "--esmo-info": ESMO_DESIGN_SYSTEM.colors.info,
  "--esmo-moba": ESMO_DESIGN_SYSTEM.colors.moba,
  "--esmo-tactical": ESMO_DESIGN_SYSTEM.colors.tactical,
  "--esmo-danger": ESMO_DESIGN_SYSTEM.colors.danger,
  "--esmo-font": ESMO_DESIGN_SYSTEM.typography.body,
  "--esmo-mono": ESMO_DESIGN_SYSTEM.typography.utility,
};
