import { lazy, Suspense, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useIsMobile } from "../hooks/useMediaQuery";
import type { LuongQuyTrinhStep, JumpTarget } from "./datMuaLinhKien/types";
import { PipelineFlow, MyWorkloadStrip } from "./datMuaLinhKien/PipelineFlow";

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
}: {
  forceView?: string;
  openCase?: (id: string, tab?: string) => void;
  // Node DOM cua slot canh tieu de trang (App.tsx) - co thi "portal" thanh luong quy trinh len do
  // thay vi render 1 hang rieng ben duoi (theo yeu cau bo sung sau ra soat: "đẩy luồng thẻ quy trình
  // lên cùng dòng với tiêu đề, tiết kiệm diện tích") - dung dung pattern da co san o BacklogModule.
  headerExtra?: HTMLElement | null;
} = {}) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const addToast = useToast();
  const qc = useQueryClient();

  // CHOT 2026-08-16 (migration 0081): Tac nghiep DOC LAP khoi vai_tro="TBP DVBH" - truoc day dong
  // cung vai tro nen check thang vai_tro, gio phai doc flag rieng (khop dung canTacNghiep() backend
  // trong datMuaLinhKien.ts). BAO CHUA UPDATE truoc do la 1 bug - sua lai o day.
  const canTacNghiep = !!user?.la_tac_nghiep || user?.vai_tro === "Admin";
  // Xac nhan "linh kien dac thu" truoc buoc Tac nghiep - CHOT 2026-08-17, xem migration 0082.
  const canTPDvbhXacNhan = !!user?.la_tp_dvbh || user?.vai_tro === "Admin";
  const isGiamSat = user?.vai_tro === "Giam sat";
  // UI xem chi tiet ca (case_dvbh, du lieu CRM noi bo) khong danh cho KTV/CTV/Tram (deu la co
  // la_ktv_dvbh/la_ve_tinh) - chot voi chu he thong 2026-08-15: cot "Ma yeu cau su co" van hien gia
  // tri cho nhom nay, chi khong bam mo duoc. Kho/Ke toan/QC/GS/TN/Admin van xem duoc binh thuong.
  const canXemChiTietCa = !(user?.la_ktv_dvbh || user?.la_ve_tinh);
  // "canDatHo" (tao ho, xem "nguoi nhan hang") = KTV/Ve tinh tu tao + TN/GS tao ho - khop dung
  // canQuanLyDonHo() backend. Tach rieng khoi "canBulkTram" (quyen bulk-duyet o "Don cua toi"):
  // truoc day 2 quyen nay dung CHUNG 1 bien canCreatePhieuDat nen khi them Giam sat vao de mo tab
  // "Tao phieu dat" (bug rieng phien 14/8 - GS khong vao duoc du TaoDonTab/canQuanLy da ho tro san),
  // GS se VO TINH duoc ca giao dien bulk-duyet Tram (backend van chan dung FORBIDDEN_ROLE vi GS
  // khong phai tram_cha cua ai, nhung nut se luon that bai - trai UX). canBulkTram GIU NGUYEN tap
  // vai tro cu (KTV/Ve tinh/TN/Admin, khong Giam sat).
  const canDatHo = !!(user?.la_ktv_dvbh || user?.la_ve_tinh || canTacNghiep || isGiamSat);
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
  // Tab "Trang chu" (them 2026-08-24) - LUON hien cho MOI vai tro, khong dieu kien theo flag nao ca
  // (khop dung MODULES.home cua concept 1: `m.key==="home" || ...` - "home" khong nam trong dieu kien
  // flag). Dat DAU TIEN trong mang "tabs" (view that) de lam defaultView moi ben duoi.
  const tabs = [
    { key: "trang-chu", label: "Trang chủ" },
    ...(canXemDonMuaCongNo ? [{ key: "don-cua-toi", label: "Đơn của tôi / Danh sách" }] : []),
    // Giam sat them vao tab duoi - CHI de theo doi (khong co canTacNghiep/canKho/canKeToan rieng nen
    // khong nut hanh dong nao hien ra, xem PxkDetailModal).
    ...(canTacNghiep || canKho || canKeToan || isGiamSat ? [{ key: "phieu-xuat-kho", label: "Phiếu xuất kho" }] : []),
    { key: "thieu-lk", label: "Thiếu linh kiện" },
    // Tab "Báo cáo" rieng DA BO (phan hoi chu he thong 2026-08-24: "Trang chủ với báo cáo gộp làm 1")
    // - noi dung (12 chi so tong quan, phan hoi UX muc 6) gio nam NGAY TRONG "Trang chủ" (xem
    // TrangChuTab.tsx), van chi hien cho vai tro KHAC QC (showBaoCaoTrongTrangChu ben duoi, giu dung
    // Fix Van de #1: QC khong duoc xem bao cao pivot toan he thong).
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
  // SUA (them Trang chu 2026-08-24): defaultView gio LUON la "trang-chu" (khop concept 1 - moi vai
  // tro deu vao Trang chu truoc tien) thay cho logic re nhanh theo canKho/canKeToan/canQC cu. Vi
  // useLocalStorageState CHI doc gia tri default nay khi nguoi dung CHUA TUNG luu view nao truoc do
  // (xem comment goc cua hook), thay doi nay CHI anh huong nguoi dung MOI - ai da tung vao module va
  // co gia tri luu san (vd "thieu-lk" cua Kho) se KHONG bi doi ve Trang chu, giu nguyen trai nghiem cu.
  const defaultView = "trang-chu";
  const [view, setView] = useLocalStorageState("filters:dat-mua-lk-view", defaultView);
  const isValidView = (v: string) => tabs.some((t) => t.key === v) || (v === "tra-hang" && canTraHangView);
  const activeView = forceView && isValidView(forceView) ? forceView : isValidView(view) ? view : (tabs[0]?.key ?? "don-cua-toi");

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
  const canXemPxkTab = canTacNghiep || canKho || canKeToan || isGiamSat;
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
  // "trang-chu" dat DAU TIEN (khop yeu cau UX "Trang chu la view mac dinh moi") - tach rieng khoi
  // tabs.filter() ben duoi (giong "don-cua-toi") de khong bi xen giua cac muc "Mua hang/Cong no/Tra
  // hang".
  const displayTabs = [
    { key: "trang-chu", label: "Trang chủ" },
    ...(canXemDonMuaCongNo
      ? [
          { key: "don-cua-toi:mua", label: "Mua hàng", count: loaiDonCounts.mua },
          { key: "don-cua-toi:cong_no", label: "Công nợ", count: loaiDonCounts.cong_no },
        ]
      : []),
    { key: "don-cua-toi:tra_hang", label: "Trả hàng", count: loaiDonCounts.tra_hang },
    ...tabs
      .filter((t) => t.key !== "don-cua-toi" && t.key !== "trang-chu")
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
  function handleTabChange(key: string) {
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
  function jumpTo(target: JumpTarget) {
    setJumpTarget(target);
    setView(target.tab);
  }
  const filterFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.filter : undefined);
  const nguoiNhanHangFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.nguoiNhanHang : undefined);
  // Them (migration 0002_tra_hang_pxk.sql) - dat truoc sub-tab loai_don cua PhieuXuatKhoTab khi bam
  // vao 1 trong 3 buoc PXK tra hang tren pipeline, cung pattern voi filterFor/nguoiNhanHangFor.
  const loaiDonFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.loaiDon : undefined);

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
  // SUA BUG (phan hoi 2026-08-22: "test vai trò TBP trên điện thoại thì việc cần làm = 0 trong khi có
  // 1 việc chờ xác nhận") - tongViecCuaToi truoc day CHI tinh tu luongQuyTrinh (bi tat han tren mobile,
  // xem comment o tren), nen luon = 0 bat ke vai tro. Dung LAI query "notifications-count" (cung
  // queryKey/queryFn voi TopBar.tsx - TopBar luon mount song song nen react-query CHIA SE 1 ket qua
  // duy nhat, khong ton them luot doc D1 nao) - endpoint nay CHI tra 1 tong so da loc theo vai tro
  // (khong tra breakdown tung buoc nhu luong-quy-trinh) nen van giu dung tinh than "khong tai them du
  // lieu nang tren mobile", chi doi NGUON tinh tongViecCuaToi khi o mobile.
  const { data: notifCounts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ datMuaLk: { total: number } }>("/notifications/count"),
    refetchInterval: 5 * 60_000,
    enabled: isMobile,
  });

  // Tap role cua nguoi dang xem, khop dung tu vung roleKeys backend tra ve - dung de to mau/phong to
  // buoc "cua minh" trong PipelineFlow. "tram": dung user.la_tram that (GD4, xem AuthContext.tsx).
  const myRoleKeys = new Set<string>();
  if (canTPDvbhXacNhan) myRoleKeys.add("tp_dvbh");
  if (canKeToan) myRoleKeys.add("ke_toan");
  if (canKho) myRoleKeys.add("kho");
  if (canQC) myRoleKeys.add("qc");
  if (canTacNghiep) myRoleKeys.add("tac_nghiep");
  if (user?.la_ktv_dvbh) myRoleKeys.add("ktv");
  // GD4 (phan hoi Codex #16/#17): dung truc tiep user.la_tram (tinh that o backend, GET
  // /api/auth/me) thay vi heuristic cu "la_ktv_dvbh && khong co tram_cha" - heuristic do nham moi
  // KTV thuong (khong quan ly Ve tinh nao) thanh Tram, vi tram_cha=null cung dung cho ho.
  if (user?.la_tram) myRoleKeys.add("tram");

  // Tong so "viec cua toi" (phan hoi 2026-08-19: "Bỏ tiêu đề module... thay vào đó là button 'Việc
  // của tôi: N'") - tinh o CAP MODULE (khong chi trong MyWorkloadStrip) de dung cho nut thay the h1.
  // Cung logic loc "isMine && count>0" nhu MyWorkloadStrip, khong them nguon du lieu moi.
  const mySteps = (luongQuyTrinh?.steps ?? []).filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r)));
  const tongViecCuaToi = isMobile ? (notifCounts?.datMuaLk.total ?? 0) : mySteps.reduce((sum, s) => sum + s.count, 0);
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
  const [pipelineCollapsed, setPipelineCollapsed] = useLocalStorageState("filters:dmlk-pipeline-collapsed", false);
  // Mobile: khong render thanh pipeline (steps rong vi query da enabled:false o tren) - chi giu lai
  // duy nhat loi tat "+ Tao don" (hanh dong, khong phai bao cao) de khong mat tinh nang tao don, vi
  // day la CACH DUY NHAT tao don tren "Don cua toi" (nut rieng da bo, xem DonCuaToiTab.tsx dong 887).
  const pipelineEl = isMobile ? (
    canDatHo && (
      <button
        type="button"
        onClick={() => setShowCreateFromPipeline(true)}
        className="focus-ring inline-flex items-center gap-1 rounded-full bg-[var(--teal-500)] text-white px-3 py-1.5 text-xs font-semibold hover:brightness-95"
      >
        ＋ Tạo đơn
      </button>
    )
  ) : (
    <PipelineFlow
      steps={luongQuyTrinh?.steps ?? []}
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
      className="focus-ring inline-flex items-center gap-1.5 font-display text-lg sm:text-xl font-extrabold text-[var(--ink-900)] enabled:hover:text-[var(--ocean-800)] transition-colors whitespace-nowrap disabled:cursor-default"
    >
      <span>Cần làm</span>
      <span
        className={`inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-xs font-bold px-1 tabular-nums ${
          tongViecCuaToi > 0 ? "bg-[var(--coral-500)] text-white" : "bg-[var(--surface-100)] text-[var(--ink-400)]"
        }`}
      >
        {tongViecCuaToi}
      </span>
    </button>
  ) : null;
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
          tinh nang. */}
      {(forceView || showWorkloadDetail) && <MyWorkloadStrip steps={luongQuyTrinh?.steps ?? []} myRoleKeys={myRoleKeys} onJump={jumpTo} />}
      <Tabs active={displayActive} onChange={handleTabChange} tabs={displayTabs} />
      <Suspense fallback={<TabFallback />}>
        {activeView === "trang-chu" && (
          <TrangChuTab
            steps={luongQuyTrinh?.steps ?? []}
            myRoleKeys={myRoleKeys}
            onJump={jumpTo}
            loaiDonCounts={loaiDonCounts}
            tongViecCuaToi={tongViecCuaToi}
            canTraHangView={canTraHangView}
            isManagerView={isManagerView}
            showBaoCao={!isQCOnly}
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
            canXemChiTietCa={canXemChiTietCa}
            openCase={openCase}
            initialFilterOverride={filterFor("don-cua-toi")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("don-cua-toi")}
            initialLoaiDonOverride={loaiDonFor("don-cua-toi")}
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
          />
        )}
        {activeView === "thieu-lk" && (
          <ThieuLkTab addToast={addToast} qc={qc} canKho={canKho} canTacNghiep={canTacNghiep} currentEmail={user?.email ?? ""} initialFilterOverride={filterFor("thieu-lk")} />
        )}
        {activeView === "tra-hang" && (
          <TraHangTab addToast={addToast} qc={qc} canKeToan={canKeToan} canKho={canKho} canQC={canQC} canTacNghiep={canTacNghiep} initialFilterOverride={filterFor("tra-hang")} />
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
  );
}
