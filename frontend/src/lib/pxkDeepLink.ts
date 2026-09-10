// Link truy cap truc tiep 1 PXK/dong tra hang theo ID (phan hoi 2026-09-09: "co the tao link truy
// van theo ID đơn PXK không?... khi bắn API sang các đối tác, họ có thể click vào link để mở thông
// tin chi tiết") - dang https://linhkien.dichvu3t.workers.dev/PMH-000001/ mo THANG Drawer chi tiet
// PXK do, dung LAI nguyen co che "bam thong bao mo PXK/don hang" da co san (App.tsx::
// openPxkFromBell/openTraHangFromBell + pendingDetailOpen) thay vi xay 1 he thong routing rieng - app
// nay khong dung router (khong co react-router-dom), moi dieu huong deu la state noi bo trong React,
// "URL" chi co y nghia thuc su o lan tai trang DAU TIEN (wrangler.jsonc "not_found_handling":
// "single-page-application" da tu phuc vu index.html cho MOI duong dan khong khop file tinh nao,
// khong can sua backend).
//
// Them 2026-09-09 (phan hoi "1 nghiệp vụ cũng liên quan đến kho là xác nhận đơn trả hàng"): mo rong
// them mau "TRA-xxxxxx" (ma thung hang tra vat ly, KHAC voi id chinh dat_don_hang "DDH-xxxxxx") - id
// nay KHONG phai id PXK nen khong the mo Drawer PXK truc tiep, phai RESOLVE qua
// GET /tra-hang/resolve-ma-thung/:maThung (backend) de lay dung dat_don_hang.id truoc, xem App.tsx.
//
// Van de can xu ly: nguoi dam link co the CHUA dang nhap - luc do ho phai di qua vong Google OAuth
// (redirect sang accounts.google.com roi ve /api/auth/callback), va callback backend LUON redirect ve
// FRONTEND_URL (goc "/", xem backend/src/routes/auth.ts) - lam MAT duong dan goc. Dung sessionStorage
// lam cau noi: ghi lai ID ngay tu lan tai trang DAU TIEN (truoc khi nguoi dung kip bam "Đăng nhập
// bằng Google"), sessionStorage song sot qua dieu huong sang Google roi quay lai (cung 1 tab/phien
// duyet, chi mat khi dong tab) - App.tsx doc lai SAU KHI da xac thuc xong, khong phu thuoc
// window.location.pathname luc do (rat co the da la "/" sau khi callback redirect).
const STORAGE_KEY = "dmlk_pending_pxk_deep_link";
// Chap nhan ca tien to cu "PXK" (du da doi sang PMH/PCN/PTL - xem pxkIdPrefix trong
// backend/src/routes/phieuXuatKho.ts) de link toi cac PXK tao TRUOC thoi diem doi van mo duoc, cong
// them "TRA" (ma thung hang tra, xem giai thich tren) va "TLK" (ticket thieu linh kien, them 2026-09-10
// cho link work_url bao khovan - xem lib/khovanPushClient.ts::pushThieuLkToKhovan).
const DEEP_LINK_ID_RE = /^\/(PMH|PCN|PTL|PXK|TRA|TLK)-\d+\/?$/i;

// Goi 1 LAN duy nhat, cang som cang tot (dau frontend/src/main.tsx, TRUOC khi React mount) - khong
// phu thuoc trang thai dang nhap, chi doc URL hien tai va ghi nho neu khop mau.
export function capturePxkDeepLinkFromUrl(): void {
  const path = window.location.pathname;
  if (!DEEP_LINK_ID_RE.test(path)) return;
  const id = path.replace(/^\/|\/$/g, "").toUpperCase();
  sessionStorage.setItem(STORAGE_KEY, id);
}

// Doc + xoa ngay (chi ap dung 1 LAN) - goi tu App.tsx sau khi da xac dinh nguoi dung DA dang nhap
// xong, dung ket qua nay de nhay thang toi Drawer chi tiet PXK/don tra hang.
export function consumePendingPxkDeepLinkId(): string | null {
  const id = sessionStorage.getItem(STORAGE_KEY);
  if (!id) return null;
  sessionStorage.removeItem(STORAGE_KEY);
  return id;
}
