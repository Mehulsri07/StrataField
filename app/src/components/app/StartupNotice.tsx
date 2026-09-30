import { useEffect, useState } from "react";
import type { StartupStatus } from "@strata/core";
import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { text } from "@/text";

const SEEN_KEY = "startup_notice_seen";

/**
 * One-time message after the older StrataField's data was brought over (or could not be).
 * Stays until the user closes it; closing is remembered in the database's settings.
 */
export function StartupNotice({ status }: { status: StartupStatus }) {
  const report = status.legacyImport;
  const failed = status.legacyImportError;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!report && !failed) return;
    api.settings.get<boolean>(SEEN_KEY).then((seen) => setOpen(!seen)).catch(() => setOpen(true));
  }, [report, failed]);

  if (!open) return null;
  const close = () => {
    setOpen(false);
    api.settings.set(SEEN_KEY, true).catch(() => {});
  };

  return (
    <div
      role="status"
      className={`mx-6 mt-5 flex gap-3 rounded-md border p-4 ${failed ? "border-destructive/40 bg-danger-soft" : "border-ok/30 bg-ok-soft"}`}
    >
      {failed ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" />}
      <div className="grid gap-1 text-sm">
        {failed ? (
          <>
            <b>{text.startup.broughtOverFailed}</b>
            <span>{failed}</span>
          </>
        ) : (
          report && (
            <>
              <b>{text.startup.broughtOverTitle}</b>
              <span>{text.startup.broughtOver(report.borewells, report.strataLayers, report.pipeSegments)}</span>
              {(report.orphanedLayers > 0 || report.orphanedPipes > 0) && (
                <span className="text-muted-foreground">{text.startup.leftBehind(report.orphanedLayers, report.orphanedPipes)}</span>
              )}
              {report.unmatchedMaterialNames.length > 0 && (
                <span className="text-muted-foreground">
                  {text.startup.unmatched(report.unmatchedMaterialNames)}{" "}
                  <Link to="/settings#soil-names" className="font-medium text-foreground underline underline-offset-2">{text.startup.chooseSoilTypes}</Link>
                </span>
              )}
            </>
          )
        )}
      </div>
      <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={close} aria-label={text.actions.close}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
