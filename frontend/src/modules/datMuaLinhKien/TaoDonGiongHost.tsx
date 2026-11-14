import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ui/Toast";
import { SU_KIEN_TAO_DON_GIONG, coFormTaoDonDangMo, coHangChoTaoGiong } from "./taoDonGiong";

const TaoDonTab = lazy(() => import("./TaoDonTab").then((m) => ({ default: m.TaoDonTab })));

// "⧉ Tạo đơn giống" (v1.491) bam o chi tiet don khi KHONG co form tao don nao dang mo (chi tiet don mo tu Trang chu, Phieu xuat, Quy,
// Hoi dap...) -> mo form tao don ngay tai cho; form vua mount tu lay dong trong hang cho (taoDonGiong.ts). Mount 1 lan o App.tsx.
export function TaoDonGiongHost() {
  const auth = useAuth();
  const qc = useQueryClient();
  const addToast = useToast();
  const [mo, setMo] = useState(false);
  useEffect(() => {
    const nghe = () => {
      // Form dang mo (module Don hang / chinh host nay) tu them dong - khong mo form thu 2.
      if (coFormTaoDonDangMo()) return;
      if (coHangChoTaoGiong()) setMo(true);
    };
    window.addEventListener(SU_KIEN_TAO_DON_GIONG, nghe);
    return () => window.removeEventListener(SU_KIEN_TAO_DON_GIONG, nghe);
  }, []);
  if (!mo || auth.status !== "authenticated") return null;
  const u = auth.user;
  const canQuanLy = !!u.la_tac_nghiep || u.vai_tro === "Admin" || u.vai_tro === "Giam sat";
  return (
    <Suspense fallback={null}>
      <TaoDonTab addToast={addToast} qc={qc} canQuanLy={canQuanLy} onClose={() => setMo(false)} />
    </Suspense>
  );
}
