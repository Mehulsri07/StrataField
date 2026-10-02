import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { NotFound } from "@/components/app/Page";

const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const RecycleBin = lazy(() => import("@/pages/RecycleBin").then((m) => ({ default: m.RecycleBin })));
const Borewells = lazy(() => import("@/pages/Borewells").then((m) => ({ default: m.Borewells })));
const BorewellDetail = lazy(() => import("@/pages/BorewellDetail").then((m) => ({ default: m.BorewellDetail })));
const BorewellForm = lazy(() => import("@/pages/BorewellForm").then((m) => ({ default: m.BorewellForm })));
const MapPage = lazy(() => import("@/pages/MapPage").then((m) => ({ default: m.MapPage })));
const EditLayers = lazy(() => import("@/pages/EditLayers").then((m) => ({ default: m.EditLayers })));
const ImportPage = lazy(() => import("@/pages/ImportPage").then((m) => ({ default: m.ImportPage })));
const SectionPage = lazy(() => import("@/pages/SectionPage").then((m) => ({ default: m.SectionPage })));
const ExportPage = lazy(() => import("@/pages/ExportPage").then((m) => ({ default: m.ExportPage })));


/** Every screen. */
export default function App() {
  return (
    // Each screen loads the first time it is opened, so the app starts quickly.
    <Suspense fallback={<p className="p-6 text-muted-foreground">Loading…</p>}>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="borewells" element={<Borewells />} />
        <Route path="borewell/:id" element={<BorewellDetail />} />
        <Route path="borewell/:id/edit" element={<BorewellForm key="edit" mode="edit" />} />
        <Route path="borewell/:id/layers" element={<EditLayers />} />
        <Route path="map" element={<MapPage />} />
        <Route path="section" element={<SectionPage />} />
        <Route path="new" element={<BorewellForm key="new" mode="new" />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="recycle-bin" element={<RecycleBin />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
