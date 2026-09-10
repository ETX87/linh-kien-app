import { useMemo, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Btn } from "../components/ui/Btn";
import { Icon } from "../components/ui/Icon";
import { OrdersView } from "./shared/OrdersView";
import { CreateOrderModal } from "./shared/CreateOrderModal";
import { ImportExcelDialog } from "../components/ui/ImportExcelDialog";
import { usePersona } from "../hooks/usePersona";
import { useOrders } from "../hooks/useStore";
import { scopeOrders } from "../lib/scope";
import { orderRowActions, canCreateOrder } from "../lib/permissions";

export function PurchasePage({ loai, mobile, externalOpenId }: { loai?: "mua" | "cong_no"; mobile?: boolean; externalOpenId?: string | null }) {
  const { persona } = usePersona();
  const all = useOrders();
  const [create, setCreate] = useState(false);
  const [imp, setImp] = useState(false);

  const stats = useMemo(() => {
    const rows = scopeOrders(persona, all).filter((o) => o.loai !== "tra_hang" && (!loai || o.loai === loai));
    return {
      choToi: rows.filter((o) => orderRowActions(persona, o).length > 0).length,
      uuTien: rows.filter((o) => o.uuTien).length,
      quaHan: rows.filter((o) => o.quaHan).length,
      daDuyet: rows.filter((o) => o.trangThai === "TN đã duyệt").length,
      tong: rows.length,
    };
  }, [persona, all, loai]);

  return (
    <div className="anim-in">
      <PageHeader
        title={loai === "cong_no" ? "Công nợ" : "Mua hàng"}
        actions={
          <>
            <Btn variant="ghost" size="md" onClick={() => setImp(true)}>
              <Icon.upload size={15} /> Nhập Excel
            </Btn>
            {canCreateOrder(persona) && (
              <Btn size="md" onClick={() => setCreate(true)}>
                <Icon.plus size={15} /> Tạo đơn
              </Btn>
            )}
          </>
        }
      />

      <div className={mobile ? "mb-4 grid grid-cols-2 gap-2.5" : "mb-4 flex flex-wrap gap-3"}>
        <StatCard label="Chờ tôi duyệt" value={stats.choToi} tone="warning" icon={<Icon.clock size={18} />} muted={stats.choToi === 0} onClick={() => {}} />
        <StatCard label="Ưu tiên" value={stats.uuTien} tone="warning" icon={<Icon.star size={16} />} muted={stats.uuTien === 0} onClick={() => {}} />
        <StatCard label="Quá hạn" value={stats.quaHan} tone="danger" icon={<Icon.alert size={18} />} muted={stats.quaHan === 0} onClick={() => {}} />
        <StatCard label="Đã duyệt" value={stats.daDuyet} tone="success" icon={<Icon.check size={18} />} onClick={() => {}} />
        <StatCard label="Tổng đơn" value={stats.tong} tone="info" icon={<Icon.cart size={18} />} onClick={() => {}} />
      </div>

      <OrdersView loai={loai} mobile={mobile} externalOpenId={externalOpenId} />

      <CreateOrderModal open={create} onClose={() => setCreate(false)} mobile={mobile} onOpenImport={() => { setCreate(false); setImp(true); }} />
      <ImportExcelDialog open={imp} onClose={() => setImp(false)} mobile={mobile} />
    </div>
  );
}
