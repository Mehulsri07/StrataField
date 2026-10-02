import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { BookOpen, CircleAlert, Moon, Search, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PatternDefs } from "@/components/geology/patterns";
import { Chip } from "./Chip";
import { StartupNotice } from "./StartupNotice";
import { UpdateNotice } from "./UpdateNotice";
import { NAV } from "./nav";
import { useStartup, useSummary, type Summary } from "@/lib/hooks";
import { api, isPreview } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { text } from "@/text";
import { cn } from "cn";

/**
 * The frame every screen sits in: sidebar, scrolling workspace and status bar.
 * If the database could not be opened, the frame explains why instead of showing screens.
 */
export function AppShell() {
  const startup = useStartup();
  const ready = !!startup && !startup.error;
  const summary = useSummary(ready);
  // The one-time message about the older app's data is shown on Home only, not on every screen.
  const onHome = useLocation().pathname === "/";
  const navigate = useNavigate();

  // Ctrl+K opens the borewell search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/borewells?focus=search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="grid h-full grid-cols-[224px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
      <PatternDefs />
      <Sidebar summary={summary} />
      <main className="min-h-0 min-w-0 overflow-auto">
        {startup?.error ? (
          <CannotOpen message={startup.error} folder={startup.dataFolder} />
        ) : (
          <>
            {startup && onHome && <StartupNotice status={startup} />}
            <UpdateNotice />
            <Outlet />
          </>
        )}
      </main>
      <StatusBar summary={summary} failed={!!startup?.error} />
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
      <rect x="1" y="1" width="24" height="24" rx="5" fill="var(--primary)" />
      <rect x="6" y="5" width="14" height="3.5" fill="#D4C5A0" />
      <rect x="6" y="8.5" width="14" height="4" fill="#8B6914" />
      <rect x="6" y="12.5" width="14" height="4" fill="#E8C84A" />
      <rect x="6" y="16.5" width="14" height="4.5" fill="#C49A3C" />
      <path d="M5 13.8H21" stroke="#fff" strokeWidth="1.2" strokeDasharray="2 1.5" />
    </svg>
  );
}

function Sidebar({ summary }: { summary: Summary | null }) {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const groups = ["records", "data", "app"] as const;
  return (
    <aside className="row-span-2 flex flex-col gap-4 border-r border-sidebar-border bg-sidebar px-3 pt-4 pb-3">
      <div className="flex items-center gap-2.5 px-1.5">
        <BrandMark />
        <span className="text-[15px] font-semibold text-foreground">{text.app.name}</span>
      </div>
      <button
        type="button"
        onClick={() => navigate("/borewells?focus=search")}
        className="flex items-center gap-2 rounded-md border border-sidebar-border bg-background px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground"
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{text.topbar.jumpTo}</span>
        <kbd className="ml-auto text-[11px]">{text.topbar.jumpShortcut}</kbd>
      </button>
      <nav aria-label="Main" className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-px">
            {NAV.filter((n) => n.group === g).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sidebar-foreground transition-colors",
                    "hover:bg-sidebar-accent hover:text-foreground",
                    isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  )
                }
              >
                <n.icon className="size-4 shrink-0 text-muted-foreground group-aria-[current=page]:text-primary" aria-hidden="true" />
                <span>{n.label}</span>
                {n.showCount && summary && <span className="num ml-auto text-xs text-muted-foreground">{summary.borewells}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-1 pl-2.5 text-xs text-muted-foreground">
        {!isPreview && (
          <button type="button" onClick={() => api.openGuide().catch((e) => toast.error(String(e)))} className="inline-flex items-center gap-1.5 rounded-sm text-left hover:text-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" /> {text.guide.short}
          </button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => setTheme(dark ? "light" : "dark")}
                aria-label={dark ? text.topbar.themeToLight : text.topbar.themeToDark}
              />
            }
          >
            {dark ? <Sun /> : <Moon />}
          </TooltipTrigger>
          <TooltipContent>{dark ? text.topbar.themeToLight : text.topbar.themeToDark}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function StatusBar({ summary, failed }: { summary: Summary | null; failed: boolean }) {
  const backup = summary?.lastBackup;
  return (
    <footer className="col-start-2 flex items-center gap-5 overflow-hidden border-t border-border px-6 py-1.5 text-xs whitespace-nowrap text-muted-foreground">
      {failed ? (
        <span className="flex items-center gap-1.5 text-destructive">
          <CircleAlert className="size-3.5" aria-hidden="true" /> {text.status.notConnected}
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span className="size-[7px] rounded-full bg-ok" aria-hidden="true" /> {text.status.savedOnComputer}
          </span>
          {summary && <span>{text.status.borewells(summary.borewells)} · {text.status.located(summary.located)}</span>}
          <span>{backup ? text.status.lastBackup(formatWhen(backup.createdAt)) : text.status.noBackupYet}</span>
          <span>{text.status.units}</span>
        </>
      )}
      <span className="ml-auto flex items-center gap-4">
        {isPreview && <Chip tone="warn">{text.status.preview}</Chip>}
        {text.status.version(__APP_VERSION__)}
      </span>
    </footer>
  );
}

function CannotOpen({ message, folder }: { message: string; folder: string }) {
  return (
    <div className="mx-auto grid max-w-xl gap-3 p-10">
      <h1 className="text-xl font-semibold">{text.startup.cannotOpenTitle}</h1>
      <p>{message}</p>
      {folder && <p className="text-sm text-muted-foreground">Data folder: <span className="num">{folder}</span></p>}
    </div>
  );
}
