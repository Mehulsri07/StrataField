import { useEffect, useState } from "react";
import type { BorewellListItem, LithologyFamily, Material } from "@strata/core";
import { toast } from "sonner";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Chip } from "@/components/app/Chip";
import { Page, PageHeader, Panel } from "@/components/app/Page";
import { MaterialSwatch, PipeSwatch, StrataStrip } from "@/components/geology/patterns";
import { api } from "@/lib/api";
import { text } from "@/text";

// Base UI selects show an item's label only when given the list of items.
const DRILLING_METHODS = [
  { value: "ROTARY", label: "Rotary" },
  { value: "DTH", label: "DTH (down-the-hole)" },
  { value: "MANUAL", label: "Manual" },
];

const COLOURS = [
  ["Ground", "--background"], ["Panel", "--card"], ["Text", "--foreground"], ["Quiet text", "--muted-foreground"],
  ["Line", "--border"], ["Accent", "--primary"], ["Accent soft", "--accent"], ["Water", "--water"],
  ["Good", "--ok"], ["Warning", "--warn"], ["Problem", "--destructive"], ["Plain pipe", "--pipe-plain"], ["Screen pipe", "--pipe-screen"],
] as const;

/**
 * Every building block of the StrataField interface on one page, for design review (T2).
 * Reached from the sidebar in the browser preview and development builds.
 */
export function DesignSystem() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [rows, setRows] = useState<BorewellListItem[]>([]);
  const [distance, setDistance] = useState(2);

  useEffect(() => {
    api.materials.list().then(setMaterials).catch(() => {});
    api.borewells.search().then((r) => setRows(r.slice(0, 5))).catch(() => {});
  }, []);

  const families: LithologyFamily[] = ["CLAY", "SAND", "ROCK", "NONE"];

  return (
    <Page>
      <PageHeader
        title="Design system"
        sub="The colours, type and parts every StrataField screen is built from."
        actions={<><Button variant="outline"><Upload />Import Excel</Button><Button><Plus />New borewell</Button></>}
      />

      <Panel title="Colours" bodyClassName="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
        {COLOURS.map(([name, v]) => (
          <div key={v} className="grid gap-1.5">
            <div className="h-12 rounded-md border border-border" style={{ background: `var(${v})` }} />
            <div className="text-[13px] font-medium">{name}</div>
            <div className="num text-[11px] text-muted-foreground">{v}</div>
          </div>
        ))}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Type">
          <div className="grid gap-3">
            <h2 className="text-[22px] font-semibold">Page title · IBM Plex Sans Condensed</h2>
            <h3 className="font-heading text-base font-semibold">Panel heading</h3>
            <p className="max-w-[65ch]">Body text in IBM Plex Sans. Written plainly: say what happens and what to do next.</p>
            <p className="text-[13px] text-muted-foreground">Quiet text for hints and secondary details.</p>
            <p className="num">BW-2026-024 · 280 ft · water 92 ft · 26.8930° N</p>
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">Section label</p>
          </div>
        </Panel>

        <Panel title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button>Save borewell</Button>
            <Button variant="outline">Cancel</Button>
            <Button variant="secondary">Make PDF report</Button>
            <Button variant="ghost">More options</Button>
            <Button variant="destructive"><Trash2 />Move to Recycle bin</Button>
            <Button variant="outline" disabled><Download />Export (nothing selected)</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip>From Excel</Chip><Chip tone="ok">Complete</Chip><Chip tone="warn">No location</Chip>
            <Chip tone="accent">Estimate</Chip><Chip tone="warn">Rough estimate</Chip><Chip tone="danger">Could not import</Chip>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Form fields">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ds-id">Borewell ID</Label>
              <Input id="ds-id" defaultValue="BW-2026-025" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ds-depth">Total depth (ft)</Label>
                <Input id="ds-depth" className="num" inputMode="decimal" defaultValue="280" />
              </div>
              <div className="grid gap-1.5">
                <Label>Drilling method</Label>
                <Select defaultValue="ROTARY" items={DRILLING_METHODS}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DRILLING_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ds-notes">Notes</Label>
              <Textarea id="ds-notes" placeholder="Anything the driller noticed" />
            </div>
            <div className="grid gap-2">
              <Label>Include borewells within <span className="num font-semibold">{distance} km</span> of the line</Label>
              <Slider value={[distance]} min={0.5} max={3} step={0.25} onValueChange={(v) => setDistance(Array.isArray(v) ? v[0] : v)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked /> Show water level
            </label>
          </div>
        </Panel>

        <Panel title="Messages">
          <div className="grid gap-3">
            <Alert>
              <AlertTitle>Nothing is filled in from 72 to 95 ft</AlertTitle>
              <AlertDescription>Mark that depth as not recorded, or add the missing layer.</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => toast.success("Borewell saved")}>Show a success message</Button>
              <Button variant="outline" onClick={() => toast.error("Enter a borewell ID.")}>Show a problem message</Button>
              <Dialog>
                <DialogTrigger render={<Button variant="outline" />}>Open a confirmation</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Move BW-2026-024 to the Recycle bin?</DialogTitle>
                    <DialogDescription>You can restore it from the Recycle bin later.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>{text.actions.cancel}</DialogClose>
                    <DialogClose render={<Button variant="destructive" />}>Move to Recycle bin</DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Soil types" bodyClassName="grid gap-4 md:grid-cols-4">
        {families.map((f) => (
          <div key={f} className="grid content-start gap-1">
            <div className="mb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{text.geology.families[f]}</div>
            {materials.filter((m) => m.lithologyFamily === f).map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-[13px]">
                <MaterialSwatch color={m.color} pattern={m.pattern} size={20} /> {m.name}
              </div>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] md:col-span-4">
          <span className="flex items-center gap-2"><PipeSwatch kind="plain" /> {text.geology.plainPipe}</span>
          <span className="flex items-center gap-2"><PipeSwatch kind="slotted" /> {text.geology.screenPipe}</span>
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-water" /> {text.geology.waterLevel}</span>
        </div>
      </Panel>

      <Panel title="Table" bodyClassName="p-0">
        <Tabs defaultValue="list">
          <div className="border-b border-border px-4 pt-2">
            <TabsList variant="line">
              <TabsTrigger value="list">Borewells</TabsTrigger>
              <TabsTrigger value="empty">When nothing matches</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="list">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Borewell ID</TableHead><TableHead>Owner</TableHead><TableHead>Area</TableHead>
                  <TableHead className="text-right">Total depth (ft)</TableHead><TableHead className="text-right">Water level (ft)</TableHead>
                  <TableHead>Layers <span className="font-normal text-muted-foreground">(blue = water)</span></TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ borewell: b, strata }) => (
                  <TableRow key={b.id} className="cursor-pointer">
                    <TableCell className="num font-medium text-primary">{b.borewellId}</TableCell>
                    <TableCell>{b.ownerName}</TableCell>
                    <TableCell>{b.area}<div className="text-xs text-muted-foreground">{b.project}</div></TableCell>
                    <TableCell className="num text-right">{b.totalDepth}</TableCell>
                    <TableCell className="num text-right">{b.waterLevel}</TableCell>
                    <TableCell><StrataStrip strata={strata} totalDepth={b.totalDepth} waterLevel={b.waterLevel} /></TableCell>
                    <TableCell>{b.latitude == null ? <Chip tone="warn">No location</Chip> : b.importMethod === "excel" ? <Chip>From Excel</Chip> : <Chip tone="ok">Complete</Chip>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="empty">
            <p className="px-4 py-10 text-center text-muted-foreground">No borewells match these filters. Clear the search box or choose “All zones”.</p>
          </TabsContent>
        </Tabs>
      </Panel>
    </Page>
  );
}
