import { lazy, Suspense, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useIsMobile } from "../hooks/useMediaQuery";
import type { LuongQuyTrinhStep, JumpTarget, DangTonStep } from "./datMuaLinhKien/types";
import { PipelineFlow, MyWorkloadStrip } from "./datMuaLinhKien/PipelineFlow";
import { CaseDetailModal } from "./datMuaLinhKien/CaseDetailModal";
import { StageMenu, type StageMenuGroup, type StageMenuItem } from "./datMuaLinhKien/StageMenu";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { t } from "../i18n";

// FIX (phan hoi "click vào đơn chờ hàng, thẻ tab vẫn đang không được chọn" - da xay ra 2 lan lien tiep
// voi 2 muc khac nhau, "Đã gửi chờ KTV xác nhận" lan truoc va "Chờ hàng" lan nay - xac nhan day la LOI
// HE THONG chu khong phai 1 muc rieng le): DANH SACH PHANG (key, tab, filter, loaiDon) khop 1-1 voi 16
// muc trong stageMenuGroups ben duoi - dung de jumpTo() TU DONG suy ra stageKey cho MOI cach nhay toi
// (StatCard trong TrangChuTab.tsx, PipelineFlow.tsx, BaoCaoTab.tsx...), khong chi rieng StageMenu tu
// bam. Lan sua truoc (v1.125) chi vien tay stageKey cho 4 nguon StatCard cua rieng tab "phieu-xuat-kho"
// trong TrangChuTab.tsx - qua hep, "Chờ hàng" (tab "don-cua-toi") van bi bo sot. Sua tan goc: BAT KY
// jumpTo() nao co (tab,filter,loaiDon) KHOP DUNG 1 dong duoi day deu tu dong sang dung muc, khong can
// tung noi goi jumpTo() tu khai bao stageKey rieng. loaiDon: undefined nghia la KHONG so sanh cot nay
// (JumpTarget goc co the thieu loaiDon o cac tab khong dung sub-tab loai_don, vd "tra-hang"/
// "__CHO_TAO_PXK__"/"__TODAY__"/"TN tu choi" deu la "don-cua-toi" nen VAN can loaiDon:"" khop dung).
// CANH BAO: sua 1 muc trong stageMenuGroups (them/doi key/tab/filter/loaiDon) PHAI sua dong tuong ung
// o day, khong co co che tu dong dong bo 2 danh sach.
// FIX (phan hoi "click Trả·KT (từ 'Việc của tôi')... sidebar phải chọn là 'Trả hàng chờ các bên'"): 7
// buoc rieng cua rieng luong tra hang (tra_hang_kt/kho/qc/tn tren tab "tra-hang" + tra_hang_tao_pxk/
// pxk_kt/pxk_kho tren tab "phieu-xuat-kho" loaiDon:"tra_hang", xem LuongQuyTrinhStep/DangTonStep o
// backend datMuaLinhKien.ts) TRUOC DAY khong khop dong nao o day (StageMenu chi co DUY NHAT 1 muc rollup
// "tra-hang-cho" ung voi filter "__OPEN__") - moi lan bam mot trong 7 the "Trả·XX" thi StageMenu tat het,
// khong sang muc nao. Ca 7 to hop NAY DEU thuoc CUNG 1 giai doan nghiep vu "tra hang" nen deu tro ve
// chung 1 key "tra-hang-cho", khong phai quan he 1-1 nhu cac dong con lai.
// 2026-09-30: muc "Hàng trả" (tong cho KT/Kho/QC + 3 muc con) thay "tra-hang-cho"; buoc TN duyet tong gop vao "Chờ tác nghiệp".
const STAGE_MENU_TARGETS: { key: string; tab: string; filter: string; loaiDon?: string }[] = [
  { key: "hang-tra", tab: "tra-hang", filter: "__CHO_XAC_NHAN__" },
  { key: "hang-tra", tab: "tra-hang", filter: "__OPEN__" },
  { key: "hang-tra-kt", tab: "tra-hang", filter: "Cho ke toan duyet mem" },
  { key: "hang-tra-kho", tab: "tra-hang", filter: "Cho kho xac nhan" },
  { key: "hang-tra-qc", tab: "tra-hang", filter: "Cho QC xac nhan" },
  { key: "cho-tn-duyet", tab: "tra-hang", filter: "Cho TN duyet tong" },
  { key: "tong-don-hang", tab: "don-cua-toi", filter: "__OPEN__", loaiDon: "tat_ca" },
  { key: "cho-tbp", tab: "don-cua-toi", filter: "Cho TBP xac nhan", loaiDon: "" },
  { key: "cho-gs", tab: "don-cua-toi", filter: "Cho GS duyet", loaiDon: "" },
  { key: "cho-thanh-toan", tab: "don-cua-toi", filter: "Cho thanh toan", loaiDon: "" },
  { key: "cho-tn-duyet", tab: "don-cua-toi", filter: "__CHO_TN__", loaiDon: "tat_ca" },
  { key: "cho-tn-duyet", tab: "don-cua-toi", filter: "Cho TN duyet", loaiDon: "" },
  { key: "cho-hang", tab: "don-cua-toi", filter: "Cho hang", loaiDon: "" },
  { key: "cho-tao-xuat", tab: "don-cua-toi", filter: "__CHO_TAO_PXK__", loaiDon: "" },
  { key: "tu-choi", tab: "don-cua-toi", filter: "TN tu choi", loaiDon: "" },
  { key: "duyet-trong-ngay", tab: "don-cua-toi", filter: "__TODAY__", loaiDon: "" },
  { key: "tong-phieu-xuat", tab: "phieu-xuat-kho", filter: "__OPEN__", loaiDon: "" },
  { key: "cho-ktv-chuyen-tien", tab: "phieu-xuat-kho", filter: "CHO_TIEN", loaiDon: "" },
  { key: "phieu-cho-ma-hd", tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "" },
  { key: "phieu-cho-ma-misa", tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "" },
  { key: "da-chot-xong", tab: "phieu-xuat-kho", filter: "CHOT_CHUA_IN", loaiDon: "" },
  { key: "phieu-da-in", tab: "phieu-xuat-kho", filter: "DA_IN", loaiDon: "" },
  // Pipeline "Kho"/the "Kho chốt đơn xuất" nhay toi loc day du (da in + chua in) - van sang muc "Đã chốt xong".
  { key: "da-chot-xong", tab: "phieu-xuat-kho", filter: "Da chot xong don xuat", loaiDon: "" },
  { key: "dang-gui-ktv", tab: "phieu-xuat-kho", filter: "Dang gui KTV", loaiDon: "" },
  { key: "hang-tru-kho", tab: "phieu-xuat-kho", filter: "Hang tru kho", loaiDon: "" },
  { key: "kho-ket-thuc", tab: "phieu-xuat-kho", filter: "Kho da ket thuc", loaiDon: "" },
  { key: "ktv-da-nhan", tab: "phieu-xuat-kho", filter: "KTV da nhan", loaiDon: "" },
];
function matchStageKey(target: JumpTarget): string {
  if (target.stageKey !== undefined) return target.stageKey;
  const found = STAGE_MENU_TARGETS.find(
    (t) => t.tab === target.tab && t.filter === target.filter && (t.loaiDon ?? "") === (target.loaiDon ?? ""),
  );
  return found?.key ?? "";
}

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
const ThieuHangTabs = lazy(() => import("./datMuaLinhKien/NhanThieu").then((m) => ({ default: m.ThieuHangTabs })));
const NhanThieuList = lazy(() => import("./datMuaLinhKien/NhanThieu").then((m) => ({ default: m.NhanThieuList })));
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
  return <div className="text-sm text-[var(--ink-500)] py-6 text-center mt-4">{t("Đang tải...")}</div>;
}

export function DatMuaLinhKienModule({
  forceView,
  openCase,
  headerExtra,
  stageMenuSlots,
  section = "don-dat-hang",
  sidebarClick,
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
  // Node DOM cua slot long trong Sidebar dieu huong chung, ngay duoi muc "Đặt mua linh kiện" (them
  // 2026-09-11, phan hoi "không đúng tôi muốn các button này ra menu" + "đẩy nó ra sidebar" - StageMenu
  // Phase 1 TRUOC DAY la 1 rail doc rieng dat CANH noi dung, nhin nhu 2 sidebar chong nhau). Dung LAI
  // dung pattern portal voi headerExtra o tren - App.tsx giu state DOM node nay (Sidebar.tsx render ra
  // slot, App.tsx doc lai qua ref callback) vi Sidebar/Module la 2 anh em cung cap voi MainApp, khong
  // component nao la cha cua component kia. CHI dung tren desktop (xem isMobile ben duoi) - tren
  // mobile Sidebar la off-canvas (phai bam "Thêm" moi thay), giu nguyen rail ngang cu render NGAY
  // trong noi dung de khong mat kha nang nhay nhanh.
  // Tach 2 slot (2026-09-29, "tách riêng thành 2 phần: đơn đặt hàng + phiếu xuất"): nhom menu don -> slot duoi muc
  // "Đơn đặt hàng", nhom "Xuất kho" -> slot duoi muc "Phiếu xuất".
  stageMenuSlots?: { don?: HTMLElement | null; pxk?: HTMLElement | null; tra?: HTMLElement | null };
  // Muc Sidebar dang chon khi KHONG co forceView: "don-dat-hang" (dat-mua-lk) hay "phieu-xuat" - quyet dinh view mac
  // dinh luc moi vao muc (xem sectionView ben duoi).
  section?: "don-dat-hang" | "phieu-xuat" | "tra-hang";
  // Lan bam muc Sidebar (App.tsx) - "Đơn hàng" -> muc "Tổng", "Phiếu xuất" -> "Tổng phiếu" (2026-10-03).
  sidebarClick?: { key: string; nonce: number } | null;
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
  // Tat luong Ve tinh tao don (tu dong duyet 100%, chot 2026-10-14) - khop canCreatePhieuDat backend: TN/GS luon tao, Ve tinh
  // khong, con lai theo co KTV DVBH. canDatHo van dung cho quyen XEM don (Ve tinh van xem don Tram dat cho minh).
  const canTaoDon = canTacNghiep || isGiamSat || (!user?.la_ve_tinh && !!user?.la_ktv_dvbh);
  // Them (phan hoi 2026-09-10: "KTV không thấy PXK ở đâu để check khi Kho gửi hàng") - KTV/Ve tinh
  // truoc day KHONG co lich su hien tab "Phiếu xuất kho" nao, chi vao duoc PHAN UNG (Trang chu "Cần
  // làm" hoac chuong thong bao khi CO 1 PXK dang cho ho xac nhan) - khong browse duoc danh sach/lich
  // su cac PXK cua chinh minh. Backend da san sang tu truoc (scopePxkNguoiNhanHang trong
  // scopeDatMua.ts da loc dung PXK theo nguoi_nhan_hang=minh hoac ve tinh cap duoi cho ca 2 nhom nay,
  // nut "KTV đã nhận" trong PhieuXuatKhoTab.tsx cung da gate theo currentEmail===nguoi_nhan_hang chu
  // khong theo co vai tro) - chi can MO tab o FE, khong sua gi backend/PhieuXuatKhoTab.
  const isFieldKtv = !!(user?.la_ktv_dvbh || user?.la_ve_tinh);
  // Tai khoan CHI co vai tro KTV/Ve tinh (khong kiem vai tro van phong nao) - vd an nut Tai Excel o Thieu hang (2026-10-02).
  const laChiKtv = isFieldKtv && !(user?.vai_tro || user?.la_kho || user?.la_ke_toan || user?.la_tac_nghiep || user?.la_tp_dvbh || user?.la_view || user?.la_mua_hang);
  const canKho = !!user?.la_kho || user?.vai_tro === "Admin";
  const canKeToan = !!user?.la_ke_toan || user?.vai_tro === "Admin";
  const canQC = user?.vai_tro === "QC" || user?.vai_tro === "Admin";
  // FIX (ma tran kiem soat he thong, Van de #1, xac nhan 2026-08-24): QC THUAN (khong phai Admin) bi
  // an tab "Bao cao" - backend GET /bao-cao-tong-the gio tra 403 cho QC (xem datMuaLinhKien.ts), man
  // hinh dung cho "bao cao" cua QC la Tra hang o buoc "Cho QC xac nhan" (da co san, defaultView ben
  // duoi da tro dung vao "tra-hang" cho canQC).
  const isQCOnly = user?.vai_tro === "QC";
  // "Mua hang" (2026-09-30, dot 2): xem moi tab (don/PXK/tra hang/thieu LK/bao cao pivot), CHI DOC - khong co co xu ly nao
  // nen khong nut hanh dong nao hien ra; backend requireDatMuaLkArea chan moi request ghi.
  const laMuaHang = !!user?.la_mua_hang;
  // "View" (chi doc theo Khu vuc duoc gan - backend scopeDatMuaNguoiTao). SUA 2026-10-14: truoc day View khong duoc cap danh sach
  // don Mua/Cong no + Hang tra (canXemDonMuaCongNo/canTraHangView) -> man Don hang roi ve DonCuaToiTab mac dinh chi loc loai "mua",
  // khong co menu "Tổng" -> tim don CONG NO (vd Ma YCSC B1400354) ra rong. Khong co co xu ly nao nen khong hien nut thao tac.
  const laView = !!user?.la_view;
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #14): tab Bao cao chon layout (the StatCard ca nhan
  // hay bang pivot nhieu KTV) theo VAI TRO nguoi dang xem, KHONG con theo SO DONG du lieu tra ve nhu
  // truoc - truoc day 1 GS chi quan ly dung 1 KTV se bi rows.length<=1 nen dot ngot thay the ca nhan
  // don gian thay vi bang pivot ma cac GS khac quen dung, doi theo bien dong nhan su la khong on dinh.
  const isManagerView = canTacNghiep || canKho || canKeToan || isGiamSat || user?.vai_tro === "Admin" || laMuaHang;

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
  const canXemDonMuaCongNo = canDatHo || !!user?.la_tram || canTPDvbhXacNhan || user?.vai_tro === "Admin" || laMuaHang || laView;
  // FIX (phan hoi 2026-08-26: "tách riêng thẻ Trang chủ và Thiếu linh kiện thành 1 thẻ riêng trong
  // menu, không gộp chung vào Đặt mua linh kiện") - "trang-chu"/"thieu-lk" KHONG con la phan tu cua
  // mang "tabs" (thanh tab noi bo) nua - gio la 2 muc menu CAP CAO RIENG o Sidebar/BottomTabBar, vao
  // qua forceView="trang-chu"/"thieu-lk" (dung y het pattern "tra-hang" cu, xem App.tsx). "Đặt mua
  // linh kiện" gio CHI con "Mua hàng/Công nợ/Trả hàng/Phiếu xuất kho" trong thanh tab cua no.
  const tabs = [
    ...(canXemDonMuaCongNo ? [{ key: "don-cua-toi", label: t("Đơn của tôi / Danh sách") }] : []),
    // Giam sat/KTV/Ve tinh them vao tab duoi - CHI de theo doi + tu xac nhan "KTV đã nhận" (khong co
    // canTacNghiep/canKho/canKeToan rieng nen khong nut hanh dong quan ly nao hien ra, xem PxkDetailModal).
    ...(canTacNghiep || canKho || canKeToan || isGiamSat || isFieldKtv || laMuaHang || laView ? [{ key: "phieu-xuat-kho", label: t("Phiếu xuất kho"), shortLabel: t("Phiếu") }] : []),
  ];
  // "Đơn trả hàng" KHONG con la tab rieng tren thanh menu (CHOT vong 7: "thừa" - thanh luong quy trinh
  // da co san 3 buoc bam thang vao dung day: Trả hàng KT/Kho/QC). Van GIU render/activeView cho key
  // "tra-hang" (KHONG xoa component TraHangTab) vi day la 3 buoc DUYET DAU TIEN cua luong tra hang
  // (Ke toan duyet mem/Kho xac nhan/QC xac nhan, dung bang tra_hang_log rieng - KHAC voi phieu_xuat_kho
  // nen khong the gop thanh 1 o loc trong "Phieu xuat kho") - chi khong con hien nut trong thanh tab,
  // van vao duoc qua onJump() cua PipelineFlow. canTraHangView tai dung dieu kien cu cua tab nay.
  const canTraHangView = canTacNghiep || canKho || canKeToan || canQC || isGiamSat || laMuaHang || laView;
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
  }, [forceView, section]);
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
  // View mac dinh khi vua bam 1 trong 2 muc Sidebar (2026-09-29): "Phiếu xuất" -> danh sach PXK; "Đơn đặt hàng" -> view
  // don/tra hang xem lan truoc (KHONG roi vao PXK/Thieu LK con luu trong localStorage tu muc khac).
  const sectionView =
    section === "phieu-xuat"
      ? isValidView("phieu-xuat-kho") ? "phieu-xuat-kho" : null
      : section === "tra-hang"
        ? isValidView("tra-hang") ? "tra-hang" : null
      : (view === "don-cua-toi" || view === "tra-hang") && isValidView(view)
        ? view
        : canXemDonMuaCongNo ? "don-cua-toi" : canTraHangView ? "tra-hang" : null;
  const activeView =
    !navigatedAway && forceView && (forceView === "trang-chu" || forceView === "thieu-lk" || isValidView(forceView))
      ? forceView
      : !navigatedAway && !forceView && sectionView
        ? sectionView
        : isValidView(view)
        ? view
        : (tabs[0]?.key ?? (canTraHangView ? "tra-hang" : "don-cua-toi"));

  // Sub-loc "Mua hang | Cong no | Tra hang" cua tab "Don cua toi" - NANG LEN module (phan hoi
  // 2026-08-19: hien thanh 3 tab thuc su o thanh tab tren cung, thay vi 1 hang nut rieng ben trong
  // DonCuaToiTab nhu truoc). So dem dong dang mo theo loai don dung CHUNG 1 query voi DonCuaToiTab
  // truoc day (react-query dedupe theo queryKey, khong ton them request).
  const [xemLoaiDon] = useLocalStorageState<"mua" | "cong_no" | "tra_hang">("filters:dmlk-xem-loai-don", "mua");
  const { data: loaiDonCountsData } = useQuery({
    queryKey: ["dat-mua-lk-loai-don-counts"],
    queryFn: () => api.get<{ mua: number; cong_no: number; tra_hang: number }>("/dat-mua-lk/loai-don-counts"),
  });
  const loaiDonCounts = loaiDonCountsData ?? { mua: 0, cong_no: 0, tra_hang: 0 };
  // + View (2026-10-14, "la_view xem full các menu, đơn + phiếu"): chi doc, du lieu theo Khu vuc (scopePxkNguoiNhanHang).
  const canXemPxkTab = canTacNghiep || canKho || canKeToan || isGiamSat || isFieldKtv || laMuaHang || laView;
  // Badge "so luong ton" cho MOI muc StageMenu con lai (phan hoi 2026-09-11: "giống như tiêu đề
  // module 'Đặt mua linh kiện (19)' tất cả các menu đều có đếm số lượng tồn") - XAC NHAN voi nguoi
  // dung: dung dung 2 API dem-theo-trang-thai DA CO SAN cho dropdown loc cua tung tab (GET
  // /don-hang-status-counts, /phieu-xuat-kho/status-counts), KHONG tu viet cong thuc "thu hep theo
  // GS phu trach mem" nhu badge tieu de module (datMuaLk.total/computeDatMuaLkBreakdown) - so tren
  // menu PHAI khop dung so dong se thay khi bam vao (kha nang View chi thay trong Khu vuc duoc gan la
  // DUNG Y, khong phai thieu sot - 2 ham scope nay da tu ap dung dung gioi han do). queryKey/cach goi
  // GIONG HET DonCuaToiTab.tsx/TraHangTab.tsx/PhieuXuatKhoTab.tsx de dung chung cache react-query,
  // khong ton them request khi nguoi dung sau do mo dung tab tuong ung.
  const { data: donHangStatusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-status-counts", undefined],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/don-hang-status-counts"),
    enabled: canXemDonMuaCongNo,
    refetchInterval: 5 * 60_000,
  });
  const donHangStatusCounts = donHangStatusCountsData?.counts ?? {};
  // "Tổng đơn hàng" (phan hoi 2026-09-28) - dem GOP CA 3 loai (loai_don=all), cung queryKey voi dropdown
  // trang thai cua DonCuaToiTab khi dang xem gop 3 loai -> so tren menu = dung so dong "Còn tồn" hien ra.
  const { data: tatCaLoaiCountsData } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-status-counts", "all"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/don-hang-status-counts?loai_don=all"),
    enabled: canXemDonMuaCongNo,
    refetchInterval: 5 * 60_000,
  });
  const { data: traHangStatusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-don-hang-status-counts", "tra_hang"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/dat-mua-lk/don-hang-status-counts?loai_don=tra_hang"),
    enabled: canTraHangView,
    refetchInterval: 5 * 60_000,
  });
  const traHangStatusCounts = traHangStatusCountsData?.counts ?? {};
  const { data: pxkStatusCountsData } = useQuery({
    queryKey: ["dat-mua-lk-pxk-status-counts", ""],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/phieu-xuat-kho/status-counts"),
    enabled: canXemPxkTab,
    refetchInterval: 5 * 60_000,
  });
  const pxkStatusCounts = pxkStatusCountsData?.counts ?? {};
  // Dem so lan nguoi dung TU BAM 1 muc StageMenu thuoc "Đơn đặt hàng" (loaiDon:"" - che do "gop ca
  // loai") - dung lam "tin hieu" rieng cho DonCuaToiTab biet khi nao can XOA override cu (xem
  // loaiDonOverride trong DonCuaToiTab.tsx). KHONG the dung truc tiep gia tri loaiDonFor() vi React se
  // KHONG re-fire effect neu nguoi dung bam lai DUNG 1 muc menu dang mo san (gia tri "" khong doi) -
  // bug da bat gap khi tu kiem thu 2026-08-21 luc con la 3 sub-tab Tabs, van giu nguyen co che nay cho
  // StageMenu. Tang o MOI lan stageJump() toi "don-cua-toi" (xem duoi).
  const [loaiDonTabClickSeq, setLoaiDonTabClickSeq] = useState(0);
  // FIX (phan hoi 2026-08-26): goi onLeaveForceView DUNG 1 LAN, ngay truoc khi navigatedAway chuyen
  // false -> true (dung gia tri navigatedAway HIEN TAI trong closure, KHONG doc lai sau setState vi
  // setState khong dong bo) - bao App.tsx biet da "thoat" khoi muc menu Trang chu/Thieu linh kien de
  // tu doi active, dong bo lai Sidebar/tieu de h1 voi noi dung dang xem that su.
  // 2026-09-29: goi o MOI lan dieu huong (khong chi luc roi forceView) - PXK/don gio thuoc 2 muc Sidebar khac nhau,
  // App.tsx tu bo qua neu muc khong doi.
  function markNavigatedAway(view: string) {
    onLeaveForceView?.(view);
    setNavigatedAway(true);
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
  // FIX (phan hoi 2026-09-24: "click vào việc cần làm/starbar thường phải click 2 lần thì mới hiện
  // danh sách theo dạng filter") - truoc day tu XOA jumpTarget qua setTimeout(0) NGAY SAU moi lan bam,
  // khong quan tam tab dich da mount xong chua. Ca 4 tab dich (DonCuaToiTab/PhieuXuatKhoTab/ThieuLkTab/
  // TraHangTab) deu la React.lazy() - lan dau vao 1 tab trong phien (cold), import() dong bat dong bo
  // CHAM HON setTimeout(0) rat nhieu -> luc tab thuc su mount va doc initialFilterOverride/
  // initialLoaiDonOverride/initialNguoiNhanHangOverride, jumpTarget DA bi xoa mat tu truoc -> danh sach
  // roi ve filter mac dinh cua tab thay vi dung filter da bam, nguoi dung phai bam LAI lan 2 (luc nay
  // tab da "warm", mount dong bo trong cung 1 lan flush) moi thay dung danh sach. Doi sang co che "tu
  // tieu thu" giong het pendingOpenDetailId/onDetailIdConsumed ben duoi: CHI xoa khi chinh tab dich xac
  // nhan da doc xong (goi consumeJumpTarget(), xem cac tab con) - an toan vi tai 1 thoi diem CHI 1 tab
  // duoc render (activeView === "..." && <Tab/>), khong co tab nao khac tranh doc nham jumpTarget cua
  // tab kia.
  function consumeJumpTarget() {
    setJumpTarget(null);
  }
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
    // FIX (phan hoi "bấm vào thẻ thì tab trên cùng lại không ở trạng thái đang lựa chọn", lap lai 2 lan
    // voi 2 muc khac nhau) - dong bo stageMenuActiveKey voi MOI jumpTo() qua matchStageKey() (tu suy ra
    // tu tab/filter/loaiDon khop STAGE_MENU_TARGETS o dau file), khong chi rieng stageJump() (StageMenu
    // tu bam) hay cac noi goi TU KHAI BAO stageKey rieng (qua het, de sot) - AP DUNG CHUNG cho MOI
    // jumpTo() tren toan module (PipelineFlow/BaoCaoTab/TrangChuTab...). Khong khop muc nao -> "" (tat
    // StageMenu) thay vi giu sang muc CU tu lan bam truoc - "tắt" van dung hon "sang sai muc".
    setStageMenuActiveKey(matchStageKey(target));
    // FIX (phan hoi 2026-09-11: "số lượng đếm đang không khớp, ví dụ chỉ có 3 dòng nhưng đang đếm 4")
    // - 2 API dem-theo-trang-thai dung cho badge StageMenu (donHangStatusCounts/pxkStatusCounts) chi
    // refetchInterval 5 phut (giong quy uoc chung ca app) - trong he nhieu nguoi dung cung luc, 1
    // nguoi khac vua xu ly xong 1 dong la du lam so tren badge (cache rieng cua TRINH DUYET nguoi dang
    // xem) lech voi danh sach that. invalidatePipelineCounts() da goi dung sau MOI mutation cua CHINH
    // nguoi dung do, nhung khong giup ich khi lech đến tu NGUOI KHAC - invalidate lai o DAY (moi lan
    // dieu huong that su qua 1 muc StageMenu/StatCard/pipeline) de badge tu lam moi ngay truoc khi
    // nguoi dung nhin thay danh sach dich, giam toi da khoang cach giua badge va danh sach that.
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-don-hang-status-counts"] });
    qc.invalidateQueries({ queryKey: ["dat-mua-lk-pxk-status-counts"] });
  }
  function consumeOpenDetailId() {
    setPendingOpenDetailId(null);
  }
  // Bam muc Sidebar "Hàng trả" (desktop, 2026-09-30) = mo danh sach TONG cho Ke toan/Kho/QC xac nhan (khong roi vao bo
  // loc mac dinh theo vai tro cua TraHangTab). Bo qua khi dang mo tu chuong thong bao (effect ben duoi mo dung dong do).
  useEffect(() => {
    if (section !== "tra-hang" || externalDetailOpen) return;
    jumpTo({ tab: "tra-hang", filter: "__CHO_XAC_NHAN__" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
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

  // StageMenu (Phase 1, them 2026-09-11) - thay the Tabs "Mua hang/Cong no/Tra hang/Phieu xuat kho" cu
  // bang danh sach nhieu muc, moi muc = DUNG 1 trang thai/buoc xu ly that (menu "giai doan hoa" theo
  // yeu cau tham khao he AppSheet cua cong ty). "stageMenuActiveKey" chi la GOI Y hien thi (nho lai muc
  // VUA bam) - xem giai thich day du o StageMenu.tsx. Cac muc dieu huong (khong phai hanh dong) tai
  // dung HOAN TOAN jumpTo() da co san (dung y het pipeline chevron/StatCard) - loaiDon:"" o day dung
  // co che "gop ca 2/3 loai" da co san trong DonCuaToiTab/PhieuXuatKhoTab (xem loaiDonOverride), KHONG
  // phai gia tri moi.
  const [stageMenuActiveKey, setStageMenuActiveKey] = useState("");
  function stageJump(key: string, target: JumpTarget) {
    // stageKey: key (thay vi tu goi setStageMenuActiveKey(key) o day roi jumpTo() lai ghi de bang
    // target.stageKey ?? "" ngay sau - xem comment trong jumpTo()) - jumpTo() gio la NOI DUY NHAT
    // quyet dinh stageMenuActiveKey, tranh 2 nguon ghi cung 1 state chay dua nhau trong cung 1 lan bam.
    jumpTo({ ...target, stageKey: key });
    if (target.tab === "don-cua-toi") setLoaiDonTabClickSeq((n) => n + 1);
  }
  // Bam muc Sidebar "Đơn hàng"/"Phiếu xuất" (2026-10-03, "click vào đơn hàng mặc định là chọn tổng... tương tự ở phiếu") = mo
  // muc "Tổng"/"Tổng phiếu" (cung jump voi muc con). Chi theo lan BAM (nonce) - dieu huong noi bo/chuong thong bao khong doi.
  useEffect(() => {
    if (!sidebarClick || externalDetailOpen) return;
    if (sidebarClick.key === "dat-mua-lk" && canXemDonMuaCongNo) {
      stageJump("tong-don-hang", { tab: "don-cua-toi", filter: "__OPEN__", loaiDon: "tat_ca" });
    } else if (sidebarClick.key === "phieu-xuat" && canXemPxkTab) {
      stageJump("tong-phieu-xuat", { tab: "phieu-xuat-kho", filter: "__OPEN__", loaiDon: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarClick?.nonce]);
  // FIX (phan hoi 2026-09-23 "đối với vai trò nào chỉ đếm số đơn cần xử lý theo vai trò đó"): truoc
  // day dung THANG traHangStatusCounts.__OPEN__ (tong CA 4 buoc KT/Kho/QC/TN gop lai) cho MOI vai tro
  // xem - 1 QC/Ke toan/Kho/TN "thuan" (chi co dung 1 cua 4 co) se thay 1 con so bao gom ca viec KHONG
  // phai cua ho (vd QC thay ca hang doi cua Ke toan), gay hieu nham "co N viec" trong khi thuc te it
  // hon nhieu. Cong dung cac bucket theo TUNG co vai tro dang co (Admin/nguoi co nhieu co cung luc duoc
  // cong don, dung tinh chat "toi can xu ly ca 2 hang doi"). Giam sat (isGiamSat, khong co co xu ly nao
  // trong 4 co nay) giu nguyen tong __OPEN__ - ho khong dung o 1 buoc cu the nao ca, xem "toan bo" moi
  // dung vai tro giam sat.
  // "Hàng trả" (2026-09-30, phan hoi "tách riêng đơn trả hàng chờ các bên xác nhận... mục mẹ là tổng, mục con cho mỗi
  // vai trò Kế toán, Kho, QC, đếm đúng số đơn mỗi vai trò cần xử lý"): muc me = tong 3 buoc, moi muc con = so don dang
  // cho DUNG vai tro do (trong pham vi xem). Desktop: muc Sidebar rieng (section "tra-hang", portal vao stageMenuSlots.tra);
  // mobile: nam trong menu "Đơn hàng". Buoc TN duyet tong -> "Chờ tác nghiệp" (cung don mua, TN khong bo sot).
  const isMobile = useIsMobile();
  const hangTraCon: StageMenuItem[] = canTraHangView
    ? [
        { key: "hang-tra-kt", label: t("Chờ kế toán"), count: traHangStatusCounts["Cho ke toan duyet mem"],
          onClick: () => stageJump("hang-tra-kt", { tab: "tra-hang", filter: "Cho ke toan duyet mem" }) },
        { key: "hang-tra-kho", label: t("Chờ Kho"), count: traHangStatusCounts["Cho kho xac nhan"],
          onClick: () => stageJump("hang-tra-kho", { tab: "tra-hang", filter: "Cho kho xac nhan" }) },
        { key: "hang-tra-qc", label: t("Chờ QC"), count: traHangStatusCounts["Cho QC xac nhan"],
          onClick: () => stageJump("hang-tra-qc", { tab: "tra-hang", filter: "Cho QC xac nhan" }) },
      ]
    : [];
  const hangTraTong = hangTraCon.reduce((s, it) => s + (it.count ?? 0), 0);
  // "Chờ tác nghiệp" = don mua/cong no "Cho TN duyet" + don tra hang "Cho TN duyet tong" (sentinel __CHO_TN__).
  const tatCaCounts = tatCaLoaiCountsData?.counts ?? {};
  const choTacNghiepCount = (tatCaCounts["Cho TN duyet"] ?? 0) + (tatCaCounts["Cho TN duyet tong"] ?? 0);
  const stageMenuGroups: StageMenuGroup[] = [
    {
      title: t("Đơn đặt hàng"),
      items: [
        // "Tổng" (phan hoi 2026-09-28: tong don dang ton duoi moi hinh thuc theo vai tro, gop ca 3 loai, mac dinh loc
        // "Còn tồn", bo loc ben trong doi sang "Tất cả" duoc). Ten rut gon 2026-09-30.
        ...(canXemDonMuaCongNo
          ? [
              {
                key: "tong-don-hang",
                label: t("Tổng"),
                count: tatCaLoaiCountsData?.counts.__OPEN__,
                onClick: () => stageJump("tong-don-hang", { tab: "don-cua-toi", filter: "__OPEN__", loaiDon: "tat_ca" }),
              },
            ]
          : []),
        // Mobile: cum "Hàng trả" (tong + 3 muc con) nam ngay trong menu Đơn hàng (desktop co muc Sidebar rieng).
        ...(isMobile && canTraHangView
          ? [
              { key: "hang-tra", label: t("Hàng trả"), count: hangTraTong,
                onClick: () => stageJump("hang-tra", { tab: "tra-hang", filter: "__CHO_XAC_NHAN__" }) },
              ...hangTraCon.map((it) => ({ ...it, label: `· ${it.label}` })),
            ]
          : []),
        ...(canXemDonMuaCongNo
          ? [
              {
                key: "cho-tbp",
                label: t("Chờ TBP"),
                count: donHangStatusCounts["Cho TBP xac nhan"],
                onClick: () => stageJump("cho-tbp", { tab: "don-cua-toi", filter: "Cho TBP xac nhan", loaiDon: "" }),
              },
              // Tu dong duyet 100% (2026-10-14): don vuot tran cho GS duyet (ma EO) + don thieu hang cho KTV chuyen tien.
              {
                key: "cho-gs",
                label: t("Chờ GS duyệt"),
                count: donHangStatusCounts["Cho GS duyet"],
                onClick: () => stageJump("cho-gs", { tab: "don-cua-toi", filter: "Cho GS duyet", loaiDon: "" }),
              },
              {
                key: "cho-thanh-toan",
                label: t("Chờ thanh toán"),
                count: donHangStatusCounts["Cho thanh toan"],
                onClick: () => stageJump("cho-thanh-toan", { tab: "don-cua-toi", filter: "Cho thanh toan", loaiDon: "" }),
              },
              {
                key: "cho-tn-duyet",
                label: t("Chờ tác nghiệp"),
                count: choTacNghiepCount,
                onClick: () => stageJump("cho-tn-duyet", { tab: "don-cua-toi", filter: "__CHO_TN__", loaiDon: "tat_ca" }),
              },
              {
                key: "cho-hang",
                label: t("Chờ hàng"),
                count: donHangStatusCounts["Cho hang"],
                onClick: () => stageJump("cho-hang", { tab: "don-cua-toi", filter: "Cho hang", loaiDon: "" }),
              },
              // "Chờ tạo phiếu" (ten cu "Đơn chờ tạo xuất") - don "TN da duyet" CHUA gan PXK (sentinel __CHO_TAO_PXK__).
              ...(canTacNghiep
                ? [
                    {
                      key: "cho-tao-xuat",
                      label: t("Chờ tạo phiếu"),
                      count: donHangStatusCounts.__CHO_TAO_PXK__,
                      onClick: () => stageJump("cho-tao-xuat", { tab: "don-cua-toi", filter: "__CHO_TAO_PXK__", loaiDon: "" }),
                    },
                  ]
                : []),
              // "Từ chối" KHONG gan count (phan hoi 2026-09-11: "không cần đếm vì nó sẽ tăng lũy kế
              // liên tục") - khac cac trang thai cho xu ly khac (giam dan ve 0 khi xu ly xong), "TN tu
              // choi" la trang thai DONG vinh vien (khong ai "xu ly tiep" de giam so nay), so cang lon
              // theo thoi gian khong mang y nghia "backlog can lam" nhu cac badge khac.
              { key: "tu-choi", label: t("Từ chối"), onClick: () => stageJump("tu-choi", { tab: "don-cua-toi", filter: "TN tu choi", loaiDon: "" }) },
              // "Duyệt trong ngày" KHONG gan count (phan hoi 2026-09-11: dem "so luong TON" - muc nay
              // la so da XU LY XONG trong ngay, khong phai backlog dang cho, nen khong khop tinh than
              // "ton" cua yeu cau, co gan so cung de gay hieu nham day la hang cho).
              { key: "duyet-trong-ngay", label: t("Duyệt trong ngày"), onClick: () => stageJump("duyet-trong-ngay", { tab: "don-cua-toi", filter: "__TODAY__", loaiDon: "" }) },
            ]
          : []),
      ],
    },
    ...(canXemPxkTab
      ? [
          {
            title: t("Xuất kho"),
            items: [
              // "Tổng phiếu xuất" (them 2026-09-12, phan hoi "thêm mục con 'Tổng phiếu xuất' ngay bên
              // dưới") - dem so PXK "con ton" (khong thuoc 5 trang thai KET THUC: KTV da nhan / Hang tru
              // kho / Kho da ket thuc / Kho da nhan hang tra / Ke toan huy).
              // FIX (phan hoi 2026-09-23 lan 2, "tổng phiếu sẽ vẫn có thể hiện tổng phiếu... nhưng khi
              // đếm hiện số sẽ chỉ hiện phiếu tồn... ấn vào tổng phiếu sẽ có sẵn filter, ấn tắt sẽ hiện
              // cả phiếu huỷ"): thay vi tu tru tung bucket dong o day (cach cu, lan sua truoc cung ngay
              // da bi sot "Ke toan huy"), doc THANG pxkStatusCounts["__OPEN__"] - backend tra ve dung
              // dung 1 cong thuc voi GET /phieu-xuat-kho?trang_thai=__OPEN__ (xem TRANG_THAI_DONG,
              // phieuXuatKho.ts) nen KHONG the lech nua. onClick nhay toi voi filter "__OPEN__" (mac
              // dinh CHI hien phieu con ton), nguoi dung tu chon lai "Tất cả" tren dropdown status de
              // xem CA phieu da huy/hoan tat - khong an di, chi doi mac dinh.
              {
                key: "tong-phieu-xuat",
                label: t("Tổng phiếu"),
                count: pxkStatusCounts.__OPEN__,
                onClick: () => stageJump("tong-phieu-xuat", { tab: "phieu-xuat-kho", filter: "__OPEN__", loaiDon: "" }),
              },
              {
                key: "cho-ktv-chuyen-tien",
                label: t("Chờ chuyển tiền"),
                count: pxkStatusCounts.CHO_TIEN,
                onClick: () => stageJump("cho-ktv-chuyen-tien", { tab: "phieu-xuat-kho", filter: "CHO_TIEN", loaiDon: "" }),
              },
              // "Phiếu chờ mã HĐ" (doi ten tu "Tạo mã xuất kho" + DOI DICH, phan hoi 2026-09-11) - TRUOC
              // DAY trung dich voi "Chờ tạo xuất" (ca 2 cung mo Modal tao PXK, gay nham "2 nut lam 1
              // viec"). Danh sach PXK da "Dang tao phieu" VA da qua dieu kien chuyen tien (da chuyen
              // xong hoac khong can chuyen - filter="Dang tao phieu" o backend TU LOAI TRU nhanh CHO_TIEN,
              // xem comment backend/src/routes/phieuXuatKho.ts dong 175-179) = dung y "chờ TN điền hoặc
              // TN đã điền mã đơn hàng nhưng chưa ấn gửi sang kế toán". Nut "+ Tạo phiếu xuất kho" trong
              // toolbar cua PhieuXuatKhoTab van la duong vao THAT su de tao PXK moi (khong mat tinh nang).
              ...(canTacNghiep
                ? [
                    {
                      key: "phieu-cho-ma-hd",
                      label: t("Chờ mã đơn hàng"),
                      count: pxkStatusCounts["Dang tao phieu"],
                      onClick: () => stageJump("phieu-cho-ma-hd", { tab: "phieu-xuat-kho", filter: "Dang tao phieu", loaiDon: "" }),
                    },
                  ]
                : []),
              // "Phiếu chờ mã MISA" (moi, phan hoi 2026-09-11) - PXK dang "Cho ke toan" (da chot mã HĐ,
              // cho Ke toan dien ma_misa) - filter "Cho ke toan" da co san tu truoc (PXK_TRANG_THAI_OPTIONS
              // trong constants.ts), khong can sua backend.
              ...(canKeToan || canTacNghiep
                ? [
                    {
                      key: "phieu-cho-ma-misa",
                      label: t("Chờ mã MISA"),
                      count: pxkStatusCounts["Cho ke toan"],
                      onClick: () => stageJump("phieu-cho-ma-misa", { tab: "phieu-xuat-kho", filter: "Cho ke toan", loaiDon: "" }),
                    },
                  ]
                : []),
              // Thu tu 5 muc con lai KHOP DUNG trinh tu that (Da chot xong don xuat -> [Dang gui KTV ->
              // KTV da nhan] hoac [Hang tru kho] hoac [Kho da ket thuc], xem comment dau
              // backend/src/routes/phieuXuatKho.ts) - TRUOC DAY "pxk-da-duyet" (Dang gui KTV) dat LEN
              // TRUOC "Đã chốt xong đơn xuất" du xay ra SAU no trong thuc te, dong thoi nhan "Phiếu
              // xuất kho đã duyệt" khong khop dung y nghia trang thai (KHONG phai "da duyet", ma la
              // "da gui hang cho KTV, dang cho KTV xac nhan da nhan" - dung y tooltip
              // "Phiếu xuất kho đang chờ KTV xác nhận đã nhận hàng." cua chinh buoc "KTV" tren luong
              // quy trinh) - phan hoi 2026-09-11: "Thiếu giai đoạn 'Đã gửi chờ KTV xác nhận'" thuc ra
              // la do nhan cu gay hieu nham day la 1 buoc khac, khong phai thieu that.
              // "Phiếu đã in" tach rieng (chot 2026-09-29): "Đã chốt xong đơn xuất" CHI con phieu chua in (CHOT_CHUA_IN), phieu
              // da chot + da in sang muc rieng (DA_IN) - moi phieu chi nam o 1 muc.
              {
                key: "da-chot-xong",
                label: t("Chờ kho in"),
                count: pxkStatusCounts.CHOT_CHUA_IN,
                onClick: () => stageJump("da-chot-xong", { tab: "phieu-xuat-kho", filter: "CHOT_CHUA_IN", loaiDon: "" }),
              },
              {
                key: "phieu-da-in",
                label: t("Kho đã in"),
                count: pxkStatusCounts.DA_IN,
                onClick: () => stageJump("phieu-da-in", { tab: "phieu-xuat-kho", filter: "DA_IN", loaiDon: "" }),
              },
              {
                key: "dang-gui-ktv",
                label: t("Chờ KTV nhận"),
                count: pxkStatusCounts["Dang gui KTV"],
                onClick: () => stageJump("dang-gui-ktv", { tab: "phieu-xuat-kho", filter: "Dang gui KTV", loaiDon: "" }),
              },
              // 3 muc KET THUC quy trinh (KTV đã nhận / Hàng trừ kho / Kho đã kết thúc; ten rut gon + thu tu 2026-09-30) KHONG gan count (chot
              // 2026-09-29: "đến đó là kết thúc quy trình") - giong "Từ chối", so chi tang luy ke, khong phai viec can lam.
              {
                key: "ktv-da-nhan",
                label: t("KTV đã nhận"),
                onClick: () => stageJump("ktv-da-nhan", { tab: "phieu-xuat-kho", filter: "KTV da nhan", loaiDon: "" }),
              },
              {
                key: "hang-tru-kho",
                label: t("Hàng trừ kho"),
                onClick: () => stageJump("hang-tru-kho", { tab: "phieu-xuat-kho", filter: "Hang tru kho", loaiDon: "" }),
              },
              {
                key: "kho-ket-thuc",
                label: t("Kho đã kết thúc"),
                onClick: () => stageJump("kho-ket-thuc", { tab: "phieu-xuat-kho", filter: "Kho da ket thuc", loaiDon: "" }),
              },
            ],
          },
        ]
      : []),
  ];

  // Tren mobile bo han thanh "luong quy trinh" (phan hoi 2026-08-19: "bỏ tính năng này, không load,
  // không đọc, tránh tốn lượt đọc D1") - man hinh hep khong du cho hien huu ich, va day la 1 API rieng
  // (goi computeDatMuaLkBreakdown-ke tuong tu, doc nhieu bang) nen bo qua ca query (enabled: !isMobile)
  // thay vi chi an UI, tranh goi API thua tren thiet bi khong dung toi ket qua.
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
    // + nguoiNhanHang = chinh minh (2026-10-01): GS thay so PXK CUA MINH (vd 2) nhung bam vao lai ra ca khu vuc (28).
    myRoleKeys.has("ktv") && s.countCuaToi !== undefined ? { ...s, count: s.countCuaToi, nguoiNhanHang: user?.email } : s,
  );

  // "Đơn bị từ chối" van hien rieng 1 StatCard o TrangChuTab.tsx (thong tin, khong phai "viec can lam"
  // theo nghia hang doi xu ly) - KTV-like da duoc cong vao homeSummary.canLam o backend, gia tri nay
  // chi de HIEN THI tach rieng, khong cong them lan nua vao tongViecCuaToi.
  const choDonBiTuChoi = notifCounts?.datMuaLk.choDonBiTuChoi ?? 0;
  const tongViecCuaToi = homeSummary?.canLam ?? 0;
  const dangTon = homeSummary?.dangTon ?? 0;
  const tonDongToanHeThong = homeSummary?.tonDongToanHeThong ?? null;
  const dangTonSteps = homeSummary?.dangTonSteps ?? [];
  // FIX (phan hoi "Cần làm 19 nhưng bấm mở ra Việc của tôi cộng lại chỉ 17, và Kho không thấy dòng nào
  // dù canLam có tính phần của Kho"): MyWorkloadStrip TRUOC DAY nhan thang `steps` (luong-quy-trinh) -
  // NGUON KHAC voi tongViecCuaToi (homeSummary.canLam, "nguon DUNG duy nhat" theo comment dau file
  // backend GET /home-summary). 2 nguon con GAN roleKeys KHAC NHAU cho CUNG 1 trang thai (vd PXK "Dang
  // gui KTV" - luong-quy-trinh gan roleKeys:["ktv"], home-summary gan roleKeys:["kho"] vi day la buoc
  // Kho theo doi cho KTV xac nhan) khien nut tieu de dem ca dong nay cho Kho nhung strip chi tiet lai
  // khong hien dong nao tuong ung. Doi sang dung dangTonSteps.isCanLam (CHINH nguon da cong ra
  // tongViecCuaToi) - tong theo vai tro cua nguoi xem LUON khop CHINH XAC voi con so tren tieu de.
  const canLamSteps = dangTonSteps.filter((s) => s.isCanLam);
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
  // Thi diem gon man Đơn hàng (2026-10-15, phan hoi "app màu mè và rối mặt"): desktop o danh sach don cung chi giu nut
  // "＋ Tạo đơn", bo dai "Cần làm" (dai nay van o Trang chủ / Phiếu xuất / Hàng trả).
  const pipelineEl = isMobile || activeView === "don-cua-toi" ? (
    canTaoDon && (
      <button
        type="button"
        onClick={() => setShowCreateFromPipeline(true)}
        className="focus-ring inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-primary-hover)]"
      >
        {t("＋ Tạo đơn")}
      </button>
    )
  ) : (
    <PipelineFlow
      steps={steps}
      myRoleKeys={myRoleKeys}
      onJump={jumpTo}
      onCreateDon={() => setShowCreateFromPipeline(true)}
      canCreateDon={canTaoDon}
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
      title={tongViecCuaToi === 0 ? undefined : showWorkloadDetail ? t("Ẩn chi tiết việc cần làm") : t("Xem chi tiết việc cần làm theo từng bước")}
      className="focus-ring inline-flex items-center gap-1.5 font-display text-lg sm:text-xl font-extrabold text-[var(--color-text)] enabled:hover:text-[var(--color-primary)] transition-colors whitespace-nowrap disabled:cursor-default"
    >
      <span>{t("Cần làm")}</span>
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
  // Desktop danh sach don (2026-10-15, phan hoi "gộp 2 dòng này thành 1 dòng"): thanh loc/tim/tai cua DonCuaToiTab portal vao
  // o nay - CUNG hang voi "Cần làm" + "＋ Tạo đơn". Mobile giu thanh loc trong tab nhu cu.
  const [donToolbarSlot, setDonToolbarSlot] = useState<HTMLDivElement | null>(null);
  const gopToolbarDon = !isMobile && activeView === "don-cua-toi";
  const headerContentEl = (
    <>
      {titleButtonEl}
      {pipelineEl}
      {gopToolbarDon && <div ref={setDonToolbarSlot} className="flex min-w-0 flex-1 items-center" />}
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
      {/* Bo dong "Việc của tôi" tu hien (chot 2026-10-16, phan hoi "bỏ dòng việc của tôi" o man Thieu hang) - chi con hien khi bam nut
          "Cần làm" (showWorkloadDetail); viec can lam van o Sidebar/menu giai doan/Trang chu. */}
      {showWorkloadDetail && (
        <MyWorkloadStrip steps={canLamSteps} myRoleKeys={myRoleKeys} onJump={jumpTo} />
      )}
      {/* FIX (phan hoi 2026-08-26): an han thanh tab noi bo khi vao qua 2 duong rieng moi
          forceView="trang-chu"/"thieu-lk" - 2 man nay gio la TRANG DOC LAP thuc su LUC MOI VAO, khong
          con hien thi cac tab con lai (Mua hang/Cong no/Tra hang/PXK) de tranh nham lan "day van la
          Dat mua linh kien". Ngay khi nguoi dung bam 1 StatCard/o so de nhay sang tab khac
          (navigatedAway=true), thanh tab HIEN LAI binh thuong de ho co duong di tiep - khong bi ket o
          1 trang cut khong co cach quay lai. forceView="tra-hang" GIU NGUYEN hanh vi cu (luon hien). */}
      {(() => {
        // FIX (phan hoi 2026-09-23 "starbar đang auto hide khi không click vào => với QC cho auto
        // show"): QC thuan (isQCOnly, khong phai Admin) hau nhu CHI co 1 viec thuc su o day - muc
        // "Đơn trả hàng chờ xác nhận" (buoc "Cho QC xac nhan", xem stageMenuGroups) - "màn báo cáo
        // thật của QC" theo dung CLAUDE.md. Ho KHONG co ly do gi de bam sang tab khac truoc (navigatedAway
        // van false) nen bi ket o Trang chu trong khi StageMenu (noi duy nhat dan toi viec cua ho) lai
        // dang an - them isQCOnly vao dieu kien show, bo qua gate navigatedAway rieng cho QC.
        const showStageMenu = navigatedAway || (forceView !== "trang-chu" && forceView !== "thieu-lk") || isQCOnly;
        if (!showStageMenu) return null;
        // stageMenuGroups[0] = nhom don, [1] = "Xuất kho" (chi khi canXemPxkTab). Moi nhom nam duoi muc Sidebar cua no
        // (bo tieu de nhom - trung ten muc); mobile chi hien nhom cua muc dang xem.
        // Muc con chi sang khi thuoc DUNG man dang xem (bam sang muc Sidebar kia thi tat, khong sang nham nhom khac).
        const activeKey = STAGE_MENU_TARGETS.some((t) => t.key === stageMenuActiveKey && t.tab === activeView) ? stageMenuActiveKey : "";
        const donGroup = stageMenuGroups[0];
        const pxkGroup = stageMenuGroups[1];
        if (isMobile) {
          const g = activeView === "phieu-xuat-kho" && pxkGroup ? pxkGroup : donGroup;
          return <StageMenu groups={[{ items: g.items }]} activeKey={activeKey} isMobile />;
        }
        return (
          <>
            {/* Chi xo menu con cua DUNG muc dang chon (2026-09-29: "ấn menu nào thì show danh sách thuộc menu đó thôi"). */}
            {section === "tra-hang" && stageMenuSlots?.tra && hangTraCon.length > 0 &&
              createPortal(<StageMenu groups={[{ items: hangTraCon }]} activeKey={activeKey} isMobile={false} />, stageMenuSlots.tra)}
            {section === "don-dat-hang" && stageMenuSlots?.don && donGroup.items.length > 0 &&
              createPortal(<StageMenu groups={[{ items: donGroup.items }]} activeKey={activeKey} isMobile={false} />, stageMenuSlots.don)}
            {section === "phieu-xuat" && stageMenuSlots?.pxk && pxkGroup &&
              createPortal(<StageMenu groups={[{ items: pxkGroup.items }]} activeKey={activeKey} isMobile={false} />, stageMenuSlots.pxk)}
          </>
        );
      })()}
      <div className="min-w-0">
      {/* key = tab dang xem: doi tab thi go loi cu, khong ket o man bao loi (ErrorBoundary.tsx). */}
      <ErrorBoundary key={activeView}>
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
            onJumpConsumed={consumeJumpTarget}
            loaiDonTabClickSeq={loaiDonTabClickSeq}
            toolbarSlot={gopToolbarDon ? donToolbarSlot : null}
          />
        )}
        {activeView === "phieu-xuat-kho" && (
          <PhieuXuatKhoTab
            addToast={addToast}
            qc={qc}
            canTacNghiep={canTacNghiep}
            canKho={canKho}
            canKeToan={canKeToan}
            // CHOT (phan hoi nguoi dung: "bỏ quyền tải file form misa" cho KTV/Trạm/CTV/Vệ tinh) - dung
            // lai isManagerView da co san (canTacNghiep||canKho||canKeToan||isGiamSat||Admin), KHONG
            // tinh rieng bien moi, khop dung gate FORBIDDEN_ROLE da them o backend (canDownloadMisa
            // trong phieuXuatKho.ts).
            canDownloadMisa={isManagerView && (!laMuaHang || canTacNghiep || canKho || canKeToan || isGiamSat)}
            currentEmail={user?.email ?? ""}
            isAdmin={user?.vai_tro === "Admin"}
            initialFilterOverride={filterFor("phieu-xuat-kho")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("phieu-xuat-kho")}
            initialLoaiDonOverride={loaiDonFor("phieu-xuat-kho")}
            initialDetailIdOverride={openDetailIdFor("phieu-xuat-kho")}
            onDetailIdConsumed={consumeOpenDetailId}
            onJumpConsumed={consumeJumpTarget}
          />
        )}
        {activeView === "thieu-lk" && (
          <ThieuHangTabs
            list={
              <NhanThieuList
                addToast={addToast}
                canKho={canKho}
                canKeToan={canKeToan}
                canTacNghiep={canTacNghiep}
                currentEmail={user?.email ?? ""}
                isAdmin={user?.vai_tro === "Admin"}
              />
            }
          >
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
              onJumpConsumed={consumeJumpTarget}
              coTaiExcel={!laChiKtv}
            />
          </ThieuHangTabs>
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
            onJumpConsumed={consumeJumpTarget}
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
      </ErrorBoundary>
      </div>
      {openCaseId && <CaseDetailModal caseId={openCaseId} onClose={() => setOpenCaseId(null)} />}
    </div>
  );
}
