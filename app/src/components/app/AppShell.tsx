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

/** The app's logo at menu size: the icon (app/icon-source.svg) without its fine detail. */
function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 1024 1024" aria-hidden="true" className="shrink-0">
      <rect x="32" y="32" width="960" height="960" rx="212" fill="#F2F0E1" stroke="var(--sidebar-border)" strokeWidth="24" />
      <g transform="translate(512 520) scale(1.16) translate(-512 -520)" strokeLinejoin="round">
        <path d="M206 410L512 270L818 410L512 550Z" fill="#5C6670" />
        <path d="M206 410L512 550L818 410V445Q654 540 512 585Q370 540 206 445Z" fill="#56706B" />
        <path d="M206 445Q370 540 512 585Q654 540 818 445V520Q644 640 512 665Q380 640 206 520Z" fill="#A9C39A" />
        <path d="M206 520Q380 640 512 665Q644 640 818 520V600Q674 690 512 770Q350 690 206 600Z" fill="#D2955F" />
        <path d="M206 600Q350 690 512 770Q674 690 818 600V690L512 860L206 690Z" fill="#9A8D78" />
        <path d="M206 410L512 270L818 410V690L512 860L206 690Z" fill="none" stroke="#2C3A44" strokeWidth="22" />
        <path d="M470 456V694A42 20 0 0 0 554 694V456Z" fill="#CDB38D" stroke="#2C3A44" strokeWidth="18" />
        <path d="M512 448C478 404 458 378 458 346A54 54 0 1 1 566 346C566 378 546 404 512 448Z" fill="#A5C596" stroke="#2C3A44" strokeWidth="18" />
        <circle cx="512" cy="346" r="20" fill="#F2F0E1" />
      </g>
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
          <button type="button" onClick={() => api.openManual().catch((e) => toast.error(String(e)))} className="inline-flex items-center gap-1.5 rounded-sm text-left hover:text-foreground">
            <BookOpen className="size-3.5" aria-hidden="true" /> {text.guide.manual}
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
