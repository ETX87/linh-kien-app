import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { khoiDongCacheTinh, theoDoiPhienBan } from "./lib/tinhCache";
import { useAuth } from "./auth/AuthContext";
import type { ViewAsRole } from "./auth/viewAsRoles";
import { VIEW_AS_LABELS } from "./auth/viewAsRoles";
import { doiXemNhu } from "./layout/XemNhuNguoiDung";
import { LoginScreen } from "./login/LoginScreen";
import { Sidebar } from "./layout/Sidebar";
import { TopBarActions } from "./layout/TopBarActions";
import { TopBar } from "./layout/TopBar";
import { BottomTabBar } from "./layout/BottomTabBar";
import { HoiDapWidget } from "./components/hoiDap/HoiDapWidget";
import { NutNopQuyNoi } from "./modules/quyChuyenTien/NutNopQuyNoi";
import { NutNopTienKeToan } from "./modules/quyChuyenTien/NutNopTienKeToan";
import { ROLE_MODULES, MODULE_TITLES, NAV_GROUPS } from "./layout/navConfig";
import { DatMuaLinhKienModule } from "./modules/DatMuaLinhKienModule";
import { DanhMucLinhKienModule, XemLinhKienDrawer } from "./modules/DanhMucLinhKienModule";
import { khopTim } from "./lib/boDau";
import { TonKhoKtvModule } from "./modules/TonKhoKtvModule";
import { DanhSachKtvModule } from "./modules/DanhSachKtvModule";
import { QuyChuyenTienModule } from "./modules/QuyChuyenTienModule";
import { HoiDapModule } from "./modules/HoiDapModule";
import { BaoCaoTocDoXuLyModule } from "./modules/BaoCaoTocDoXuLyModule";
import { NotificationBell } from "./modules/datMuaLinhKien/NotificationBell";
import { SettingsModule } from "./modules/SettingsModule";
import { UsersModule } from "./modules/UsersModule";
import { api } from "./api/client";
import { useIsMobile } from "./hooks/useMediaQuery";
import { useExitConfirm } from "./hooks/useExitConfirm";
import { pushOverlayClose } from "./lib/overlayStack";
import { CommandPalette, type CommandItem } from "./components/ui/CommandPalette";
import { Modal } from "./components/ui/Modal";
import { Btn } from "./components/ui/Btn";
import { consumePendingPxkDeepLinkId } from "./lib/pxkDeepLink";
import { t } from "./i18n";

// Shell RUT GON tu frontend/src/App.tsx cua he DVBH goc - he doc lap nay CHI phuc vu 1 mien nghiep
// vu (Dat mua linh kien + Tra hang + Danh muc linh kien + Settings/Users quan tri), nen KHONG con
// CaseDetail/caseStack/openCase (khong co case_dvbh cuc bo - xem CLAUDE.md), khong con GreetingPopup/
// bao cao 08:00/tim kiem case (thuoc mien nghiep vu khac o he goc, khong tach sang day).
const ACTIVE_MODULE_KEY = "dat_mua_lk_active_module";

// FIX (phan hoi 2026-09-05: "dưới tên người dùng đang không hiện vai trò của họ") - truoc day moi
// noi (Sidebar/TopBar/TopBarActions) chi nhan dung `role ?? "Đặt mua linh kiện"`: voi tai khoan
// vai_tro=NULL (KTV/CTV/Tram/Ve tinh/Kho/Ke toan/TN/TBP/View - dung 7 co nghiep vu thay vi vai_tro),
// dong subtitle luon hien ten UNG DUNG chung "Đặt mua linh kiện" thay vi vai tro THAT cua ho. Ham nay
// tra ve dung (cac) co dang bat, join bang " · " neu vo tinh bat nhieu co cung luc - chi fallback ve
// ten ung dung khi KHONG co vai_tro lan co nao (khong nen xay ra, xem laTaiKhoanMuaHangThuanTuy).
function roleDisplayLabel(user: { vai_tro: string | null; la_kho: boolean; la_ke_toan: boolean; la_tac_nghiep: boolean; la_tp_dvbh: boolean; la_ktv_dvbh: boolean; la_ve_tinh: boolean; la_view: boolean; la_mua_hang: boolean }): string {
  if (user.vai_tro) return user.vai_tro;
  const labels: string[] = [];
  if (user.la_kho) labels.push("Kho");
  if (user.la_ke_toan) labels.push(t("Kế toán"));
  // Ke toan duoc server cap them la_tac_nghiep (lam thay TN, 2026-10-15) - khong hien them nhan TN.
  if (user.la_tac_nghiep && !user.la_ke_toan) labels.push(t("Tác nghiệp (TN)"));
  if (user.la_tp_dvbh) labels.push("TP DVBH");
  if (user.la_ktv_dvbh) labels.push("KTV DVBH");
  if (user.la_ve_tinh) labels.push(t("Vệ tinh"));
  if (user.la_view) labels.push("View");
  if (user.la_mua_hang) labels.push(t("Mua hàng"));
  return labels.length ? labels.join(" · ") : t("Đặt mua linh kiện");
}

export function App() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--ink-700)] text-xl font-bold">{t("Đang tải…")}</div>
      </div>
    );
  }
  if (auth.status === "anonymous") return <LoginScreen variant="login" />;
  if (auth.status === "pending") return <LoginScreen variant="pending" />;
  if (auth.status === "rejected") return <LoginScreen variant="rejected" />;
  if (auth.status === "disabled") return <LoginScreen variant="disabled" />;

  return (
    <CacheTinhGate scope={`${auth.user.email}|${auth.viewAsRole ?? ""}${auth.viewAsUser ? "|xem-nhu" : ""}`}>
      <MainApp user={auth.user} realIsAdmin={auth.realIsAdmin} viewAsRole={auth.viewAsRole} viewAsUser={auth.viewAsUser} />
    </CacheTinhGate>
  );
}

// Nap du lieu tinh (danh ba, khu vuc, ly do cham...) tu cache tren may TRUOC khi render module - xem lib/tinhCache.ts.
// Cho toi da ~1,5 giay (doc IndexedDB + hoi phien ban server song song) roi render binh thuong.
function CacheTinhGate({ scope, children }: { scope: string; children: ReactNode }) {
  const qc = useQueryClient();
  const [san, setSan] = useState(false);
  useEffect(() => {
    let huy = false;
    void khoiDongCacheTinh(qc, scope).finally(() => {
      if (!huy) setSan(true);
    });
    const boTheoDoi = theoDoiPhienBan(qc);
    return () => {
      huy = true;
      boTheoDoi();
    };
  }, [qc, scope]);
  if (!san) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--ink-700)] text-xl font-bold">{t("Đang tải…")}</div>
      </div>
    );
  }
  return <>{children}</>;
}

function MainApp({
  user,
  realIsAdmin,
  viewAsRole,
  viewAsUser,
}: {
  user: Extract<ReturnType<typeof useAuth>, { status: "authenticated" }>["user"];
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
  viewAsUser: { email: string; ten: string | null } | null;
}) {
  const role = user.vai_tro;
  // Tai khoan "chi Dat mua linh kien" - vai_tro=NULL CO CHU DICH (KTV/CTV/Tram/Ve tinh/Kho/Ke toan),
  // dung y giong he goc: khong tham gia mien nghiep vu nao khac, chi vao duoc qua cac co vai tro rieng.
  // + la_mua_hang (2026-09-30): tai khoan CHI co co "Mua hang" truoc day roi vao man "cho duyet" (LoginScreen pending).
  const laTaiKhoanMuaHangThuanTuy = !role && !!(user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh || user.la_view || user.la_mua_hang);
  let allowedModules = role === "Admin" ? ROLE_MODULES.Admin : role ? (ROLE_MODULES[role] ?? []) : [];
  // Cap them "dat-mua-lk"/"tra-hang" tu dong khi bat 1 trong 7 co "Dat mua linh kien" (la_view them
  // 2026-08-26 - "View" CHI doc, du lieu gioi han theo Khu vuc gan cho tai khoan, xem
  // lib/scopeDatMua.ts/khuVucViewEmailInSql()), va "danh-muc-lk" khi bat xem_danh_muc_lk/
  // quan_ly_danh_muc_lk - PHAI khop dung backend/src/middleware/requireDatMuaLkArea.ts +
  // requireQuanLyDanhMucLk.ts (khong co co che dung chung giua 2 codebase Workers/Vite nen phai tu
  // dong bo tay khi doi 1 ben).
  if (role !== "Admin" && (user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh || user.la_view)) {
    // "trang-chu"/"thieu-lk" them vao day (phan hoi 2026-08-26: tach thanh muc menu rieng, truoc day
    // la 2 tab NOI BO cua "dat-mua-lk" hien khong dieu kien theo flag nao - gio phai duoc cap o day de
    // giu dung pham vi truy cap cu). "trang-chu" dat DAU TIEN de lam allowedModules[0] (tab mac dinh).
    // "ton-kho-ktv" them 2026-08-29 (chuyen ra khoi Settings) - CA 7 co deu duoc cap muc menu, du lieu
    // XEM DUOC loc rieng theo tung co o backend (scopeKtvTonKho() trong routes/ktvTonKho.ts) - PHAI
    // khop voi requireDatMuaLkArea.ts (dung lai lam module gate cho ca router ktvTonKho.ts).
    allowedModules = [...new Set([...allowedModules, "trang-chu", "dat-mua-lk", "thieu-lk", "tra-hang", "ton-kho-ktv"])];
  }
  // "Mua hang" (2026-09-30, dot 2): xem TOAN BO cac man nghiep vu, CHI DOC (backend requireDatMuaLkArea chan ghi, scope
  // tra null - lib/scopeDatMua.ts). KHONG gom "Báo cáo tốc độ xử lý" (chi Admin + View, danh gia nhan su).
  if (role !== "Admin" && user.la_mua_hang) {
    // + "hoi-dap" (2026-10-17): quan ly ticket hoi dap KTV <-> Mua hang (khop laXuLy() o backend routes/hoiDap.ts). Admin co qua ROLE_MODULES.
    allowedModules = [...new Set([...allowedModules, "trang-chu", "dat-mua-lk", "phieu-xuat", "thieu-lk", "tra-hang", "ton-kho-ktv", "quy-chuyen-tien", "hoi-dap"])];
  }
  // "Phiếu xuất" (tach khoi "Đặt mua linh kiện" 2026-09-29) - khop canXemPxkTab o DatMuaLinhKienModule.tsx (TN/Kho/Ke
  // toan/GS/KTV/Ve tinh). Admin + "Giam sat" da co qua ROLE_MODULES.
  if (role !== "Admin" && (user.la_tac_nghiep || user.la_kho || user.la_ke_toan || user.la_ktv_dvbh || user.la_ve_tinh)) {
    allowedModules = [...new Set([...allowedModules, "phieu-xuat"])];
  }
  // "Mua hang" (2026-09-30, migration 0053) - xet duyet ma LK moi o Bang gia (dot 1 chi vao Bang gia).
  // TN/Ke toan (2026-10-02): bat/tat "Đặc thù" nhanh o Bang gia (PATCH /settings/linh-kien/:ma/dac-thu).
  // Kho (2026-10-22, v1.390): quan ly nhom LK thay the (tab "Linh kiện thay thế") - xem coQuyenSuaThayThe.
  if (role !== "Admin" && (user.xem_danh_muc_lk || user.quan_ly_danh_muc_lk || user.la_mua_hang || user.la_tac_nghiep || user.la_ke_toan || user.la_kho)) {
    allowedModules = [...new Set([...allowedModules, "danh-muc-lk"])];
  }
  // "Tốc độ xử lý" (them 04/09/2026) - RIENG cho la_view (KHONG gop vao khoi 7 co "Dat mua linh kien"
  // o tren, vi 6 co con lai - la_kho/la_ke_toan/la_tac_nghiep/.../vai_tro Giam sat - KHONG duoc xem
  // bao cao nay, du co quyen vao module dat-mua-lk) - xem backend/src/routes/baoCaoTocDoXuLy.ts gate.
  // + 2026-10-14 ("la_view xem full các menu, đơn + phiếu"): View vao MOI man nghiep vu nhu Mua hang (Phiếu xuất, Quỹ &
  // chuyển tiền, Bảng giá), CHI DOC (backend requireDatMuaLkArea chan ghi), du lieu don/PXK/quy van theo Khu vuc duoc gan.
  if (role !== "Admin" && user.la_view) {
    allowedModules = [...new Set([...allowedModules, "bao-cao-toc-do", "phieu-xuat", "quy-chuyen-tien", "danh-muc-lk"])];
  }
  // "Danh sách KTV" (them 2026-09-05, phan hoi "đẩy ra menu để các vai trò nhân viên văn phòng có thể
  // xem được thông tin") - MOI vai tro KHONG PHAI ban than KTV/CTV/Tram/Ve tinh deu xem duoc (TN/Kho/
  // Ke toan/TBP/QC/Giam sat/View...) - backend GET /settings/ktv-lien-he da khong gioi han gi them
  // ngoai dang nhap+duyet nen chi can mo them muc menu o day. Ke toan duoc uy quyen sua rieng 3 truong
  // (xem DanhSachKtvModule.tsx -> KtvTab mode="ke-toan" + PATCH /:ma/cong-no-misa).
  if (role !== "Admin" && !user.la_ktv_dvbh && !user.la_ve_tinh) {
    allowedModules = [...new Set([...allowedModules, "danh-sach-ktv"])];
  }
  // "Báo cáo tốc độ xử lý" mo cho MOI nhan vien van phong (chot 2026-10-17 - ghi de "chi Admin + View"), khop gate backend
  // routes/baoCaoTocDoXuLy.ts (chan KTV/Ve tinh).
  if (role !== "Admin" && !user.la_ktv_dvbh && !user.la_ve_tinh) {
    allowedModules = [...new Set([...allowedModules, "bao-cao-toc-do"])];
  }

  // "Quỹ & chuyển tiền" (2026-09-29) - khop phamViXem() o backend routes/quyKtv.ts: Ke toan/TN xem tat ca, KTV/Ve
  // tinh xem quy cua chinh minh (Ve tinh = quy cua Tram). Admin da co qua ROLE_MODULES.
  if (role !== "Admin" && (user.la_ke_toan || user.la_tac_nghiep || user.la_ktv_dvbh || user.la_ve_tinh)) {
    allowedModules = [...new Set([...allowedModules, "quy-chuyen-tien"])];
  }

  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_MODULE_KEY);
    return saved && allowedModules.includes(saved) ? saved : (allowedModules[0] ?? "dat-mua-lk");
  });
  // Phieu hoan tien quy (2026-10-19, migration 0090): chuong (su kien "mo-phieu-hoan-tien") + link push "/?hoan_tien=<id>" -> mo
  // "Quỹ & chuyển tiền" › tab Hoàn tiền + chi tiet phieu (QuyChuyenTienModule nhan qua prop, nonce de mo lai cung 1 phieu).
  const [moHoanTien, setMoHoanTien] = useState<{ id: string; nonce: number } | null>(null);
  useEffect(() => {
    const mo = (id: string) => {
      setMoHoanTien({ id, nonce: Date.now() });
      setActive("quy-chuyen-tien");
    };
    const u = new URL(window.location.href);
    const id = u.searchParams.get("hoan_tien");
    if (id) {
      u.searchParams.delete("hoan_tien");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      mo(id);
    }
    const nghe = (e: Event) => { const d = (e as CustomEvent<string>).detail; if (d) mo(d); };
    window.addEventListener("mo-phieu-hoan-tien", nghe);
    return () => window.removeEventListener("mo-phieu-hoan-tien", nghe);
  }, []);
  // KTV nop tien vao quy (2026-10-30, migration 0104): chuong (su kien "mo-nop-tien") + link push "/?nop_tien=<id>" -> Quỹ › tab Nộp tiền.
  const [moNopTien, setMoNopTien] = useState<{ id: string; nonce: number } | null>(null);
  useEffect(() => {
    const mo = (id: string) => {
      setMoNopTien({ id, nonce: Date.now() });
      setActive("quy-chuyen-tien");
    };
    const u = new URL(window.location.href);
    const id = u.searchParams.get("nop_tien");
    if (id) {
      u.searchParams.delete("nop_tien");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      mo(id);
    }
    // detail rong = chi mo tab "Nộp tiền vào quỹ" (icon noi cua Ke toan), co id = mo luon chi tiet.
    const nghe = (e: Event) => mo((e as CustomEvent<string>).detail ?? "");
    window.addEventListener("mo-nop-tien", nghe);
    return () => window.removeEventListener("mo-nop-tien", nghe);
  }, []);
  // Chuong thong bao (them 2026-09-05, phan hoi "chuyển vị trí chuông thông báo lên top giao diện") -
  // truoc day NotificationBell la 1 phan noi bo cua DatMuaLinhKienModule, CHI hien khi active==="trang-
  // chu" (man Home) - gio nang len render o day, hien tren MOI tab. queryKey "notifications-count"
  // dung CHUNG voi Sidebar.tsx/BottomTabBar.tsx/DatMuaLinhKienModule.tsx (react-query chia se cache
  // theo key, khong ton them request that). `pendingDetailOpen` la "cong vao" duy nhat de bam 1 dong
  // thong bao mo dung Drawer chi tiet don hang/PXK nam BEN TRONG DatMuaLinhKienModule - neu dang o tab
  // khac (Settings/Users/Bảng giá/...), phai setActive("dat-mua-lk") TRUOC de module do mount, roi
  // truyen target xuong qua prop externalDetailOpen (xem useEffect xu ly no trong DatMuaLinhKienModule.tsx).
  const { data: notifCounts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ ktvLogChuaDoc: number }>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });
  const [pendingDetailOpen, setPendingDetailOpen] = useState<{ tab: "don-cua-toi" | "phieu-xuat-kho" | "tra-hang" | "thieu-lk"; id: string; nonce: number } | null>(null);
  // Deep link "?ktvSearch=<email hoac ma_ktv>" (them 2026-09-28, phan hoi tu vi-pham-app: Admin gan/doi
  // lai KTV cho 1 gmail dang nhap chi sua duoc TAI DAY - ktv_lien_he ben vi-pham-app chi la cache doc-
  // only, bi ghi de moi gio). Nut "Gan lai KTV" ben vi-pham-app mo tab moi toi URL nay de nhay thang
  // vao tab "KTV hien truong" (UsersModule) voi o tim kiem dien san, khong can Admin tu di tim lai.
  const [pendingKtvSearch, setPendingKtvSearch] = useState<{ value: string; nonce: number } | null>(null);
  useEffect(() => {
    const ktvSearch = new URLSearchParams(window.location.search).get("ktvSearch");
    if (!ktvSearch) return;
    window.history.replaceState(null, "", "/");
    setActive("users");
    setPendingKtvSearch({ value: ktvSearch, nonce: Date.now() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // View noi bo cua DatMuaLinhKienModule -> muc Sidebar tuong ung (2026-09-29 tach "Phiếu xuất" rieng).
  // Lan bam muc Sidebar (2026-10-03, "click vào đơn hàng mặc định là chọn tổng") - nonce de bam LAI cung muc van kich hoat;
  // KHONG doi khi dieu huong noi bo (onLeaveForceView/chuong thong bao) nen khong de mat bo loc dang mang theo.
  const [sidebarClick, setSidebarClick] = useState<{ key: string; nonce: number } | null>(null);
  function mucChoView(view: string): string {
    if (view === "thieu-lk") return "thieu-lk";
    if (view === "phieu-xuat-kho" && allowedModules.includes("phieu-xuat")) return "phieu-xuat";
    // "Hàng trả" (2026-09-30) chi la muc Sidebar rieng tren desktop - mobile gop trong "Đơn hàng".
    if (view === "tra-hang" && allowedModules.includes("tra-hang") && !isMobile) return "tra-hang";
    return "dat-mua-lk";
  }
  function openDonHangFromBell(donHangId: string) {
    setActive("dat-mua-lk");
    setPendingDetailOpen({ tab: "don-cua-toi", id: donHangId, nonce: Date.now() });
  }
  function openPxkFromBell(pxkId: string) {
    setActive(mucChoView("phieu-xuat-kho"));
    setPendingDetailOpen({ tab: "phieu-xuat-kho", id: pxkId, nonce: Date.now() });
  }
  // Ket qua tim kiem that o CommandPalette (them 2026-09-10, xem GET /dat-mua-lk/search) - dung LAI
  // dung 1 "cong vao" pendingDetailOpen voi chuong thong bao/deep link o tren, chi khac nguon kich hoat.
  function openSearchResult(action: { type: "don_hang" | "phieu_xuat_kho" | "thieu_lk"; id: string }) {
    const tab = action.type === "don_hang" ? "don-cua-toi" : action.type === "phieu_xuat_kho" ? "phieu-xuat-kho" : "thieu-lk";
    setActive(mucChoView(tab));
    setPendingDetailOpen({ tab, id: action.id, nonce: Date.now() });
  }
  // Ctrl+K tim linh kien (2026-10-29): bam 1 LK = drawer thong tin LK (dung chung Bang gia) ngay tai man dang dung;
  // "Tìm … trong Bảng giá" / chon muc "Bảng giá" khi dang go tu khoa = mo Bang gia voi o tim dien san.
  const [xemLkTuTim, setXemLkTuTim] = useState<string | null>(null);
  const [bangGiaTim, setBangGiaTim] = useState<{ q: string; nonce: number } | null>(null);
  function handleCommandSelect(item: CommandItem, q: string) {
    const a = item.action;
    if (!a) {
      if (item.key === "danh-muc-lk" && q && !khopTim(item.label, q)) setBangGiaTim({ q, nonce: Date.now() });
      setActive(item.key);
    } else if (a.type === "linh_kien") setXemLkTuTim(a.id);
    else if (a.type === "bang_gia") {
      setBangGiaTim({ q: a.id, nonce: Date.now() });
      setActive("danh-muc-lk");
    } else openSearchResult(a);
  }
  // Mo Drawer chi tiet 1 dong tra hang theo dung dat_don_hang.id (them 2026-09-09, xem
  // lib/pxkDeepLink.ts) - khac openPxkFromBell, id truyen vao day PHAI la dat_don_hang.id that
  // ("DDH-xxxxxx"), khong phai ma thung tra ("TRA-xxxxxx") - xem resolve o duoi.
  function openTraHangFromBell(donHangId: string) {
    setActive(mucChoView("tra-hang"));
    setPendingDetailOpen({ tab: "tra-hang", id: donHangId, nonce: Date.now() });
  }
  // Link truy cap truc tiep 1 PXK/dong tra hang theo ID (them 2026-09-09, xem lib/pxkDeepLink.ts) -
  // luc component nay mount la luc nguoi dung CHAC CHAN da dang nhap xong (App() chi render MainApp
  // sau khi auth.status === "authenticated"), nen day la diem doc lai an toan duy nhat, dung LAI het
  // co che "bam thong bao mo PXK/don hang" da co (openPxkFromBell/openTraHangFromBell o tren) thay vi
  // tu xay routing rieng. Sua lai URL ve dung dang "/<id>/" (co the dang la "/" neu vua di qua vong
  // Google OAuth, xem giai thich trong pxkDeepLink.ts) de giu URL lam permalink dung y nghia.
  // "TRA-" (ma thung hang tra, KHONG phai id PXK) can 1 buoc RESOLVE qua API truoc khi mo duoc Drawer
  // (backend GET /tra-hang/resolve-ma-thung/:maThung tra ve dung dat_don_hang.id) - cac tien to con
  // lai (PMH/PCN/PTL/PXK) CHINH LA id PXK nen mo thang duoc, khong can resolve.
  useEffect(() => {
    const id = consumePendingPxkDeepLinkId();
    if (!id) return;
    window.history.replaceState(null, "", "/" + id + "/");
    if (id.startsWith("TRA-")) {
      api
        .get<{ id: string }>(`/tra-hang/resolve-ma-thung/${encodeURIComponent(id)}`)
        .then((r) => openTraHangFromBell(r.id))
        .catch(() => {
          /* khong tim thay/khong co quyen xem - im lang, nguoi dung van vao duoc app binh thuong */
        });
    } else if (id.startsWith("TLK-")) {
      openSearchResult({ type: "thieu_lk", id });
    } else if (id.startsWith("DDH-")) {
      openSearchResult({ type: "don_hang", id });
    } else {
      openPxkFromBell(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  // Phan hoi nguoi dung 2026-08-27: "ấn nhầm đang thoát luôn rất bất tiện" - bay nut/vuot "Quay lai"
  // cua he dieu hanh tren mobile, hoi xac nhan truoc khi thoat that (xem useExitConfirm.ts).
  const { confirmOpen: exitConfirmOpen, stay: stayInApp, leave: exitApp } = useExitConfirm(isMobile);
  // "Xem truoc Mobile" cho Admin (them 2026-08-24, yeu cau "nút chuyển đổi giữa giao diện mobile và
  // web để test cho nhanh") - CHI Admin that duoc bat (gate o TopBar). Dung IFRAME that (khong phai
  // CSS gia lap) vi Tailwind sm:/md:/useIsMobile() (window.matchMedia) deu doc theo VIEWPORT THAT cua
  // trinh duyet - 1 <div> hep khong lam cac class do doi, chi co iframe (co viewport rieng, cung
  // origin nen tu dong dung chung cookie dang nhap) moi kich hoat dung layout mobile that su.
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  // Command palette (Ctrl+K / Cmd+K, concept 1 "Structured Neutral" da duyet 2026-08-24) - danh sach
  // lenh CHI la cac module nguoi dung dang duoc phep vao (allowedModules, dung LAI y het danh sach
  // Sidebar da loc, khong tao nguon phan quyen thu 2).
  const [commandOpen, setCommandOpen] = useState(false);
  const commandItems: CommandItem[] = useMemo(
    () =>
      NAV_GROUPS.flatMap((g) => g.items.filter((i) => allowedModules.includes(i.key)).map((i) => ({ key: i.key, label: i.label, icon: i.icon, group: g.label }))),
    [allowedModules],
  );
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  // Slot dung chung de DatMuaLinhKienModule "portal" luong quy trinh + nut "Việc của tôi: N" len canh
  // tieu de trang thay vi 1 hang rieng ben duoi - dung y giong he goc.
  const [headerExtraEl, setHeaderExtraEl] = useState<HTMLDivElement | null>(null);
  // Slot long trong Sidebar (them 2026-09-11, phan hoi "đẩy nó ra sidebar") - Sidebar render ra <div>
  // rong ngay duoi muc "Đặt mua linh kiện", DatMuaLinhKienModule portal menu giai doan hoa vao day.
  // Dung pattern portal y het headerExtraEl o tren - Sidebar/Module la 2 anh em cung cap voi MainApp.
  // Tach 2 slot (2026-09-29): duoi "Đơn đặt hàng" (nhom menu don) va duoi "Phiếu xuất" (nhom menu PXK).
  const [stageMenuSlotDonEl, setStageMenuSlotDonEl] = useState<HTMLDivElement | null>(null);
  const [stageMenuSlotTraEl, setStageMenuSlotTraEl] = useState<HTMLDivElement | null>(null);
  const [stageMenuSlotPxkEl, setStageMenuSlotPxkEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!allowedModules.includes(active)) setActive(allowedModules[0] ?? "dat-mua-lk");
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(ACTIVE_MODULE_KEY, active);
  }, [active]);

  // FIX (phan hoi 2026-08-28: "Rà lại toàn bộ các màn hình UI, khi ấn lùi sẽ quay lại màn hình gốc
  // chứ không hỏi có thoát không. chỉ khi ở màn hình gốc đầu tiên mới hỏi có thoát không") - dang ky
  // muc/module top-level (Settings/Users/Danh muc lk/...) vao CHUNG ngan xep overlay voi
  // Drawer/Modal (xem overlayStack.ts). "dat-mua-lk" la mot module DUY NHAT bao trum ca trang-chu/
  // thieu-lk/tra-hang/dieu huong noi bo (tab/jump) - `active` KHONG doi trong suot qua trinh dieu
  // huong noi bo do (xem forceView/navigatedAway trong DatMuaLinhKienModule.tsx), nen 1 dang ky DUY
  // NHAT o day la du: bam Back tu bat ky do sau noi bo nao cung quay thang ve module goc (rootModule)
  // trong 1 lan bam, chi khi DA o dung module goc (active === rootModule) nut Back moi roi xuong
  // hoi xac nhan thoat app (useExitConfirm.ts).
  const rootModule = allowedModules[0] ?? "dat-mua-lk";
  useEffect(() => {
    if (active === rootModule) return;
    return pushOverlayClose(() => setActive(rootModule));
  }, [active, rootModule]);

  if (!role && !laTaiKhoanMuaHangThuanTuy) {
    return <LoginScreen variant="pending" />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        active={active}
        setActive={(key: string) => {
          setActive(key);
          setSidebarClick({ key, nonce: Date.now() });
        }}
        allowedModules={allowedModules}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        role={roleDisplayLabel(user)}
        user={user}
        realIsAdmin={realIsAdmin}
        viewAsRole={viewAsRole}
        stageMenuSlotRefs={{ "dat-mua-lk": setStageMenuSlotDonEl, "phieu-xuat": setStageMenuSlotPxkEl, "tra-hang": setStageMenuSlotTraEl }}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Banner "xem thu vai tro" (phan hoi 2026-08-20) - LUON hien khi viewAsRole != null, ke ca
            khi cuon xuong tab khac, de khong bao gio quen minh dang thao tac duoi 1 profile quyen bi
            gioi han (hanh dong ghi that vao DB, khong phai sandbox rieng - xem lib/viewAsPresets.ts). */}
        {/* "Xem như người dùng" (2026-09-30) - chi doc, xem layout/XemNhuNguoiDung.tsx. */}
        {viewAsUser && (
          <div className="bg-[var(--color-primary)] text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-3 flex-wrap text-center">
            <span>
              👤 {t("Đang xem như")} <strong>{viewAsUser.ten || viewAsUser.email}</strong> ({viewAsUser.email}) — {t("thấy đúng menu, dữ liệu và quyền của người này. Chỉ xem, không thao tác được.")}
            </span>
            <button type="button" onClick={() => doiXemNhu(null)} className="focus-ring underline underline-offset-2 shrink-0">
              {t("Thoát về Admin")}
            </button>
          </div>
        )}
        {viewAsRole && (
          <div className="bg-[var(--amber-500)] text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-3 flex-wrap text-center">
            <span>
              🔍 {t("Admin đang xem/thao tác thử dưới vai trò")} <strong>{VIEW_AS_LABELS[viewAsRole]}</strong> — {t("mọi hành động vẫn ghi nhận thật vào hệ thống.")}
            </span>
            <button
              type="button"
              onClick={async () => {
                await api.post("/auth/view-as", { role: null });
                window.location.reload();
              }}
              className="focus-ring underline underline-offset-2 shrink-0"
            >
              {t("Thoát về Admin thật")}
            </button>
          </div>
        )}
        {/* FIX (phan hoi 2026-08-25, hang muc #15): TopBar mac dinh AN tren mobile - chuong thong
            bao/avatar chuyen vao Sidebar (mo qua nut "Thêm" cuoi BottomTabBar), xem TopBar.tsx. */}
        {!isMobile && (
          <TopBar
            active={active}
            role={roleDisplayLabel(user)}
            user={user}
            realIsAdmin={realIsAdmin}
            viewAsRole={viewAsRole}
            onToggleSidebar={() => setCollapsed((v) => !v)}
            onOpenCommandPalette={() => setCommandOpen(true)}
            mobilePreviewOpen={mobilePreviewOpen}
            onToggleMobilePreview={() => setMobilePreviewOpen((v) => !v)}
            notificationBell={<NotificationBell unreadCount={notifCounts?.ktvLogChuaDoc ?? 0} onOpenDonHang={openDonHangFromBell} onOpenPxk={openPxkFromBell} />}
          />
        )}
        {/* SUA (phan hoi 2026-09-27 "mất bottom"): truoc day gan CUNG LUC "pb-5" va "pb-20" - trong CSS Tailwind
            sinh ra pb-5 dung sau nen THANG, chi con 20px -> phan cuoi MOI trang (phan trang, nut cuoi) nam
            khuat duoi BottomTabBar (h-14 = 56px, fixed). Gio chon 1 trong 2 theo isMobile (< 768px, khop
            md:hidden cua BottomTabBar): 56px thanh + 16px khoang thoang + safe-area iPhone. */}
        <main className={`px-4 pt-4 sm:px-6 sm:pt-4 flex-1 min-w-0 ${isMobile ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))]" : "pb-5 sm:pb-[22px]"}`}>
          <div className="flex items-center justify-between mb-[14px] flex-wrap gap-2">
            <div className="flex flex-1 items-center gap-3 flex-wrap min-w-0">
              {active !== "dat-mua-lk" && active !== "phieu-xuat" && active !== "tra-hang" && <h1 className="page-title text-lg sm:text-[21px]">{MODULE_TITLES[active] ? t(MODULE_TITLES[active]) : active}</h1>}
              <div ref={setHeaderExtraEl} className="flex flex-1 items-center gap-2 flex-wrap min-w-0" />
            </div>
            {/* Muc 7 (yeu cau UI mobile 2026-08-27): "icon cai dat giao dien va muc dang xuat o goc
                phai" - tai dung NGUYEN VEN TopBarActions (da co san "🎨 Giao diện"/"Đăng xuất" trong
                dropdown avatar, dung o Sidebar mobile off-canvas) thay vi viet component moi, dung
                lua chon da chot qua AskUserQuestion. Chi hien tren mobile (desktop da co TopBar rieng
                o tren cung, xem TopBar.tsx) - chap nhan trung diem truy cap voi Sidebar off-canvas.
                FIX (phan hoi 2026-09-05: "ấn vào thông tin tài khoản, UI hiện lỗi"): trigger o day nam
                SAT MEP PHAI man hinh (khac Sidebar off-canvas, trigger sat mep trai 1 drawer hep) -
                phai truyen dropdownAlign="right" de dropdown neo dung huong, khong tran ra ngoai man
                hinh (xem giai thich day du trong TopBarActions.tsx).
                Chuong thong bao (them 2026-09-05): CHI render o day tren MOBILE - tren desktop da nam
                trong TopBar.tsx rieng (header luon o top, khong bao gio bi pipeline flow day xuong
                dong duoi nhu khi dat chung 1 hang flex-wrap voi headerExtraEl o day). Tren mobile
                pipeline chi la 1 nut "+ Tạo đơn" hep (xem DatMuaLinhKienModule.tsx) nen khong tran dong
                nhu ban desktop. */}
            {isMobile && (
              <div className="flex items-center gap-2 shrink-0">
                <NotificationBell unreadCount={notifCounts?.ktvLogChuaDoc ?? 0} onOpenDonHang={openDonHangFromBell} onOpenPxk={openPxkFromBell} />
                <TopBarActions role={roleDisplayLabel(user)} user={user} realIsAdmin={realIsAdmin} viewAsRole={viewAsRole} dropdownAlign="right" />
              </div>
            )}
          </div>
          {/* "trang-chu"/"dat-mua-lk"/"thieu-lk"/"tra-hang" GOP thanh 1 LAN GOI <DatMuaLinhKienModule>
              duy nhat (phan hoi 2026-08-26: "click vào thẻ trang chủ, kích để xem đơn hàng, mà vẫn ở
              thẻ trang chủ là sao?") - truoc day 4 nhanh JSX rieng ({active==="x" && <Module .../>}),
              moi lan doi `active` giua chung la 1 lan UNMOUNT+REMOUNT component (khac vi tri trong
              cay React) nen jumpTarget/navigatedAway (state noi bo, KHONG luu localStorage) bi MAT khi
              onLeaveForceView goi setActive() - lam mat bo loc dang mang theo (vd bam "SL bị từ chối"
              tu BaoCaoTab). Gop thanh 1 dieu kien + 1 component duy nhat: React coi la CUNG 1 instance
              (cung vi tri cay) khi doi `active` giua 4 gia tri nay, chi re-render voi forceView prop
              moi - KHONG unmount, moi state noi bo (jumpTarget, navigatedAway, view) giu nguyen. */}
          {(active === "trang-chu" || active === "dat-mua-lk" || active === "phieu-xuat" || active === "thieu-lk" || active === "tra-hang") && (
            <DatMuaLinhKienModule
              forceView={active === "dat-mua-lk" || active === "phieu-xuat" || active === "tra-hang" ? undefined : active}
              section={active === "phieu-xuat" ? "phieu-xuat" : active === "tra-hang" ? "tra-hang" : "don-dat-hang"}
              headerExtra={headerExtraEl}
              stageMenuSlots={{ don: stageMenuSlotDonEl, pxk: stageMenuSlotPxkEl, tra: stageMenuSlotTraEl }}
              externalDetailOpen={pendingDetailOpen}
              sidebarClick={sidebarClick}
              onExternalDetailOpenConsumed={() => setPendingDetailOpen(null)}
              // FIX (phan hoi 2026-08-26, cung van de tren): khi nguoi dung bam so lieu/StatCard nhay
              // sang noi dung khac tu "Trang chủ"/"Thiếu linh kiện" (vd "Đơn của tôi"), noi dung thuc
              // te da chuyen sang "Đặt mua linh kiện" - goi callback nay de Sidebar/tieu de h1 (dieu
              // khien boi `active`) tu doi theo dung, tranh cam giac "bấm không ăn thua".
              // FIX (kiem thu 2026-08-26, vai tro Kho bam StatCard "Thiếu LK" o Home): callback nay
              // TRUOC DAY luon setActive("dat-mua-lk") bat ke dich den thuc su la view nao - dung voi
              // "Đơn của tôi"/"Phiếu xuất kho" (khong co muc Sidebar rieng, gop chung vao "Đơn hàng"),
              // nhung SAI voi "thieu-lk" (co muc Sidebar rieng "Chờ LK", xem navConfig.ts) - noi dung
              // hien dung (ThieuLkTab) nhung Sidebar/tieu de van dung nguyen "Đơn hàng", gay cam giac
              // bam nham tab. Nhan them `view` (dich den thuc su, xem markNavigatedAway o
              // DatMuaLinhKienModule.tsx) de chon dung gia tri active: "thieu-lk" giu nguyen muc Sidebar
              // rieng, con lai (don-cua-toi/phieu-xuat-kho) van gop ve "dat-mua-lk" nhu cu.
              // 2026-09-29: goi o MOI lan dieu huong noi bo (khong chi luc roi forceView) - PXK thuoc muc "Phiếu xuất".
              onLeaveForceView={(view) => setActive(mucChoView(view))}
            />
          )}
          {active === "danh-muc-lk" && <DanhMucLinhKienModule timBanDau={bangGiaTim} />}
          {active === "ton-kho-ktv" && <TonKhoKtvModule />}
          {active === "danh-sach-ktv" && <DanhSachKtvModule />}
          {active === "quy-chuyen-tien" && <QuyChuyenTienModule moPhieuHoanTien={moHoanTien} moNopTien={moNopTien} />}
          {active === "hoi-dap" && <HoiDapModule />}
          {active === "bao-cao-toc-do" && <BaoCaoTocDoXuLyModule />}
          {active === "settings" && <SettingsModule />}
          {active === "users" && <UsersModule pendingKtvSearch={pendingKtvSearch} />}
        </main>
      </div>
      {isMobile && <BottomTabBar active={active} setActive={setActive} allowedModules={allowedModules} onOpenMore={() => setMobileOpen(true)} />}
      {/* Hoi dap KTV <-> Mua hang (2026-10-17) - icon chat goc duoi phai, moi tai khoan da duyet. */}
      <HoiDapWidget />
      {/* Nut tron "Nạp quỹ" canh nut chat (2026-10-30, v1.426) - KTV / Ve tinh / GS mo nhanh form nop tien vao quy. */}
      <NutNopQuyNoi />
      {/* Icon noi "Nạp quỹ chờ xác nhận" cho Ke toan (2026-10-30, v1.427) - popup danh sach cho + nhac yeu cau moi. */}
      <NutNopTienKeToan />
      {isMobile && exitConfirmOpen && (
        <Modal open onClose={stayInApp} title={t("Thoát ứng dụng?")}>
          <div className="space-y-4 text-sm">
            <div className="text-[var(--ink-700)]">{t("Bạn có chắc muốn thoát khỏi ứng dụng không?")}</div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={stayInApp}>{t("Ở lại")}</Btn>
              <Btn variant="danger" onClick={exitApp}>{t("Thoát")}</Btn>
            </div>
          </div>
        </Modal>
      )}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} onSelect={handleCommandSelect} />
      {xemLkTuTim && <XemLinhKienDrawer ma={xemLkTuTim} onClose={() => setXemLkTuTim(null)} />}
      {realIsAdmin && mobilePreviewOpen && (
        <div className="fixed inset-0 z-[100] bg-[rgba(24,24,27,0.65)] flex items-center justify-center p-4 sm:p-8 overflow-auto">
          <div className="relative shrink-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-white text-xs font-semibold">📱 {t("Xem trước Mobile — cửa sổ riêng, cùng phiên đăng nhập")}</span>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                className="focus-ring text-white text-xs font-semibold underline underline-offset-2 shrink-0"
              >
                ✕ {t("Đóng")}
              </button>
            </div>
            <div
              className="rounded-[36px] border-[10px] border-[#111113] bg-white shadow-2xl overflow-hidden"
              style={{ width: 390, height: 844, maxHeight: "calc(100vh - 96px)" }}
            >
              <iframe src={window.location.href} title="Xem trước giao diện Mobile" className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
