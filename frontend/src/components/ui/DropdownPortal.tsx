import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// Dropdown "xổ xuống" neo theo 1 anchor (o input/nut), render qua createPortal vao document.body thay
// vi absolute long trong DOM tai cho no dung (Select.tsx, LinhKienPicker.tsx, ColumnHeader.tsx) - sua
// bug "danh sách list xuống không hiện đủ" (bao cao 2026-08-26, dropdown "Chọn lý do" trong modal
// duyet don qua han bi CAT CUT o mep duoi modal). Nguyen nhan goc: Modal.tsx boc noi dung trong
// overflow-y-auto (khung ngoai con co overflow-hidden) - bat ky phan tu `position: absolute` nao long
// ben trong deu bi CAT theo bien cua ancestor overflow do, du z-index cao bao nhieu. Cung 1 co che
// con clip dropdown trong bang co overflow-x-auto (PaginatedTable.tsx) vi CSS tu dong suy ra
// overflow-y: auto khi da khai bao overflow-x khac visible. Dung `position: fixed` + toa do tinh
// truc tiep tu getBoundingClientRect() cua anchor de thoat hoan toan moi ancestor overflow, khong con
// phu thuoc vi tri dat trong cay DOM. Tu dong lat len tren (`openUpward`) khi khong du cho o duoi.
export function DropdownPortal({
  anchorRef,
  contentRef,
  open,
  children,
  matchWidth = true,
  minWidth,
  maxHeight = 320,
  className = "",
}: {
  anchorRef: RefObject<HTMLElement>;
  // Cho phep noi goi giu 1 ref rieng toi div noi dung dropdown - can de cong voi containerRef trong
  // logic "bam ra ngoai thi dong" (click vao dropdown gio KHONG con la con chau DOM cua containerRef
  // nua vi da chuyen sang portal, phai kiem tra ca 2 ref moi dung).
  contentRef?: RefObject<HTMLDivElement>;
  open: boolean;
  children: ReactNode;
  matchWidth?: boolean;
  // FIX (phan hoi 2026-09-05: "phiếu xuất kho, nhập lý do quá hạn cho đơn hàng, listdown lỗi hiện
  // thị") - matchWidth=true truoc day LUON khoa dropdown DUNG BANG be rong anchor, du anchor rat hep
  // (vd o Select "Lý do chậm" trong 1 <td> chat hep cua PhieuXuatKhoTab.tsx) khien nhan dai (vd "Do
  // Kho hàng lỗi...") bi cat cut khong doc duoc (truncate trong Select.tsx). minWidth (tuy chon) dam
  // bao dropdown KHONG BAO GIO hep hon gia tri nay du anchor hep hon, van giu matchWidth cho cac
  // truong hop anchor da du rong (Math.max, khong ep buoc rong hon can thiet).
  minWidth?: number;
  maxHeight?: number;
  className?: string;
}) {
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function reposition() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openUpward = spaceBelow < Math.min(maxHeight, 160) && r.top > spaceBelow;
      setPos({
        left: r.left,
        width: minWidth ? Math.max(r.width, minWidth) : r.width,
        top: openUpward ? undefined : r.bottom + 4,
        bottom: openUpward ? window.innerHeight - r.top + 4 : undefined,
      });
    }
    reposition();
    // capture:true de bat duoc scroll cua BAT KY ancestor nao (vd vung overflow-y-auto cua Modal),
    // khong chi scroll cua window.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, anchorRef, maxHeight, minWidth]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={contentRef}
      // Chan lan truyen o day (khong chi dua vao check ref o noi goi) - vi day la NOI DUY NHAT chac
      // chan nam giua moi click ben trong dropdown va bat ky document-level "bam ra ngoai thi dong"
      // nao o noi goi (ColumnHeader.tsx dung "click" khong kem check ref, chi dua vao stopPropagation).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: matchWidth ? pos.width : undefined,
        maxHeight,
        zIndex: 9999,
      }}
      // Khong dat san padding/rounded o day (tranh xung dot Tailwind voi className truyen vao tu noi
      // goi, vd "py-1" vs "py-1.5") - moi noi goi tu khai bao qua prop `className`.
      className={`overflow-y-auto bg-[var(--surface)] border border-[var(--line)] shadow-lg anim-in ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
