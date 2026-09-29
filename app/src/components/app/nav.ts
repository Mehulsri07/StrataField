import { Download, House, Layers, List, Map, Plus, Settings, Trash2, Upload, type LucideIcon } from "lucide-react";
import { text } from "@/text";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: "records" | "data" | "app";
  /** Shows the number of borewells beside the label. */
  showCount?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: text.nav.home, icon: House, group: "records" },
  { to: "/borewells", label: text.nav.borewells, icon: List, group: "records", showCount: true },
  { to: "/map", label: text.nav.map, icon: Map, group: "records" },
  { to: "/section", label: text.nav.section, icon: Layers, group: "records" },
  { to: "/new", label: text.nav.newBorewell, icon: Plus, group: "data" },
  { to: "/import", label: text.nav.import, icon: Upload, group: "data" },
  { to: "/export", label: text.nav.export, icon: Download, group: "data" },
  { to: "/recycle-bin", label: text.nav.recycleBin, icon: Trash2, group: "app" },
  { to: "/settings", label: text.nav.settings, icon: Settings, group: "app" },
];

/** Page title for the top bar, from the current path. */
export function titleFor(pathname: string): string {
  if (pathname.startsWith("/borewell/")) {
    if (pathname.endsWith("/layers")) return text.pages.editLayers.title;
    if (pathname.endsWith("/edit")) return "Edit details";
    return text.pages.detail.title;
  }
  if (pathname === "/design") return "Design system";
  return NAV.find((n) => n.to === pathname)?.label ?? text.pages.notFound.title;
}
