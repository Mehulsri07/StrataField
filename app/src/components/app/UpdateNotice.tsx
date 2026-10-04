import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkForUpdate, checkIsDue, type AvailableUpdate } from "@/lib/updates";
import { text } from "@/text";

/**
 * Once a day at start-up, quietly checks for a newer StrataField. If there is one, offers to install
 * it; nothing happens without the user choosing to. No internet simply means no notice.
 */
export function UpdateNotice() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!checkIsDue()) return;
    checkForUpdate().then(setUpdate).catch(() => { /* offline or GitHub unreachable: try another day */ });
  }, []);

  if (!update) return null;
  const install = async () => {
    setProgress(null);
    try {
      await update.install(setProgress);
    } catch (e) {
      setProgress(undefined);
      toast.error(`The update could not be installed. ${String(e)}`);
    }
  };

  return (
    <div role="status" className="mx-8 mt-5 flex max-w-[1256px] flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-accent p-4 text-sm text-accent-foreground">
      <Download className="size-5 shrink-0" aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <b>{text.updates.available(update.version)}</b>
        <span className="text-muted-foreground">
          {progress === undefined ? text.updates.howItWorks : progress === null ? text.updates.downloading : text.updates.downloadingPct(Math.round(progress * 100))}
        </span>
      </div>
      <Button onClick={install} disabled={progress !== undefined}>{text.updates.install}</Button>
      <Button variant="ghost" size="icon" onClick={() => setUpdate(null)} aria-label={text.updates.later} disabled={progress !== undefined}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
