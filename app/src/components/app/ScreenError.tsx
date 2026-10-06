import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, isPreview } from "@/lib/api";

/**
 * Shown in place of a screen that failed to draw, so a fault in one screen never leaves the whole
 * window blank. The rest of the app (the menu, the other screens) keeps working.
 */
export class ScreenError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid max-w-xl gap-3 px-8 pt-10 text-sm">
        <TriangleAlert className="size-6 text-warn" aria-hidden="true" />
        <h1 className="text-xl font-semibold">This screen could not be shown</h1>
        <p className="text-muted-foreground">Something went wrong while drawing it. Your borewells are safe; nothing was changed. Try again, or open another screen from the menu.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => this.setState({ failed: false })}>Try again</Button>
          {!isPreview && <Button variant="outline" onClick={() => api.openLog().catch(() => {})}>Open the error log</Button>}
        </div>
      </div>
    );
  }
}
