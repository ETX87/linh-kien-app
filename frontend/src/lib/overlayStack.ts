// Ngan xep cac "lop" Drawer/Modal dang mo tren mobile (them 2026-08-28, phan hoi "khi đang xem đơn
// chi tiết mà ấn back lại (mobile) thì sẽ quay lại màn hình trước chứ không phải là thoát app") - dung
// DUY NHAT boi useExitConfirm.ts de biet nut Back cua he dieu hanh nen DONG LOP TREN CUNG hay HIEN hop
// thoai xac nhan thoat app (chi khi khong con lop nao mo). KHONG tu quan ly history entry o day -
// useExitConfirm la noi DUY NHAT pushState/popstate (xem giai thich trong file do) - neu moi Drawer tu
// push 1 history entry rieng, MOI popstate se kich hoat CA listener cua Drawer LAN listener cua
// useExitConfirm cung luc (popstate la su kien window toan cuc, khong co khai niem "handled" nhu DOM
// event) - dan toi vua dong Drawer vua hien nham hop thoai xac nhan thoat. Gom ve 1 diem dieu phoi duy
// nhat tranh hoan toan van de nay.
const stack: (() => void)[] = [];

export function pushOverlayClose(onClose: () => void): () => void {
  stack.push(onClose);
  return () => {
    const idx = stack.lastIndexOf(onClose);
    if (idx !== -1) stack.splice(idx, 1);
  };
}

// Lop con nam trong ngan xep khong (chanDong.tsx: nut Back da pop lop ra ma form chan dong -> day lai de lan Back sau van dong lop nay).
export function overlayConTrongStack(onClose: () => void): boolean {
  return stack.includes(onClose);
}

// Dong lop TREN CUNG (neu co) - goi tu useExitConfirm khi bat popstate. Tra true neu co lop da dong
// (nut Back nen dung lai o day, KHONG hien confirm thoat), false neu khong con lop nao mo.
export function popTopOverlay(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top();
  return true;
}
