import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__", ADD = "__add__";

/**
 * A dropdown whose last choice ("Add a new company…") turns it into a text box for a value that is
 * not on the list yet. A value already saved but not among `options` is listed too.
 */
export function PickOrAdd({ id, value, options, addLabel, onChange }: {
  id: string; value: string; options: string[]; addLabel: string; onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  // Values that are not among `options` (saved earlier, or just typed) stay on the list while this
  // screen is open: the list must not lose an entry the moment another one is chosen.
  const [extra, setExtra] = useState<string[]>([]);
  if (!adding && value && !options.includes(value) && !extra.includes(value)) setExtra([...extra, value]);
  if (adding) {
    return (
      <div className="flex gap-2">
        <Input id={id} autoFocus value={value} onChange={(e) => onChange(e.target.value)} />
        <Button variant="ghost" size="icon" aria-label="Back to the list" onClick={() => setAdding(false)}><X /></Button>
      </div>
    );
  }
  const items = [
    { value: NONE, label: "Not recorded" },
    ...[...new Set([...options, ...extra])].map((v) => ({ value: v, label: v })),
    { value: ADD, label: addLabel },
  ];
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => { if (v === ADD) { setAdding(true); onChange(""); } else if (v != null) onChange(v === NONE ? "" : v); }}
      items={items}
    >
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
