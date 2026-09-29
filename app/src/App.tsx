import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { ComingSoon } from "@/components/app/Page";
import { DesignSystem } from "@/pages/DesignSystem";
import { Borewells } from "@/pages/Borewells";
import { BorewellDetail } from "@/pages/BorewellDetail";
import { BorewellForm } from "@/pages/BorewellForm";
import { MapPage } from "@/pages/MapPage";
import { text } from "@/text";

const p = text.pages;

/** Every screen. Screens marked ComingSoon are built in T3; the shell and menu work now. */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ComingSoon title={p.home.title} sub={p.home.sub(text.app.city)} />} />
        <Route path="borewells" element={<Borewells />} />
        <Route path="borewell/:id" element={<BorewellDetail />} />
        <Route path="borewell/:id/edit" element={<BorewellForm key="edit" mode="edit" />} />
        <Route path="borewell/:id/layers" element={<ComingSoon title={p.editLayers.title} sub="" />} />
        <Route path="map" element={<MapPage />} />
        <Route path="section" element={<ComingSoon title={p.section.title} sub={p.section.sub} />} />
        <Route path="new" element={<BorewellForm key="new" mode="new" />} />
        <Route path="import" element={<ComingSoon title={p.import.title} sub={p.import.sub} />} />
        <Route path="export" element={<ComingSoon title={p.export.title} sub={p.export.sub} />} />
        <Route path="recycle-bin" element={<ComingSoon title={p.recycleBin.title} sub={p.recycleBin.sub} />} />
        <Route path="settings" element={<ComingSoon title={p.settings.title} sub={p.settings.sub} />} />
        <Route path="design" element={<DesignSystem />} />
        <Route path="*" element={<ComingSoon title={p.notFound.title} sub={p.notFound.sub} />} />
      </Route>
    </Routes>
  );
}
