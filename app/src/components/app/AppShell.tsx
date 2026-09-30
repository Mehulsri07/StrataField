import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { BookOpen, CircleAlert, Moon, Palette, Search, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PatternDefs } from "@/components/geology/patterns";
import { Chip } from "./Chip";
import { StartupNotice } from "./StartupNotice";
import { UpdateNotice } from "./UpdateNotice";
import { NAV, titleFor } from "./nav";
import { useStartup, useSummary, type Summary } from "@/lib/hooks";
import { api, isPreview } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { text } from "@/text";
import { cn } from "@/lib/utils";

/**
 * The frame every screen sits in: sidebar, top bar, scrolling workspace and status bar.
 * If the database could not be opened, the frame explains why instead of showing screens.
 */
export function AppShell() {
  const startup = useStartup();
  const ready = !!startup && !startup.error;
  const summary = useSummary(ready);

  return (
    <div className="grid h-full grid-cols-[212px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]">
      <PatternDefs />
      <Sidebar summary={summary} />
      <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
        <TopBar />
        <main className="min-h-0 overflow-auto">
          {startup?.error ? (
            <CannotOpen message={startup.error} folder={startup.dataFolder} />
          ) : (
            <>
              {startup && <StartupNotice status={startup} />}
              <UpdateNotice />
              <Outlet />
            </>
          )}
        </main>
      </div>
      <StatusBar summary={summary} failed={!!startup?.error} />
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
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
  const groups = ["records", "data", "app"] as const;
  return (
    <aside className="row-span-2 flex flex-col border-r border-sidebar-border bg-sidebar py-4">
      <div className="mb-5 flex items-center gap-2.5 px-4">
        <BrandMark />
        <div className="leading-tight">
          <div className="font-heading text-[17px] font-semibold text-foreground">{text.app.name}</div>
          <div className="text-xs text-muted-foreground">{text.app.tagline}</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-0.5">
            <div className="px-2.5 pt-3.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {text.nav.groups[g]}
            </div>
            {NAV.filter((n) => n.group === g).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] font-medium text-sidebar-foreground transition-colors",
                    "hover:bg-muted hover:text-foreground",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )
                }
              >
                <n.icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{n.label}</span>
                {n.showCount && summary && <span className="num ml-auto text-xs">{summary.borewells}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto grid gap-1 px-4 text-xs text-muted-foreground">
        {!isPreview && (
          <button type="button" onClick={() => api.openGuide().catch((e) => toast.error(String(e)))} className="inline-flex items-center gap-1.5 text-left hover:text-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" /> {text.guide.short}
          </button>
        )}
        {(isPreview || import.meta.env.DEV) && (
          <NavLink to="/design" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Palette className="size-3.5" aria-hidden="true" /> Design system
          </NavLink>
        )}
      </div>
    </aside>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";

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
    <header className="flex min-w-0 items-center gap-3 border-b border-border bg-card px-5 py-2.5">
      <h1 className="truncate font-sans text-sm font-medium">{titleFor(pathname)}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isPreview && <Chip tone="warn">{text.status.preview}</Chip>}
        <button
          type="button"
          onClick={() => navigate("/borewells?focus=search")}
          className="flex min-w-[220px] items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-left text-[13px] text-muted-foreground hover:text-foreground"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span>{text.topbar.jumpTo}</span>
          <kbd className="num ml-auto rounded-[3px] border border-input px-1 text-[11px]">{text.topbar.jumpShortcut}</kbd>
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(dark ? "light" : "dark")}
                aria-label={dark ? text.topbar.themeToLight : text.topbar.themeToDark}
              />
            }
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </TooltipTrigger>
          <TooltipContent>{dark ? text.topbar.themeToLight : text.topbar.themeToDark}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function StatusBar({ summary, failed }: { summary: Summary | null; failed: boolean }) {
  const backup = summary?.lastBackup;
  return (
    <footer className="col-start-2 flex items-center gap-5 overflow-hidden border-t border-border bg-card px-5 py-1.5 text-xs whitespace-nowrap text-muted-foreground">
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
      <span className="ml-auto">{text.status.version(__APP_VERSION__)}</span>
    </footer>
  );
}

function CannotOpen({ message, folder }: { message: string; folder: string }) {
  return (
    <div className="mx-auto grid max-w-xl gap-3 p-10">
      <h2 className="text-xl font-semibold">{text.startup.cannotOpenTitle}</h2>
      <p>{message}</p>
      {folder && <p className="text-sm text-muted-foreground">Data folder: <span className="num">{folder}</span></p>}
    </div>
  );
}
