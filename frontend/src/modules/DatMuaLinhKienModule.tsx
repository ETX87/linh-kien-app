import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/x/Tabs";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useIsMobile } from "../hooks/useMediaQuery";
import type { LuongQuyTrinhStep, JumpTarget, DangTonStep } from "./datMuaLinhKien/types";
import { PipelineFlow, MyWorkloadStrip } from "./datMuaLinhKien/PipelineFlow";
import { CaseDetailModal } from "./datMuaLinhKien/CaseDetailModal";

// Module "Dat mua linh kien" (Phase 2) - thay the quy trinh dat hang linh kien tren Google
// Sheets/AppSheet, xem plan "Module Dat Mua Linh Kien". Tabs hien theo co vai tro (la_ktv_dvbh/
// la_ve_tinh/la_kho/la_ke_toan) + vai_tro chuan (Giam sat theo doi, TBP DVBH/Admin = TN tac nghiep).
//
// UI redesign Phase 3 (phan hoi Codex 2026-08-19, "tach component/hook, lazy-load tab"): file nay
// tach tu 1 file duy nhat ~5234 dong thanh thu muc datMuaLinhKien/ (types/constants/helpers dung
// chung + 1 file rieng cho moi tab). 6 tab nang (TaoDonTab/DonCuaToiTab/PhieuXuatKhoTab/ThieuLkTab/
// TraHangTab/BaoCaoTab) dung React.lazy - chi tai code khi nguoi dung thuc su vao tab do, thay vi
// tai toan bo ~5000 dong ngay khi mo module. PipelineFlow/MyWorkloadStrip GIU EAGER (khong lazy) vi
// luon render ngay khi mo module (khong doi tab nao ca).
const TaoDonTab = lazy(() => import("./datMuaLinhKien/TaoDonTab").then((m) => ({ default: m.TaoDonTab })));
const DonCuaToiTab = lazy(() => import("./datMuaLinhKien/DonCuaToiTab").then((m) => ({ default: m.DonCuaToiTab })));
const PhieuXuatKhoTab = lazy(() => import("./datMuaLinhKien/PhieuXuatKhoTab").then((m) => ({ default: m.PhieuXuatKhoTab })));
const ThieuLkTab = lazy(() => import("./datMuaLinhKien/ThieuLkTab").then((m) => ({ default: m.ThieuLkTab })));
const TraHangTab = lazy(() => import("./datMuaLinhKien/TraHangTab").then((m) => ({ default: m.TraHangTab })));
// Trang chu (them 2026-08-24, khop concept-1-structured-neutral.html renderHome()) - man mac dinh
// moi khi vao module, dung LAI luongQuyTrinh/notifCounts/loaiDonCounts da co san o duoi, khong goi
// API moi. Lazy giong cac tab khac (khong phai PipelineFlow/MyWorkloadStrip - 2 cai do luon eager vi
// hien NGOAI Suspense, o moi tab).
// SUA (phan hoi chu he thong 2026-08-24: "Trang chủ với báo cáo gộp làm 1") - bo tab "Báo cáo" rieng,
// TrangChuTab.tsx gio TU render BaoCaoTab ben trong no (import thang, khong qua lazy rieng nua vi ban
// than TrangChuTab da la 1 lazy chunk) - xem TrangChuTab.tsx.
const TrangChuTab = lazy(() => import("./datMuaLinhKien/TrangChuTab").then((m) => ({ default: m.TrangChuTab })));

function TabFallback() {
  return <div className="text-sm text-[var(--ink-500)] py-6 text-center mt-4">Đang tải...</div>;
}

export function DatMuaLinhKienModule({
  forceView,
  openCase,
  headerExtra,
  onLeaveForceView,
  externalDetailOpen,
  onExternalDetailOpenConsumed,
}: {
  forceView?: string;
  openCase?: (id: string, tab?: string) => void;
  // Chuong thong bao (them 2026-09-05, phan hoi "chuyển vị trí chuông thông báo lên top giao diện") -
  // NotificationBell da CHUYEN RA App.tsx (hien o MOI tab thay vi chi rieng man Home) - 2 prop nay la
  // "cong vao" duy nhat de bam 1 dong thong bao tu ben ngoai module van mo dung Drawer chi tiet don
  // hang/PXK NAM BEN TRONG module nay. `nonce` (Date.now() luc bam) bat buoc phai DOI moi lan de effect
  // duoi day chac chan chay lai ke ca bam lai DUNG 1 dong thong bao vua xem xong.
  externalDetailOpen?: { tab: "don-cua-toi" | "phieu-xuat-kho" | "tra-hang" | "thieu-lk"; id: string; nonce: number } | null;
  onExternalDetailOpenConsumed?: () => void;
  // FIX (phan hoi 2026-08-26: "click vào thẻ trang chủ, kích để xem đơn hàng, mà vẫn ở thẻ trang chủ
  // là sao?") - khi vao qua forceView="trang-chu"/"thieu-lk" (muc menu rieng cap App.tsx) roi nhay
  // NOI BO sang view khac (vd bam so lieu StatCard -> "don-cua-toi"), Sidebar/tieu de h1 (dieu khien
  // boi active o App.tsx) truoc day KHONG doi theo - van hien "Trang chủ" du noi dung thuc te da la
  // "Đặt mua linh kiện". Goi callback nay CHINH XAC 1 LAN tai thoi diem thoat forceView de App.tsx tu
  // doi active - dong bo lai menu/tieu de voi noi dung dang xem that su.
  // "view" (them 2026-08-26, fix bug Kho bam "Thiếu LK" o Home bi highlight nham "Đơn hàng" o
  // Sidebar) - dich den THUC SU (view noi bo, xem markNavigatedAway) de App.tsx chon dung gia tri
  // active thay vi luon gan cung "dat-mua-lk".
  onLeaveForceView?: (view: string) => void;
  // Node DOM cua slot canh tieu de trang (App.tsx) - co thi "portal" thanh luong quy trinh len do
  // thay vi render 1 hang rieng ben duoi (theo yeu cau bo sung sau ra soat: "đẩy luồng thẻ quy trình
  // lên cùng dòng với tiêu đề, tiết kiệm diện tích") - dung dung pattern da co san o BacklogModule.
  headerExtra?: HTMLElement | null;
} = {}) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const addToast = useToast();
  const qc = useQueryClient();
  // "Xem chi tiet case" moi (them 2026-08-26) - man rieng cua chinh he nay (CaseDetailModal.tsx),
  // KHONG con la openCase(id, tab) cu tro toi CRM giai-trinh (khong ton tai o he da tach). Dung state
  // cuc bo o day thay vi nhan qua prop `openCase` (prop do luon undefined o App.tsx that su, xem
  // comment o khai bao ben duoi) - fallback khi khong co ai truyen openCase tu ngoai vao.
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  // CHOT 2026-08-16 (migration 0081): Tac nghiep DOC LAP khoi vai_tro="TBP DVBH" - truoc day dong
  // cung vai tro nen check thang vai_tro, gio phai doc flag rieng (khop dung canTacNghiep() backend
  // trong datMuaLinhKien.ts). BAO CHUA UPDATE truoc do la 1 bug - sua lai o day.
  const canTacNghiep = !!user?.la_tac_nghiep || user?.vai_tro === "Admin";
  // Xac nhan "linh kien dac thu" truoc buoc Tac nghiep - CHOT 2026-08-17, xem migration 0082.
  const canTPDvbhXacNhan = !!user?.la_tp_dvbh || user?.vai_tro === "Admin";
  const isGiamSat = user?.vai_tro === "Giam sat";
  // SUA 2026-08-26 (phan hoi: "man xem chi tiet case moi khong can chan them theo quyen so huu - ID
  // case chi lo qua 1 don hang nguoi dung DA duoc xem"): truoc day KTV/CTV/Tram/Ve tinh bi loai khoi
  // quyen bam mo (chot 2026-08-15) vi luc do "xem chi tiet ca" tro toi du lieu CRM case_dvbh cuc bo da
  // khong con tu khi tach he - gio GET /case-detail/:id la endpoint moi cua chinh he nay
  // (case_lookup_snapshot, xem CaseDetailModal.tsx), khong con han che do nua - moi vai tro deu xem
  // duoc chi tiet case gan voi 1 don hang minh da duoc phep xem.
  const canXemChiTietCa = true;
  // "canDatHo" (tao ho, xem "nguoi nhan hang") = KTV/Ve tinh tu tao + TN/GS tao ho - khop dung
  // canQuanLyDonHo() backend. Tach rieng khoi "canBulkTram" (quyen bulk-duyet o "Don cua toi"):
  // truoc day 2 quyen nay dung CHUNG 1 bien canCreatePhieuDat nen khi them Giam sat vao de mo tab
  // "Tao phieu dat" (bug rieng phien 14/8 - GS khong vao duoc du TaoDonTab/canQuanLy da ho tro san),
  // GS se VO TINH duoc ca giao dien bulk-duyet Tram (backend van chan dung FORBIDDEN_ROLE vi GS
  // khong phai tram_cha cua ai, nhung nut se luon that bai - trai UX). canBulkTram GIU NGUYEN tap
  // vai tro cu (KTV/Ve tinh/TN/Admin, khong Giam sat).
  const canDatHo = !!(user?.la_ktv_dvbh || user?.la_ve_tinh || canTacNghiep || isGiamSat);
  // Them (phan hoi 2026-09-10: "KTV không thấy PXK ở đâu để check khi Kho gửi hàng") - KTV/Ve tinh
  // truoc day KHONG co lich su hien tab "Phiếu xuất kho" nao, chi vao duoc PHAN UNG (Trang chu "Cần
  // làm" hoac chuong thong bao khi CO 1 PXK dang cho ho xac nhan) - khong browse duoc danh sach/lich
  // su cac PXK cua chinh minh. Backend da san sang tu truoc (scopePxkNguoiNhanHang trong
  // scopeDatMua.ts da loc dung PXK theo nguoi_nhan_hang=minh hoac ve tinh cap duoi cho ca 2 nhom nay,
  // nut "KTV đã nhận" trong PhieuXuatKhoTab.tsx cung da gate theo currentEmail===nguoi_nhan_hang chu
  // khong theo co vai tro) - chi can MO tab o FE, khong sua gi backend/PhieuXuatKhoTab.
  const isFieldKtv = !!(user?.la_ktv_dvbh || user?.la_ve_tinh);
  const canKho = !!user?.la_kho || user?.vai_tro === "Admin";
  const canKeToan = !!user?.la_ke_toan || user?.vai_tro === "Admin";
  const canQC = user?.vai_tro === "QC" || user?.vai_tro === "Admin";
  // FIX (ma tran kiem soat he thong, Van de #1, xac nhan 2026-08-24): QC THUAN (khong phai Admin) bi
  // an tab "Bao cao" - backend GET /bao-cao-tong-the gio tra 403 cho QC (xem datMuaLinhKien.ts), man
  // hinh dung cho "bao cao" cua QC la Tra hang o buoc "Cho QC xac nhan" (da co san, defaultView ben
  // duoi da tro dung vao "tra-hang" cho canQC).
  const isQCOnly = user?.vai_tro === "QC";
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #14): tab Bao cao chon layout (the StatCard ca nhan
  // hay bang pivot nhieu KTV) theo VAI TRO nguoi dang xem, KHONG con theo SO DONG du lieu tra ve nhu
  // truoc - truoc day 1 GS chi quan ly dung 1 KTV se bi rows.length<=1 nen dot ngot thay the ca nhan
  // don gian thay vi bang pivot ma cac GS khac quen dung, doi theo bien dong nhan su la khong on dinh.
  const isManagerView = canTacNghiep || canKho || canKeToan || isGiamSat || user?.vai_tro === "Admin";

  // Tab "Tao phieu dat" rieng da bo (2026-08-15, phan hoi UX #12) - gop thanh nut "+ Tao don" mo
  // Modal ngay trong "Don cua toi/Danh sach" (xem DonCuaToiTab) de toan bo xu ly nam tren 1 man
  // hinh, tranh loang thong tin.
  //
  // "tabs" o day la danh sach VIEW THAT (dung cho isValidView/defaultView/jump target "don-cua-toi"
  // ma PipelineFlow + BaoCaoTab dang goi thang o hang chuc noi - KHONG doi ten key nay). Thanh tab
  // HIEN THI thuc te (displayTabs, xem duoi) tach rieng: 3 nut "Mua hang/Cong no/Tra hang" (phan hoi
  // 2026-08-19: "tach thành Mua hàng/Công nợ/Trả hàng") deu tro ve CUNG 1 view "don-cua-toi", chi
  // khac o xemLoaiDon (nang len module, xem duoi) - giu view that lam 1 khai niem duy nhat de khong
  // phai sua lai hang chuc onJump({tab:"don-cua-toi",...}) da co san trong PipelineFlow/BaoCaoTab.
  // SUA BUG (phan hoi 2026-08-22: "test vai trò kho, kho lại đang nhìn thấy danh sách đơn chi tiết
  // của ktv đặt hàng công nợ, mua hàng, trong khi kho chỉ có chức năng khi duyệt trả hàng hoặc đóng
  // hàng gửi ktv") - "Mua hàng"/"Công nợ" (tab "Đơn của tôi") CHI thuc su co chuc nang cho nguoi TAO
  // don (canDatHo: KTV/Ve tinh/TN/GS), Tram (duyet "Cho Tram duyet"), hoac TP DVBH (duyet "Cho TBP
  // xac nhan") - Kho/Ke toan "thuan" (khong kiem them vai tro nao trong so nay) KHONG co nut hanh dong
  // nao tren 2 sub-tab nay (actionsFor() o helpers.ts khong xet canKho/canKeToan), nen truoc day chi
  // xem duoc CHI TIET don ma khong lam gi duoc - dung y hep pham vi lai theo dung 2 chuc nang that su
  // cua Kho (duyet Tra hang + dong hang gui KTV qua PXK, van con nguyen o "Trả hàng"/"Phiếu xuất kho"/
  // "Thiếu linh kiện" ben duoi, khong bi anh huong).
  const canXemDonMuaCongNo = canDatHo || !!user?.la_tram || canTPDvbhXacNhan || user?.vai_tro === "Admin";
  // FIX (phan hoi 2026-08-26: "tách riêng thẻ Trang chủ và Thiếu linh kiện thành 1 thẻ riêng trong
  // menu, không gộp chung vào Đặt mua linh kiện") - "trang-chu"/"thieu-lk" KHONG con la phan tu cua
  // mang "tabs" (thanh tab noi bo) nua - gio la 2 muc menu CAP CAO RIENG o Sidebar/BottomTabBar, vao
  // qua forceView="trang-chu"/"thieu-lk" (dung y het pattern "tra-hang" cu, xem App.tsx). "Đặt mua
  // linh kiện" gio CHI con "Mua hàng/Công nợ/Trả hàng/Phiếu xuất kho" trong thanh tab cua no.
  const tabs = [
    ...(canXemDonMuaCongNo ? [{ key: "don-cua-toi", label: "Đơn của tôi / Danh sách" }] : []),
    // Giam sat/KTV/Ve tinh them vao tab duoi - CHI de theo doi + tu xac nhan "KTV đã nhận" (khong co
    // canTacNghiep/canKho/canKeToan rieng nen khong nut hanh dong quan ly nao hien ra, xem PxkDetailModal).
    ...(canTacNghiep || canKho || canKeToan || isGiamSat || isFieldKtv ? [{ key: "phieu-xuat-kho", label: "Phiếu xuất kho" }] : []),
  ];
  // "Đơn trả hàng" KHONG con la tab rieng tren thanh menu (CHOT vong 7: "thừa" - thanh luong quy trinh
  // da co san 3 buoc bam thang vao dung day: Trả hàng KT/Kho/QC). Van GIU render/activeView cho key
  // "tra-hang" (KHONG xoa component TraHangTab) vi day la 3 buoc DUYET DAU TIEN cua luong tra hang
  // (Ke toan duyet mem/Kho xac nhan/QC xac nhan, dung bang tra_hang_log rieng - KHAC voi phieu_xuat_kho
  // nen khong the gop thanh 1 o loc trong "Phieu xuat kho") - chi khong con hien nut trong thanh tab,
  // van vao duoc qua onJump() cua PipelineFlow. canTraHangView tai dung dieu kien cu cua tab nay.
  const canTraHangView = canTacNghiep || canKho || canKeToan || canQC || isGiamSat;
  // Tab "hang cho" mac dinh THEO VAI TRO - Kho/Ke toan/QC "thuan" truoc day luon roi vao "Don cua
  // toi" - tab khong lien quan gi den viec cua ho (viec that o "Thieu linh kien"/"Phieu xuat kho"/
  // "Don tra hang"). Chi anh huong LAN DAU vao module (useLocalStorageState chi doc default nay khi
  // chua co gia tri luu san), nhung tu do khong bao gio tu doi lai (dung y muon).
  // FIX (phan hoi 2026-08-26): "trang-chu" bo khoi defaultView - "Đặt mua linh kiện" (khong forceView)
  // gio mac dinh vao "don-cua-toi" (Mua hang), vi Trang chu da co duong vao rieng o menu. Nguoi dung
  // CU co the van con gia tri "trang-chu" luu san trong localStorage (tu truoc doi nay) - isValidView
  // ben duoi se coi gia tri do la KHONG HOP LE (khong con trong tabs[]) nen tu dong fallback ve
  // tabs[0], khong can migrate du lieu thu cong.
  const defaultView = "don-cua-toi";
  const [view, setView] = useLocalStorageState("filters:dat-mua-lk-view", defaultView);
  // FIX (phan hoi 2026-08-26): "thieu-lk" van phai la view HOP LE du da bo khoi tabs[]/displayTabs
  // (khong con nut tab de bam) - PipelineFlow/MyWorkloadStrip van goi onJump({tab:"thieu-lk", filter,
  // nguoiNhanHang}) de nhay CO KEM BO LOC tu bat ky man nao (Trang chu/Dat mua linh kien/Tra hang),
  // dung setView noi bo (KHONG doi active o App.tsx) - neu isValidView tu choi gia tri nay, cu nhay se
  // AM THAM that bai (activeView roi ve tabs[0], mat het bo loc dang mang theo). "trang-chu" KHONG can
  // them vao day vi khong noi nao trong app goi onJump({tab:"trang-chu"}) ca - chi vao duoc qua muc
  // menu rieng (forceView) o duoi.
  const isValidView = (v: string) => tabs.some((t) => t.key === v) || (v === "tra-hang" && canTraHangView) || v === "thieu-lk";
  // FIX (phan hoi 2026-08-26): forceView TRUOC DAY thang tay de len activeView MOI LAN RENDER (ke ca
  // sau khi nguoi dung da tu dieu huong noi bo) - voi "tra-hang" khong sao vi TraHangTab khong co jump
  // chuyen tab nao ca, nhung "trang-chu" (TrangChuTab/BaoCaoTab ben trong) co RAT NHIEU StatCard/o so
  // goi onJump({tab:"don-cua-toi",...}) de nhay sang tab khac - neu forceView de "thang" mai mai,
  // MOI cu bam se AM THAM khong lam gi (activeView van bi ghim = "trang-chu"). `navigatedAway` danh
  // dau: 1 khi nguoi dung DA tu dieu huong (bam tab hoac jump) it nhat 1 lan trong phien mount nay -
  // tu do activeView tra ve dung `view` state binh thuong, thoat han khoi forceView.
  const [navigatedAway, setNavigatedAway] = useState(false);
  // FIX (bao cao 2026-08-26: "bấm lại Home/Chờ LK thì chỉ đổi tiêu đề, không thật sự chuyển") -
  // navigatedAway TRUOC DAY la 1 co MOT CHIEU (mot khi thanh true thi khong bao gio ve false trong
  // suot vong doi component) - dung cho lan forceView bi "ghim" DAU TIEN, nhung neu nguoi dung nhay
  // ra roi bam LAI CHINH muc menu do lan nua (vd Home -> bam so lieu nhay sang Don hang -> bam lai
  // Home o Sidebar), App.tsx doi `active`/`forceView` ve dung "trang-chu" nhu cu nhung navigatedAway
  // VAN con true tu lan truoc - activeView tiep tuc bo qua forceView vinh vien, noi dung dung nguyen
  // o "don-cua-toi" trong khi tieu de h1/Sidebar (dieu khien rieng boi `active` o App.tsx, doc lap voi
  // activeView noi bo o day) da doi dung - gay cam giac "bấm không ăn thua". Reset navigatedAway moi
  // khi forceView PROP THUC SU doi gia tri (tai-ghim moi lan nguoi dung chu dong chon lai 1 muc menu
  // cap cao), thay vi la co vinh vien cho ca vong doi component.
  useEffect(() => {
    setNavigatedAway(false);
  }, [forceView]);
  // "trang-chu"/"thieu-lk" BO QUA isValidView khi den tu forceView (khong nam trong tabs[] nen
  // isValidView("trang-chu") luon false - neu doi qua isValidView o day forceView se bi lo, roi thang
  // ve view/tabs[0], y het bug da bat gap khi tu kiem thu 2026-08-26). Quyen truy cap 2 route nay da
  // duoc gac o App.tsx (allowedModules) roi, khong can gac lai lan nua tai day.
  // FIX (UX audit 2026-09-08): fallback cu la `tabs[0]?.key ?? "don-cua-toi"` - voi QC "thuan" (khong
  // canTacNghiep/canKho/canKeToan/isGiamSat), tabs[] RONG (khong co "don-cua-toi" lan "phieu-xuat-kho")
  // nen luon roi ve "don-cua-toi" cung, du day KHONG PHAI 1 view hop le cho ho (canXemDonMuaCongNo
  // false). Hau qua: lan dau vao "Đơn hàng", thanh tab chi hien "Trả hàng" nhung noi dung lai am tham
  // render DonCuaToiTab voi xemLoaiDon mac dinh "mua" (khong tab nao duoc danh dau active) - man hinh
  // vo dung "Việc của bạn" thuc su. Uu tien "tra-hang" (hop le qua isValidView) truoc khi roi ve
  // "don-cua-toi" lam phao cuu cuoi cung.
  const activeView =
    !navigatedAway && forceView && (forceView === "trang-chu" || forceView === "thieu-lk" || isValidView(forceView))
      ? forceView
      : isValidView(view)
        ? view
        : (tabs[0]?.key ?? (canTraHangView ? "tra-hang" : "don-cua-toi"));

  // Sub-loc "Mua hang | Cong no | Tra hang" cua tab "Don cua toi" - NANG LEN module (phan hoi
  // 2026-08-19: hien thanh 3 tab thuc su o thanh tab tren cung, thay vi 1 hang nut rieng ben trong
  // DonCuaToiTab nhu truoc). So dem dong dang mo theo loai don dung CHUNG 1 query voi DonCuaToiTab
  // truoc day (react-query dedupe theo queryKey, khong ton them request).
  const [xemLoaiDon, setXemLoaiDon] = useLocalStorageState<"mua" | "cong_no" | "tra_hang">("filters:dmlk-xem-loai-don", "mua");
  const { data: loaiDonCountsData } = useQuery({
    queryKey: ["dat-mua-lk-loai-don-counts"],
    queryFn: () => api.get<{ mua: number; cong_no: number; tra_hang: number }>("/dat-mua-lk/loai-don-counts"),
  });
  const loaiDonCounts = loaiDonCountsData ?? { mua: 0, cong_no: 0, tra_hang: 0 };
  // Badge "(N)" cho tab "Phiếu xuất kho" (phan hoi 2026-08-24: "Thẻ phiếu xuất kho có đơn nhưng đang
  // không hiện (1) ở tên thẻ như thẻ trả hàng") - tong so PXK dang mo (chua xu ly xong), cung tinh
  // than voi loaiDonCounts.tra_hang o tren. CHI fetch khi tab nay thuc su hien (khop dung dieu kien o
  // mang "tabs" ben duoi) - tranh goi API thua cho KTV/Ve tinh (khong co tab nay).
  const canXemPxkTab = canTacNghiep || canKho || canKeToan || isGiamSat || isFieldKtv;
  const { data: pxkMoCountData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-mo-count"],
    queryFn: () => api.get<{ count: number }>("/phieu-xuat-kho/mo-count"),
    enabled: canXemPxkTab,
  });
  // Thanh tab HIEN THI: thay muc "don-cua-toi" bang 3 muc "don-cua-toi:<loai>" mang so dem do (badge
  // tron mau do co san trong Tabs.tsx, dung "nhu thong bao tin nhan" dung y yeu cau). Cac muc con lai
  // (phieu-xuat-kho/thieu-lk/bao-cao) giu nguyen key that.
  // SUA (cung bug canXemDonMuaCongNo o tren): KHONG con dung tabs.slice(1) - "don-cua-toi" gio la
  // PHAN TU DIEU KIEN trong `tabs` (co the vang mat), tach rieng "Mua hàng"/"Công nợ" (theo
  // canXemDonMuaCongNo) khoi phan con lai cua tabs de tranh cat nham phan tu dau tien khi "don-cua-toi"
  // khong ton tai (vd Kho-thuan).
  // FIX (phan hoi 2026-08-26): bo han "Trang chủ" khoi displayTabs - da co duong vao rieng o menu
  // (forceView="trang-chu", xem App.tsx), khong con la 1 lua chon trong thanh tab noi bo nay nua.
  const displayTabs = [
    ...(canXemDonMuaCongNo
      ? [
          { key: "don-cua-toi:mua", label: "Mua hàng", count: loaiDonCounts.mua },
          { key: "don-cua-toi:cong_no", label: "Công nợ", count: loaiDonCounts.cong_no },
        ]
      : []),
    { key: "don-cua-toi:tra_hang", label: "Trả hàng", count: loaiDonCounts.tra_hang },
    ...tabs
      .filter((t) => t.key !== "don-cua-toi")
      .map((t) => (t.key === "phieu-xuat-kho" ? { ...t, count: pxkMoCountData?.count ?? 0 } : t)),
  ];
  // SUA (phan hoi 2026-08-21: "bấm vào tab 'Trả hàng' thì giao diện danh sách lại khác giao diện khi
  // bấm trên pipeline... sao lại có 2 màn giao diện khác nhau cho cùng 1 chức năng?") - voi nguoi CO
  // quyen xu ly (canTraHangView: KT/Kho/QC/TN/GS), tab "Trả hàng" tren thanh tab gio tro THANG vao
  // view "tra-hang" (TraHangTab, man hinh day du co nut duyet/tu choi tung buoc) - GIONG HET duong vao
  // qua pipeline chevron, thay vi DonCuaToiTab loc theo loai_don='tra_hang' (chi liet ke, KHONG co nut
  // xu ly vi component do dung cho state machine dat_don_hang_log khac, khong doc/ghi tra_hang_log).
  // Nguoi TAO don (KTV/Ve tinh/Tram, khong canTraHangView) van vao DonCuaToiTab nhu cu de theo doi don
  // minh da gui - ho khong co hanh dong duyet nao nen khong can man TraHangTab.
  const displayActive =
    activeView === "don-cua-toi" ? `don-cua-toi:${xemLoaiDon}` : activeView === "tra-hang" && canTraHangView ? "don-cua-toi:tra_hang" : activeView;
  // Dem so lan nguoi dung TU BAM 1 trong 3 sub-tab Mua hang/Cong no/Tra hang (khac voi jump tu
  // pipeline) - dung lam "tin hieu" rieng cho DonCuaToiTab biet khi nao can XOA override "gop ca 2
  // loai" (xem loaiDonOverride trong DonCuaToiTab.tsx). KHONG the dung truc tiep gia tri xemLoaiDon vi
  // React se KHONG re-fire effect neu nguoi dung bam lai DUNG sub-tab dang mo san (vd dang o "Mua
  // hang" tu truoc, jump vao che do gop, roi bam lai "Mua hang" - gia tri xemLoaiDon khong doi nen 1
  // effect [xemLoaiDon] o con se bo qua, override "gop" bi ket lai mai - bug da bat gap khi tu kiem
  // thu 2026-08-21). Bo dem tang o MOI lan bam (ke ca bam lai cung sub-tab) la tin hieu dang tin cay.
  const [loaiDonTabClickSeq, setLoaiDonTabClickSeq] = useState(0);
  // FIX (phan hoi 2026-08-26): goi onLeaveForceView DUNG 1 LAN, ngay truoc khi navigatedAway chuyen
  // false -> true (dung gia tri navigatedAway HIEN TAI trong closure, KHONG doc lai sau setState vi
  // setState khong dong bo) - bao App.tsx biet da "thoat" khoi muc menu Trang chu/Thieu linh kien de
  // tu doi active, dong bo lai Sidebar/tieu de h1 voi noi dung dang xem that su.
  function markNavigatedAway(view: string) {
    if (forceView && !navigatedAway) onLeaveForceView?.(view);
    setNavigatedAway(true);
  }
  function handleTabChange(key: string) {
    markNavigatedAway(key === "don-cua-toi:tra_hang" && canTraHangView ? "tra-hang" : key.startsWith("don-cua-toi:") ? "don-cua-toi" : key);
    if (key === "don-cua-toi:tra_hang" && canTraHangView) {
      setView("tra-hang");
      setLoaiDonTabClickSeq((n) => n + 1);
    } else if (key.startsWith("don-cua-toi:")) {
      setXemLoaiDon(key.slice("don-cua-toi:".length) as "mua" | "cong_no" | "tra_hang");
      setView("don-cua-toi");
      setLoaiDonTabClickSeq((n) => n + 1);
    } else {
      setView(key);
    }
  }

  // Muc 1 (yeu cau UI mobile 2026-08-27): vuot ngang de doi giua 3 tab hien thi "Mua hang/Cong
  // no/Tra hang" (displayTabs co key "don-cua-toi:*") - tu viet tay bang touch event, KHONG them thu
  // vien gesture nao. Chi tinh delta luc touchend (khong can theo doi lien tuc trong touchmove) -
  // nguong 50px + phai lon hon 1.5 lan bien do doc de tranh nham voi cuon doc. Chi doi trong pham vi
  // cac tab dang HIEN THI thuc su (displayTabs), khong bao gio "nhay qua" sang Phieu xuat kho/Thieu
  // LK dhu displayActive dang la 1 trong 3 sub-tab do.
  const swipeTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleSwipeTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    swipeTouchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleSwipeTouchEnd(e: React.TouchEvent) {
    const start = swipeTouchStartRef.current;
    swipeTouchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const swipeKeys = displayTabs.map((tb) => tb.key).filter((k) => k.startsWith("don-cua-toi:"));
    const idx = swipeKeys.indexOf(displayActive);
    if (idx === -1) return;
    const nextIdx = idx + (dx < 0 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= swipeKeys.length) return;
    handleTabChange(swipeKeys[nextIdx]);
  }

  // Thanh tom tat + nhay dung tab/filter (tieu chi UX #1/#2) - jumpTarget tieu thu 1 lan roi tu xoa
  // (setTimeout 0 chay sau khi effect cua tab con da doc prop initialFilterOverride trong cung 1 luot
  // flush), tranh ap lai gia tri cu moi lan re-render.
  // "Buoc 0 - Tao don" tren pipeline (theo yeu cau bo sung sau ra soat) - mo TaoDonTab NGAY tai day
  // (module wrapper) thay vi qua nut rieng trong DonCuaToiTab, vi pipeline hien dung chung tren MOI
  // tab (kha nang bam "Tao don" phai co bat ke dang xem tab nao). Doc lap voi showCreate cua
  // DonCuaToiTab (khong lift state len de tranh dung cham vao luong da on dinh cua tab do).
  const [showCreateFromPipeline, setShowCreateFromPipeline] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  useEffect(() => {
    if (!jumpTarget) return;
    const t = setTimeout(() => setJumpTarget(null), 0);
    return () => clearTimeout(t);
  }, [jumpTarget]);
  // FIX (phan hoi 2026-09-05: chuong thong bao nang len App.tsx, bam 1 dong thong bao tu tab KHAC co
  // the can COLD-MOUNT ca DatMuaLinhKienModule LAN tab con lazy ben trong no cung luc - openDetailId
  // truoc day dung CHUNG co che tu-xoa qua setTimeout(0) voi jumpTarget (danh cho filter/nguoiNhanHang/
  // loaiDon, nhung 3 cai do khong tao van de vi luon co san gia tri hop le ngay ca khi bi xoa som).
  // openDetailId rieng: neu tab dich la 1 lazy chunk CHUA TUNG tai (vd nguoi dung dang o Settings, chua
  // bao gio vao "Đơn hàng"/"Phiếu xuất kho" trong phien nay), dynamic import() phai cho tai xong (bat
  // dong bo, co the lau hon setTimeout(0)) roi tab con moi mount va doc duoc prop - luc do jumpTarget
  // DA bi xoa mat, Drawer khong bao gio mo (bug that, phat hien khi kiem thu tinh nang nang chuong len
  // top). Tach rieng thanh `pendingOpenDetailId`, KHONG tu xoa qua timer - chi xoa khi CHINH tab con da
  // ap dung xong (goi lai onDetailIdConsumed, xem DonCuaToiTab.tsx/PhieuXuatKhoTab.tsx), an toan bat ke
  // tab con mount ngay (warm) hay phai cho lazy-load xong (cold).
  const [pendingOpenDetailId, setPendingOpenDetailId] = useState<{ tab: string; id: string } | null>(null);
  function jumpTo(target: JumpTarget) {
    markNavigatedAway(target.tab);
    setJumpTarget(target);
    setPendingOpenDetailId(target.openDetailId ? { tab: target.tab, id: target.openDetailId } : null);
    setView(target.tab);
  }
  function consumeOpenDetailId() {
    setPendingOpenDetailId(null);
  }
  // Nhan tin hieu tu chuong thong bao O NGOAI module (App.tsx, xem giai thich o khai bao prop
  // externalDetailOpen phia tren) - tai dung jumpTo() y het cach StatCard/pipeline noi bo van goi, chi
  // khac nguon kich hoat. Dependency la `nonce` (khong phai ca object) de bam lai DUNG 1 dong thong bao
  // vua xem van kich hoat lai effect nay ke ca id khong doi.
  useEffect(() => {
    if (!externalDetailOpen) return;
    jumpTo({ tab: externalDetailOpen.tab, filter: "", openDetailId: externalDetailOpen.id });
    onExternalDetailOpenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDetailOpen?.nonce]);
  const filterFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.filter : undefined);
  const nguoiNhanHangFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.nguoiNhanHang : undefined);
  // Them (migration 0002_tra_hang_pxk.sql) - dat truoc sub-tab loai_don cua PhieuXuatKhoTab khi bam
  // vao 1 trong 3 buoc PXK tra hang tren pipeline, cung pattern voi filterFor/nguoiNhanHangFor.
  const loaiDonFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.loaiDon : undefined);
  // Them (thong bao KTV, 2026-08-26; tach khoi jumpTarget 2026-09-05, xem comment o pendingOpenDetailId
  // phia tren) - mo thang Drawer chi tiet 1 dong khi bam "xem chi tiet" tu 1 dong thong bao.
  const openDetailIdFor = (tab: string) => (pendingOpenDetailId?.tab === tab ? pendingOpenDetailId.id : undefined);

  // Tren mobile bo han thanh "luong quy trinh" (phan hoi 2026-08-19: "bỏ tính năng này, không load,
  // không đọc, tránh tốn lượt đọc D1") - man hinh hep khong du cho hien huu ich, va day la 1 API rieng
  // (goi computeDatMuaLkBreakdown-ke tuong tu, doc nhieu bang) nen bo qua ca query (enabled: !isMobile)
  // thay vi chi an UI, tranh goi API thua tren thiet bi khong dung toi ket qua.
  const isMobile = useIsMobile();
  const { data: luongQuyTrinh } = useQuery({
    queryKey: ["dat-mua-lk-luong-quy-trinh"],
    queryFn: () => api.get<{ steps: LuongQuyTrinhStep[] }>("/dat-mua-lk/luong-quy-trinh"),
    refetchInterval: 5 * 60_000,
    enabled: !isMobile,
  });
  // FIX (phan hoi 2026-08-31: "trên app cho ktv, việc cần làm đang không đúng việc chờ ktv... tách ra
  // Cần làm và Đang tồn" + "tương tự tách ra cho tất cả các vai trò" + "TN, KT, Kho thêm 1 ô tồn đọng
  // chung toàn hệ thống") - endpoint rieng, NHE (an toan tren mobile, khac han luong-quy-trinh 16
  // subquery), la NGUON DUY NHAT cho canLam/dangTon/tonDongToanHeThong tren CA desktop lan mobile. Truoc
  // day mobile dung tam notifCounts.datMuaLk.total (gom ca don "dang tồn" cua KTV, KHONG phai viec can
  // lam that) lam "Cần làm" - day chinh la bug duoc bao cao, nay thay han bang nguon dung.
  const { data: homeSummary } = useQuery({
    queryKey: ["dat-mua-lk-home-summary"],
    queryFn: () =>
      api.get<{ canLam: number; dangTon: number; tonDongToanHeThong: number | null; dangTonSteps: DangTonStep[]; tonDongToanHeThongSteps: DangTonStep[] | null }>(
        "/dat-mua-lk/home-summary",
      ),
    refetchInterval: 5 * 60_000,
  });
  const { data: notifCounts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ datMuaLk: { total: number; choDonBiTuChoi: number }; ktvLogChuaDoc: number }>("/notifications/count"),
    refetchInterval: 5 * 60_000,
    // enabled: true (bo dieu kien isMobile cu, them 2026-08-26) - can ktvLogChuaDoc cho badge chuong
    // thong bao tren CA desktop (khong chi mobile nhu tongViecCuaToi truoc day). Sidebar.tsx/
    // BottomTabBar.tsx da fetch key nay khong dieu kien nen khong ton them request thuc te (react-query
    // chia se cache theo queryKey).
  });

  // Tap role cua nguoi dang xem, khop dung tu vung roleKeys backend tra ve - dung de to mau/phong to
  // buoc "cua minh" trong PipelineFlow. "tram": dung user.la_tram that (GD4, xem AuthContext.tsx).
  const myRoleKeys = new Set<string>();
  if (canTPDvbhXacNhan) myRoleKeys.add("tp_dvbh");
  if (canKeToan) myRoleKeys.add("ke_toan");
  if (canKho) myRoleKeys.add("kho");
  if (canQC) myRoleKeys.add("qc");
  if (canTacNghiep) myRoleKeys.add("tac_nghiep");
  // FIX (ra soat "logic sai theo vai tro" 2026-08-29): truoc day CHI check la_ktv_dvbh - Ve tinh co
  // la_ktv_dvbh=0/la_ve_tinh=1 (2 co loai tru nhau, xem provisionPlaceholderUser trong
  // settingsKtv.ts) nen KHONG BAO GIO duoc tinh la "ktv", mat het highlight/dem "viec cua toi" cho
  // buoc "Cho tien"/"KTV" du ho la nguoi thuc su phai xu ly. Giam sat tu dat don cho ban than
  // ("triển khai như ktv", xem Yeu_cau_tong_hop_du_an.md Phan E#2) cung bi thieu tuong tu.
  if (user?.la_ktv_dvbh || user?.la_ve_tinh || isGiamSat) myRoleKeys.add("ktv");
  // GD4 (phan hoi Codex #16/#17): dung truc tiep user.la_tram (tinh that o backend, GET
  // /api/auth/me) thay vi heuristic cu "la_ktv_dvbh && khong co tram_cha" - heuristic do nham moi
  // KTV thuong (khong quan ly Ve tinh nao) thanh Tram, vi tram_cha=null cung dung cho ho.
  if (user?.la_tram) myRoleKeys.add("tram");

  // FIX (ra soat 2026-08-29, cung dot voi fix myRoleKeys "ktv" o tren): s.count cua 2 buoc
  // "cho_tien"/"ktv" la SO TOAN HE THONG (dung cho bang dieu hanh chung/Tac nghiep) - nguoi xem co
  // roleKey "ktv" phai thay countCuaToi (rieng cua chinh ho, backend loc theo nguoi_nhan_hang), khong
  // phai s.count, neu khong MOI KTV/Ve tinh se thay CUNG 1 con so gom ca PXK cua nguoi khac. Tinh 1
  // lan duy nhat o day, dung chung cho moi noi tieu thu luongQuyTrinh.steps ben duoi.
  const steps = (luongQuyTrinh?.steps ?? []).map((s) =>
    myRoleKeys.has("ktv") && s.countCuaToi !== undefined ? { ...s, count: s.countCuaToi } : s,
  );

  // Tong so "viec cua toi" (phan hoi 2026-08-19: "Bỏ tiêu đề module... thay vào đó là button 'Việc
  // của tôi: N'") - tinh o CAP MODULE (khong chi trong MyWorkloadStrip) de dung cho nut thay the h1.
  // Cung logic loc "isMine && count>0" nhu MyWorkloadStrip, khong them nguon du lieu moi.
  const mySteps = steps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r)));
  // "Đơn bị từ chối" van hien rieng 1 StatCard o TrangChuTab.tsx (thong tin, khong phai "viec can lam"
  // theo nghia hang doi xu ly) - KTV-like da duoc cong vao homeSummary.canLam o backend, gia tri nay
  // chi de HIEN THI tach rieng, khong cong them lan nua vao tongViecCuaToi.
  const choDonBiTuChoi = notifCounts?.datMuaLk.choDonBiTuChoi ?? 0;
  const tongViecCuaToi = homeSummary?.canLam ?? 0;
  const dangTon = homeSummary?.dangTon ?? 0;
  const tonDongToanHeThong = homeSummary?.tonDongToanHeThong ?? null;
  const dangTonSteps = homeSummary?.dangTonSteps ?? [];
  const tonDongToanHeThongSteps = homeSummary?.tonDongToanHeThongSteps ?? null;
  // Nut tieu de bam de mo/dong bang chi tiet tung buoc (MyWorkloadStrip) - mac dinh AN (giam chrome
  // mac dinh, tiep tuc dung tinh than "gọn diện tích" da chot o cac fix truoc). CHI ap dung cho
  // duong vao "dat-mua-lk" that su (khong phai forceView="tra-hang", entry rieng van giu tieu de +
  // hien san chi tiet nhu cu vi khong co nut tieu de nao de bam mo lai).
  const [showWorkloadDetail, setShowWorkloadDetail] = useState(false);

  // SUA (phan hoi 2026-08-19: "mặc định bị thu nhỏ, không đúng ý đồ ban đầu... luôn mở") - mac dinh
  // MO SAN cho nguoi dung MOI (chua tung luu lua chon). Nut toggle van giu de nguoi dung tu thu gon
  // neu muon.
  // SUA (phan hoi chu he thong 2026-08-24: "lưu cache cách người dùng đang xem, nếu họ ẩn thì mặc
  // định ẩn ở lần mở sau") - doi tu useState (mat het moi lan tai lai trang) sang useLocalStorageState
  // (cung pattern voi filters:dat-mua-lk-view/filters:dmlk-th-tt... da dung khap module nay) - luu cuc
  // bo tren trinh duyet cua tung nguoi dung, khong dong bo len server.
  // FIX (ra soat UI 2026-08-27, hang muc #1): mac dinh "luon mo" (chot 2026-08-19) van dung cho da so
  // vai tro, nhung KTV/Ve tinh THUAN (khong mang bat ky co quan ly nao) chi lien quan 2/17 buoc nen 17
  // so mac dinh mo gay nhieu that su - thu gon SAN cho nhanh nay. CHI anh huong NGUOI DUNG MOI/chua tung
  // luu lua chon (useLocalStorageState uu tien doc localStorage neu da co, khong ghi de lua chon cu).
  const defaultPipelineCollapsed = !canTacNghiep && !canKho && !canKeToan && !isGiamSat && user?.vai_tro !== "Admin" && user?.vai_tro !== "QC";
  const [pipelineCollapsed, setPipelineCollapsed] = useLocalStorageState("filters:dmlk-pipeline-collapsed", defaultPipelineCollapsed);
  // Mobile: khong render thanh pipeline (steps rong vi query da enabled:false o tren) - chi giu lai
  // duy nhat loi tat "+ Tao don" (hanh dong, khong phai bao cao) de khong mat tinh nang tao don, vi
  // day la CACH DUY NHAT tao don tren "Don cua toi" (nut rieng da bo, xem DonCuaToiTab.tsx dong 887).
  const pipelineEl = isMobile ? (
    canDatHo && (
      <button
        type="button"
        onClick={() => setShowCreateFromPipeline(true)}
        className="focus-ring inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-primary-hover)]"
      >
        ＋ Tạo đơn
      </button>
    )
  ) : (
    <PipelineFlow
      steps={steps}
      myRoleKeys={myRoleKeys}
      onJump={jumpTo}
      onCreateDon={() => setShowCreateFromPipeline(true)}
      canCreateDon={canDatHo}
      inHeader={!!headerExtra}
      collapsed={pipelineCollapsed}
      onToggleCollapsed={() => setPipelineCollapsed((v) => !v)}
    />
  );

  // Nut "Việc của tôi: N" thay the tieu de trang h1 (phan hoi 2026-08-19) - CHI khi vao thang
  // "dat-mua-lk" (khong phai forceView="tra-hang", entry rieng do van hien tieu de MODULE_TITLES cua
  // no o App.tsx binh thuong). App.tsx da bo qua render h1 cho active==="dat-mua-lk" cu the de nhuong
  // cho o day, xem App.tsx. LUON hien (ke ca N=0) de khong bao gio bo trong khu vuc tieu de - chi
  // TAT tuong tac (khong con gi de mo rong) khi N=0.
  // SUA (phan hoi chu he thong 2026-08-24: "Cần làm: 3 sửa lại ngắn gọn trong ô tròn (3)") - bo dang
  // "Nhan: So" sang "Nhan" + 1 O TRON rieng chua so, giong ngon ngu badge thong bao da dung o noi khac
  // (vd Tabs.tsx). Giu nguyen hanh vi cu: LUON hien (ke ca N=0, chi doi mau o tron sang xam/mo thay vi
  // an han), bam mo/dong chi tiet tung buoc, disabled khi N=0.
  const titleButtonEl = !forceView ? (
    <button
      type="button"
      onClick={() => tongViecCuaToi > 0 && setShowWorkloadDetail((v) => !v)}
      disabled={tongViecCuaToi === 0}
      title={tongViecCuaToi === 0 ? undefined : showWorkloadDetail ? "Ẩn chi tiết việc cần làm" : "Xem chi tiết việc cần làm theo từng bước"}
      className="focus-ring inline-flex items-center gap-1.5 font-display text-lg sm:text-xl font-extrabold text-[var(--color-text)] enabled:hover:text-[var(--color-primary)] transition-colors whitespace-nowrap disabled:cursor-default"
    >
      <span>Cần làm</span>
      <span
        className={`inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-xs font-bold px-1 tabular-nums ${
          tongViecCuaToi > 0 ? "bg-[var(--color-warning)] text-white" : "bg-[var(--color-neutral-soft)] text-[var(--color-text-faint)]"
        }`}
      >
        {tongViecCuaToi}
      </span>
    </button>
  ) : null;
  // Chuong thong bao KTV: CHUYEN RA App.tsx (them 2026-09-05, phan hoi "chuyển vị trí chuông thông
  // báo lên top giao diện" - truoc day chi hien tren man Home, gio hien o header chung MOI tab) - xem
  // externalDetailOpen prop + useEffect xu ly no o tren.
  const headerContentEl = (
    <>
      {titleButtonEl}
      {pipelineEl}
    </>
  );

  return (
    // "dat-mua-lk-module": scope rieng cho CSS vien o nhap lieu noi bat (xem tokens.css) - yeu cau UX
    // 2026-08-19 diem 3, xac nhan CHI ap dung module nay (khong phai toan he thong).
    <div className="anim-in dat-mua-lk-module">
      {/* CHOT (theo yeu cau bo sung sau ra soat #2): co headerExtra (portal tu App.tsx, canh tieu
          de trang) thi day pipeline len do thay vi chiem 1 hang rieng ben tren Tabs - tiet kiem
          dien tich doc, dung dung pattern da co san o BacklogModule. Nut "Việc của tôi: N" (khi co)
          di CUNG portal, dat TRUOC pipeline de nam dung vi tri h1 cu. */}
      {headerExtra ? createPortal(headerContentEl, headerExtra) : headerContentEl}
      {/* UI redesign (phan hoi Codex 2026-08-19, muc P1#1) - "Viec cua toi" luon nam TRUOC Tabs, hien
          ngay khi mo module thay vi phai bam sang tab "Bao cao" moi thay (StatCard tuong tu von chi
          nam trong BaoCaoTab). Rong (return null) khi khong co viec khop role - khong chiem cho.
          SUA (phan hoi 2026-08-19): khi vao qua "dat-mua-lk" (co nut tieu de "Việc của tôi: N" o
          tren), chi tiet tung buoc nay mac dinh AN, bam nut tieu de moi mo - giam chrong mac dinh.
          Khi vao qua forceView="tra-hang" (khong co nut tieu de) van hien san nhu truoc, tranh mat
          tinh nang. FIX (phan hoi 2026-08-26): forceView="trang-chu" KHONG hien strip nay LUC MOI VAO
          (TrangChuTab da tu ve lai dung du lieu nay thanh luoi StatCard rieng ben duoi, hien them se
          trung lap) - nhung SAU KHI nguoi dung da jump/doi tab (navigatedAway=true, activeView khong
          con la "trang-chu" nua), coi nhu forceView khac binh thuong, hien lai theo dung tinh than cu. */}
      {((forceView && (navigatedAway || forceView !== "trang-chu")) || showWorkloadDetail) && (
        <MyWorkloadStrip steps={steps} myRoleKeys={myRoleKeys} onJump={jumpTo} />
      )}
      {/* FIX (phan hoi 2026-08-26): an han thanh tab noi bo khi vao qua 2 duong rieng moi
          forceView="trang-chu"/"thieu-lk" - 2 man nay gio la TRANG DOC LAP thuc su LUC MOI VAO, khong
          con hien thi cac tab con lai (Mua hang/Cong no/Tra hang/PXK) de tranh nham lan "day van la
          Dat mua linh kien". Ngay khi nguoi dung bam 1 StatCard/o so de nhay sang tab khac
          (navigatedAway=true), thanh tab HIEN LAI binh thuong de ho co duong di tiep - khong bi ket o
          1 trang cut khong co cach quay lai. forceView="tra-hang" GIU NGUYEN hanh vi cu (luon hien). */}
      {(navigatedAway || (forceView !== "trang-chu" && forceView !== "thieu-lk")) && (
        <Tabs value={displayActive} onChange={handleTabChange} tabs={displayTabs} />
      )}
      {/* FIX (phan hoi 2026-08-27: "chỉ vuốt sang phải, không vuốt ngược sang trái được") - thieu
          touch-action khien trinh duyet mobile tu quyet dinh xu ly cu chi ngang (vd cu chi "vuot canh
          man hinh de quay lai" cua Android Chrome/iOS Safari PWA), nuot mat touchend 1 chieu truoc khi
          handler nay kip chay. "pan-y" bao trinh duyet CHI tu xu ly cuon doc, nhuong toan bo cu chi
          ngang cho JS o day, ca 2 chieu deu on dinh. */}
      <div
        {...(isMobile ? { onTouchStart: handleSwipeTouchStart, onTouchEnd: handleSwipeTouchEnd } : {})}
        style={isMobile ? { touchAction: "pan-y" } : undefined}
      >
      <Suspense fallback={<TabFallback />}>
        {activeView === "trang-chu" && (
          <TrangChuTab
            steps={steps}
            myRoleKeys={myRoleKeys}
            onJump={jumpTo}
            loaiDonCounts={loaiDonCounts}
            tongViecCuaToi={tongViecCuaToi}
            dangTon={dangTon}
            dangTonSteps={dangTonSteps}
            tonDongToanHeThong={tonDongToanHeThong}
            tonDongToanHeThongSteps={tonDongToanHeThongSteps}
            choDonBiTuChoi={choDonBiTuChoi}
            canTraHangView={canTraHangView}
            isManagerView={isManagerView}
            showBaoCao={!isQCOnly}
            canTacNghiep={canTacNghiep}
            canKho={canKho}
            canKeToan={canKeToan}
            isGiamSat={isGiamSat}
          />
        )}
        {activeView === "don-cua-toi" && (
          <DonCuaToiTab
            user={user}
            addToast={addToast}
            qc={qc}
            xemLoaiDon={xemLoaiDon}
            canTacNghiep={canTacNghiep}
            canTPDvbhXacNhan={canTPDvbhXacNhan}
            // GD4 (phan hoi Codex #16/#17): dung user.la_tram that (tinh o backend qua EXISTS(users
            // WHERE tram_cha = email)) thay vi heuristic "la_ktv_dvbh/la_ve_tinh && khong co tram_cha"
            // - heuristic cu nham moi KTV thuong (kkhong quan ly Ve tinh nao, tram_cha cua CHINH ho
            // cung null) thanh Tram, khien ho mac dinh vao bucket "Cho Tram duyet" luon rong. TN
            // (canTacNghiep) van giu quyen nay khong dieu kien, khop dung y cu (tram_cha cua TN gan
            // nhu luon null nen truoc day TN cung luon lot qua dieu kien nay).
            canBulkTram={canTacNghiep || !!user?.la_tram}
            canKho={canKho}
            canKeToan={canKeToan}
            isGiamSat={isGiamSat}
            canXemChiTietCa={canXemChiTietCa}
            openCase={openCase ?? ((id) => setOpenCaseId(id))}
            initialFilterOverride={filterFor("don-cua-toi")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("don-cua-toi")}
            initialLoaiDonOverride={loaiDonFor("don-cua-toi")}
            initialDetailIdOverride={openDetailIdFor("don-cua-toi")}
            onDetailIdConsumed={consumeOpenDetailId}
            loaiDonTabClickSeq={loaiDonTabClickSeq}
          />
        )}
        {activeView === "phieu-xuat-kho" && (
          <PhieuXuatKhoTab
            addToast={addToast}
            qc={qc}
            canTacNghiep={canTacNghiep}
            canKho={canKho}
            canKeToan={canKeToan}
            currentEmail={user?.email ?? ""}
            isAdmin={user?.vai_tro === "Admin"}
            initialFilterOverride={filterFor("phieu-xuat-kho")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("phieu-xuat-kho")}
            initialLoaiDonOverride={loaiDonFor("phieu-xuat-kho")}
            initialDetailIdOverride={openDetailIdFor("phieu-xuat-kho")}
            onDetailIdConsumed={consumeOpenDetailId}
          />
        )}
        {activeView === "thieu-lk" && (
          <ThieuLkTab
            addToast={addToast}
            qc={qc}
            canKho={canKho}
            canTacNghiep={canTacNghiep}
            canKeToan={canKeToan}
            isGiamSat={isGiamSat}
            currentEmail={user?.email ?? ""}
            initialFilterOverride={filterFor("thieu-lk")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("thieu-lk")}
            initialDetailIdOverride={openDetailIdFor("thieu-lk")}
            onDetailIdConsumed={consumeOpenDetailId}
          />
        )}
        {activeView === "tra-hang" && (
          <TraHangTab
            addToast={addToast}
            qc={qc}
            canKeToan={canKeToan}
            canKho={canKho}
            canQC={canQC}
            canTacNghiep={canTacNghiep}
            currentEmail={user?.email ?? ""}
            isAdmin={user?.vai_tro === "Admin"}
            initialFilterOverride={filterFor("tra-hang")}
            initialDetailIdOverride={openDetailIdFor("tra-hang")}
            onDetailIdConsumed={consumeOpenDetailId}
          />
        )}
        {showCreateFromPipeline && (
          <TaoDonTab
            addToast={addToast}
            qc={qc}
            canQuanLy={canTacNghiep || isGiamSat}
            onClose={() => setShowCreateFromPipeline(false)}
          />
        )}
      </Suspense>
      </div>
      {openCaseId && <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} />}
    </div>
  );
}
