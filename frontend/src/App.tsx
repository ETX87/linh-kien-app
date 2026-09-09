import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth/AuthContext";
import type { ViewAsRole } from "./auth/viewAsRoles";
import { VIEW_AS_LABELS } from "./auth/viewAsRoles";
import { LoginScreen } from "./login/LoginScreen";
import { Sidebar } from "./layout/Sidebar";
import { TopBarActions } from "./layout/TopBarActions";
import { TopBar } from "./layout/TopBar";
import { BottomTabBar } from "./layout/BottomTabBar";
import { ROLE_MODULES, MODULE_TITLES, NAV_GROUPS } from "./layout/navConfig";
import { DatMuaLinhKienModule } from "./modules/DatMuaLinhKienModule";
import { DanhMucLinhKienModule } from "./modules/DanhMucLinhKienModule";
import { TonKhoKtvModule } from "./modules/TonKhoKtvModule";
import { DanhSachKtvModule } from "./modules/DanhSachKtvModule";
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
import { useThemeSettings } from "./theme/useThemeSettings";
import { consumePendingPxkDeepLinkId } from "./lib/pxkDeepLink";

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
function roleDisplayLabel(user: { vai_tro: string | null; la_kho: boolean; la_ke_toan: boolean; la_tac_nghiep: boolean; la_tp_dvbh: boolean; la_ktv_dvbh: boolean; la_ve_tinh: boolean; la_view: boolean }): string {
  if (user.vai_tro) return user.vai_tro;
  const labels: string[] = [];
  if (user.la_kho) labels.push("Kho");
  if (user.la_ke_toan) labels.push("Kế toán");
  if (user.la_tac_nghiep) labels.push("Tác nghiệp (TN)");
  if (user.la_tp_dvbh) labels.push("TP DVBH");
  if (user.la_ktv_dvbh) labels.push("KTV DVBH");
  if (user.la_ve_tinh) labels.push("Vệ tinh");
  if (user.la_view) labels.push("View");
  return labels.length ? labels.join(" · ") : "Đặt mua linh kiện";
}

export function App() {
  const auth = useAuth();
  // Ap dung theme ca nhan (mau + font, luu localStorage - xem useThemeSettings.ts) ngay tu shell
  // ngoai cung, khong phu thuoc trang thai dang nhap/module dang mo. index.html co san 1 script inline
  // lam viec nay TRUOC khi React mount (chong nhay mau mac dinh) - goi lai o day de dong bo lai sau
  // khi React hydrate va de ThemeSettingsModal (mo tu menu tai khoan) doc/ghi cung 1 nguon.
  useThemeSettings();

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--ink-700)] text-xl font-bold">Đang tải…</div>
      </div>
    );
  }
  if (auth.status === "anonymous") return <LoginScreen variant="login" />;
  if (auth.status === "pending") return <LoginScreen variant="pending" />;
  if (auth.status === "rejected") return <LoginScreen variant="rejected" />;
  if (auth.status === "disabled") return <LoginScreen variant="disabled" />;

  return <MainApp user={auth.user} realIsAdmin={auth.realIsAdmin} viewAsRole={auth.viewAsRole} />;
}

function MainApp({
  user,
  realIsAdmin,
  viewAsRole,
}: {
  user: Extract<ReturnType<typeof useAuth>, { status: "authenticated" }>["user"];
  realIsAdmin: boolean;
  viewAsRole: ViewAsRole | null;
}) {
  const role = user.vai_tro;
  // Tai khoan "chi Dat mua linh kien" - vai_tro=NULL CO CHU DICH (KTV/CTV/Tram/Ve tinh/Kho/Ke toan),
  // dung y giong he goc: khong tham gia mien nghiep vu nao khac, chi vao duoc qua cac co vai tro rieng.
  const laTaiKhoanMuaHangThuanTuy = !role && !!(user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh || user.la_view);
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
  if (role !== "Admin" && (user.xem_danh_muc_lk || user.quan_ly_danh_muc_lk)) {
    allowedModules = [...new Set([...allowedModules, "danh-muc-lk"])];
  }
  // "Tốc độ xử lý" (them 04/09/2026) - RIENG cho la_view (KHONG gop vao khoi 7 co "Dat mua linh kien"
  // o tren, vi 6 co con lai - la_kho/la_ke_toan/la_tac_nghiep/.../vai_tro Giam sat - KHONG duoc xem
  // bao cao nay, du co quyen vao module dat-mua-lk) - xem backend/src/routes/baoCaoTocDoXuLy.ts gate.
  if (role !== "Admin" && user.la_view) {
    allowedModules = [...new Set([...allowedModules, "bao-cao-toc-do"])];
  }
  // "Danh sách KTV" (them 2026-09-05, phan hoi "đẩy ra menu để các vai trò nhân viên văn phòng có thể
  // xem được thông tin") - MOI vai tro KHONG PHAI ban than KTV/CTV/Tram/Ve tinh deu xem duoc (TN/Kho/
  // Ke toan/TBP/QC/Giam sat/View...) - backend GET /settings/ktv-lien-he da khong gioi han gi them
  // ngoai dang nhap+duyet nen chi can mo them muc menu o day. Ke toan duoc uy quyen sua rieng 3 truong
  // (xem DanhSachKtvModule.tsx -> KtvTab mode="ke-toan" + PATCH /:ma/cong-no-misa).
  if (role !== "Admin" && !user.la_ktv_dvbh && !user.la_ve_tinh) {
    allowedModules = [...new Set([...allowedModules, "danh-sach-ktv"])];
  }

  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_MODULE_KEY);
    return saved && allowedModules.includes(saved) ? saved : (allowedModules[0] ?? "dat-mua-lk");
  });
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
  const [pendingDetailOpen, setPendingDetailOpen] = useState<{ tab: "don-cua-toi" | "phieu-xuat-kho" | "tra-hang"; id: string; nonce: number } | null>(null);
  function openDonHangFromBell(donHangId: string) {
    setActive("dat-mua-lk");
    setPendingDetailOpen({ tab: "don-cua-toi", id: donHangId, nonce: Date.now() });
  }
  function openPxkFromBell(pxkId: string) {
    setActive("dat-mua-lk");
    setPendingDetailOpen({ tab: "phieu-xuat-kho", id: pxkId, nonce: Date.now() });
  }
  // Mo Drawer chi tiet 1 dong tra hang theo dung dat_don_hang.id (them 2026-09-09, xem
  // lib/pxkDeepLink.ts) - khac openPxkFromBell, id truyen vao day PHAI la dat_don_hang.id that
  // ("DDH-xxxxxx"), khong phai ma thung tra ("TRA-xxxxxx") - xem resolve o duoi.
  function openTraHangFromBell(donHangId: string) {
    setActive("dat-mua-lk");
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
        setActive={setActive}
        allowedModules={allowedModules}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        role={roleDisplayLabel(user)}
        user={user}
        realIsAdmin={realIsAdmin}
        viewAsRole={viewAsRole}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Banner "xem thu vai tro" (phan hoi 2026-08-20) - LUON hien khi viewAsRole != null, ke ca
            khi cuon xuong tab khac, de khong bao gio quen minh dang thao tac duoi 1 profile quyen bi
            gioi han (hanh dong ghi that vao DB, khong phai sandbox rieng - xem lib/viewAsPresets.ts). */}
        {viewAsRole && (
          <div className="bg-[var(--amber-500)] text-white text-xs font-semibold px-4 py-1.5 flex items-center justify-center gap-3 flex-wrap text-center">
            <span>
              🔍 Admin đang xem/thao tác thử dưới vai trò <strong>{VIEW_AS_LABELS[viewAsRole]}</strong> — mọi hành động vẫn ghi nhận thật vào hệ thống.
            </span>
            <button
              type="button"
              onClick={async () => {
                await api.post("/auth/view-as", { role: null });
                window.location.reload();
              }}
              className="focus-ring underline underline-offset-2 shrink-0"
            >
              Thoát về Admin thật
            </button>
          </div>
        )}
        {/* FIX (phan hoi 2026-08-25, hang muc #15): TopBar mac dinh AN tren mobile - chuong thong
            bao/avatar chuyen vao Sidebar (mo qua nut "Thêm" cuoi BottomTabBar), xem TopBar.tsx. */}
        {!isMobile && (
          <TopBar
            role={roleDisplayLabel(user)}
            user={user}
            realIsAdmin={realIsAdmin}
            viewAsRole={viewAsRole}
            onOpenCommandPalette={() => setCommandOpen(true)}
            mobilePreviewOpen={mobilePreviewOpen}
            onToggleMobilePreview={() => setMobilePreviewOpen((v) => !v)}
            notificationBell={<NotificationBell unreadCount={notifCounts?.ktvLogChuaDoc ?? 0} onOpenDonHang={openDonHangFromBell} onOpenPxk={openPxkFromBell} />}
          />
        )}
        <main className={`p-3 sm:p-5 flex-1 ${isMobile ? "pb-20" : ""}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              {active !== "dat-mua-lk" && <h1 className="font-display text-lg sm:text-xl font-extrabold text-[var(--ink-900)]">{MODULE_TITLES[active]}</h1>}
              <div ref={setHeaderExtraEl} className="flex items-center gap-2 flex-wrap min-w-0" />
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
          {(active === "trang-chu" || active === "dat-mua-lk" || active === "thieu-lk" || active === "tra-hang") && (
            <DatMuaLinhKienModule
              forceView={active === "dat-mua-lk" ? undefined : active}
              headerExtra={headerExtraEl}
              externalDetailOpen={pendingDetailOpen}
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
              onLeaveForceView={(view) => setActive(view === "thieu-lk" ? "thieu-lk" : "dat-mua-lk")}
            />
          )}
          {active === "danh-muc-lk" && <DanhMucLinhKienModule />}
          {active === "ton-kho-ktv" && <TonKhoKtvModule />}
          {active === "danh-sach-ktv" && <DanhSachKtvModule />}
          {active === "bao-cao-toc-do" && <BaoCaoTocDoXuLyModule />}
          {active === "settings" && <SettingsModule />}
          {active === "users" && <UsersModule />}
        </main>
      </div>
      {isMobile && <BottomTabBar active={active} setActive={setActive} allowedModules={allowedModules} onOpenMore={() => setMobileOpen(true)} />}
      {isMobile && exitConfirmOpen && (
        <Modal open onClose={stayInApp} title="Thoát ứng dụng?">
          <div className="space-y-4 text-sm">
            <div className="text-[var(--ink-700)]">Bạn có chắc muốn thoát khỏi ứng dụng không?</div>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={stayInApp}>Ở lại</Btn>
              <Btn variant="danger" onClick={exitApp}>Thoát</Btn>
            </div>
          </div>
        </Modal>
      )}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} onSelect={setActive} />
      {realIsAdmin && mobilePreviewOpen && (
        <div className="fixed inset-0 z-[100] bg-[rgba(24,24,27,0.65)] flex items-center justify-center p-4 sm:p-8 overflow-auto">
          <div className="relative shrink-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-white text-xs font-semibold">📱 Xem trước Mobile — cửa sổ riêng, cùng phiên đăng nhập</span>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                className="focus-ring text-white text-xs font-semibold underline underline-offset-2 shrink-0"
              >
                ✕ Đóng
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
