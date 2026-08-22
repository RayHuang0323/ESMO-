// Small, consistent icon surface for new ESMO UI.
// Content emoji (team/sponsor identity) may remain data; navigation and
// status icons should use this stroke-based system instead.
import React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  BarChart2,
  Bell,
  ChevronRight,
  DollarSign,
  FileText,
  Gamepad2,
  Home,
  MessageCircle,
  MoreHorizontal,
  Package,
  Search,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
  X,
} from "lucide-react";

const ICONS = {
  alert: ArrowDownLeft,
  arrowUp: ArrowUpRight,
  award: Award,
  chart: BarChart2,
  chevron: ChevronRight,
  close: X,
  finance: DollarSign,
  home: Home,
  inbox: Bell,
  message: MessageCircle,
  more: MoreHorizontal,
  note: FileText,
  package: Package,
  search: Search,
  star: Star,
  target: Target,
  trophy: Trophy,
  users: Users,
  signal: Zap,
  compete: Gamepad2,
};

export function EsmoIcon({ name, size = 18, strokeWidth = 1.8, title, className = "" }) {
  const Icon = ICONS[name] ?? Zap;
  return (
    <Icon
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}

export default EsmoIcon;
