import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pushOverlayClose } from "../../lib/overlayStack";
import { ChanDongContext, useDongCoHoi } from "./chanDong";
import { tn } from "../../i18n";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
  height = "max-h-[88vh]",
  footer,
  headerExtra,
  bodyClassName = "overflow-y-auto p-5",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  height?: string;
  // Khoi co dinh o day Modal (vd tong tien + nut hanh dong) - nam NGOAI vung overflow-y-auto nen
  // luon hien du cuon noi dung ben tren bao nhieu, giong thanh tong tien/thanh toan co dinh cua
  // cac trang gio hang (Shopee/Tiki). Mac dinh undefined = khong render gi them, khong doi hanh vi
  // cac noi goi Modal khac.
  footer?: ReactNode;
  // Hanh dong cap-modal (vd nut "Sua") dat CANH nut dong ✕ - tach khoi vung noi dung, danh cho
  // hanh dong dieu khien chinh modal thay vi lan vao hang thong tin/badge ben trong (ra soat module
  // "Dat Mua Linh Kien 2.0" #18). Mac dinh undefined = khong doi giao dien cac noi goi Modal khac.
  headerExtra?: ReactNode;
  // Lop CSS vung noi dung - mac dinh cuon doc + p-5. Man tu chia nhieu cot cuon rieng (vd Tao don desktop v1.491) truyen
  // "flex-1 min-h-0 overflow-hidden" de tu quan ly cuon tung cot.
  bodyClassName?: string;
}) {
  // FIX (phan hoi 2026-08-28: "popup thoát app lúc hỏi lúc không") - Modal (dung o ~40 noi, khac
  // Drawer.tsx) truoc day KHONG dang ky voi ngan xep overlay dung chung, nen nut Back tren mobile
  // BO QUA Modal dang mo va nhay thang toi hoi "Thoát ứng dụng?" - hanh vi khac nhau tuy dang mo
  // Drawer hay Modal la nguyen nhan "lúc hỏi lúc không". Them dung 1 effect giong het Drawer.tsx.
  // Form ben trong co the chan dong (chanDong.tsx, 2026-10-27).
  const [dangKyChan, dong] = useDongCoHoi(onClose);
  useEffect(() => {
    if (!open) return;
    return pushOverlayClose(dong);
  }, [open, dong]);

  if (!open) return null;
  // Render qua portal vao document.body (2026-09-29, bug "Đổi loại chiết khấu" chu tran ngang): Modal mo tu TRONG 1 o
  // bang .tbl (vd LoaiChietKhauPicker) truoc day ke thua white-space: nowrap / flex-wrap: nowrap cua o bang -> chu
  // khong xuong dong, tran ngang. Su kien React van noi bot theo cay component nhu cu (portal khong doi).
  return createPortal(
    // FIX (phan hoi nguoi dung 2026-09-13: "sửa thông tin linh kiện => Phân loại, đang không hiện
    // listdown để chọn") - bo backdrop-blur-[2px]: Chromium co bug lau nam (vd crbug 1450640) khien
    // popup goi y <datalist> KHONG hien ra khi 1 ancestor co backdrop-filter/filter (tao "containing
    // block" moi lam sai lech vi tri popup native) - <select> thuong (dung nhieu noi khac trong app)
    // KHONG bi anh huong vi dung co che popup khac ben trong Chromium, nen truoc gio khong ai phat
    // hien. Chi bo hieu ung mo nen (thuan tuy tham my, van giu lop phu toi bg-[rgba(...)] ben duoi).
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4">
      <div className={`bg-[var(--surface)] rounded-[14px] w-full ${width} ${height} overflow-hidden flex flex-col anim-in shadow-[var(--shadow-drawer)]`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border-soft)]">
          <h3 className="text-base font-bold text-[var(--color-text)]">{tn(title)}</h3>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button onClick={dong} className="focus-ring w-8 h-8 rounded-[var(--radius-btn)] hover:bg-[var(--color-subtle)] text-[var(--color-text-faint)] hover:text-[var(--color-text-body)]">
              ✕
            </button>
          </div>
        </div>
        <ChanDongContext.Provider value={dangKyChan}>
          <div className={bodyClassName}>{children}</div>
          {footer && <div className="border-t border-[var(--color-border-soft)] bg-[var(--surface)] px-5 py-3">{footer}</div>}
        </ChanDongContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
