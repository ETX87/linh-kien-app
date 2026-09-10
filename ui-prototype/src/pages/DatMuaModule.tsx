import { useMemo, useState } from "react";
import { Tabs } from "../components/ui/Tabs";
import { PurchasePage } from "./PurchasePage";
import { PxkPage } from "./PxkPage";
import { ThieuLkPage } from "./ThieuLkPage";
import { BaoCaoPage } from "./BaoCaoPage";
import { usePersona } from "../hooks/usePersona";
import { visibleModules } from "../lib/permissions";

// Module "Đặt mua linh kiện" - gom các tab nội bộ (Mua hàng / Công nợ / PXK / Thiếu LK / Báo cáo)
// theo cấu trúc module thật. Nav key = "mua-hang".
export function DatMuaModule({
  mobile,
  externalOpen,
}: {
  mobile?: boolean;
  externalOpen?: { tab: string; id: string } | null;
}) {
  const { persona } = usePersona();
  const allowed = new Set(visibleModules(persona));

  const tabs = useMemo(
    () =>
      [
        { key: "mua-hang", label: "Mua hàng", show: allowed.has("mua-hang") },
        { key: "cong-no", label: "Công nợ", show: allowed.has("cong-no") },
        { key: "phieu-xuat-kho", label: "Phiếu xuất kho", show: allowed.has("phieu-xuat-kho") },
        { key: "thieu-lk", label: "Thiếu linh kiện", show: allowed.has("thieu-lk") },
        { key: "bao-cao", label: "Báo cáo", show: allowed.has("bao-cao") },
      ].filter((t) => t.show),
    [allowed],
  );

  const mapExt = externalOpen?.tab;
  const [tab, setTab] = useState(() => {
    if (mapExt && tabs.some((t) => t.key === mapExt)) return mapExt;
    return tabs[0]?.key ?? "mua-hang";
  });

  const extId = externalOpen && externalOpen.tab === tab ? externalOpen.id : null;

  return (
    <div>
      <div className="mb-3">
        <Tabs value={tab} onChange={setTab} tabs={tabs.map((t) => ({ key: t.key, label: t.label }))} />
      </div>
      {tab === "mua-hang" && <PurchasePage mobile={mobile} externalOpenId={extId} />}
      {tab === "cong-no" && <PurchasePage loai="cong_no" mobile={mobile} />}
      {tab === "phieu-xuat-kho" && <PxkPage mobile={mobile} externalOpenId={extId} />}
      {tab === "thieu-lk" && <ThieuLkPage mobile={mobile} externalOpenId={extId} />}
      {tab === "bao-cao" && <BaoCaoPage mobile={mobile} />}
    </div>
  );
}
