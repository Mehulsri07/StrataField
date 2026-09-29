import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { text } from "@/text";

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Says exactly what will happen, e.g. "Move to Recycle bin". */
  confirmLabel: string;
  danger?: boolean;
}

/**
 * A yes/no question before something the user might regret. Returns `ask`, which resolves true
 * when they confirm, and `dialog` to render once.
 */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const ask = (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(open) => !open && finish(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.body && <DialogDescription>{pending.body}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(false)}>{text.actions.cancel}</Button>
          <Button variant={pending?.danger ? "destructive" : "default"} onClick={() => finish(true)}>{pending?.confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
