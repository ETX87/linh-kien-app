import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { overlayConTrongStack, pushOverlayClose } from "../../lib/overlayStack";

// "Chan dong" Drawer / Modal (2026-10-27): 1 form ben trong dang co du lieu CHUA gui (vd anh bang chung chuyen tien da tai len nhung KTV chua
// bam "Đã chuyển") dang ky 1 ham hoi lai; Drawer / Modal chua no goi het cac ham do TRUOC khi dong (nut ✕, Esc, bam nen, nut Back mobile)
// - ham tra false = o lai. Pham vi theo cay component (context), nen chi chan dung overlay chua form.

export type HoiTruocKhiDong = () => boolean | Promise<boolean>;
type DangKy = (hoi: HoiTruocKhiDong) => () => void;

export const ChanDongContext = createContext<DangKy | null>(null);

/** Dung trong Drawer / Modal: tra ve [dangKy (cho Provider), dong (co hoi truoc)]. */
export function useDongCoHoi(onClose: () => void): [DangKy, () => void] {
  const ds = useRef(new Set<HoiTruocKhiDong>());
  const dangKy = useCallback<DangKy>((hoi) => {
    ds.current.add(hoi);
    return () => {
      ds.current.delete(hoi);
    };
  }, []);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dangHoi = useRef(false);
  const dongRef = useRef<() => void>(() => {});
  const dong = useCallback(() => {
    if (ds.current.size === 0) {
      onCloseRef.current();
      return;
    }
    if (dangHoi.current) return;
    dangHoi.current = true;
    void (async () => {
      try {
        for (const hoi of [...ds.current]) {
          if (!(await hoi())) {
            // O lai: nut Back (popTopOverlay) da lay lop nay khoi ngan xep -> day lai (cleanup cua overlay go dung tham chieu nay).
            if (!overlayConTrongStack(dongRef.current)) pushOverlayClose(dongRef.current);
            return;
          }
        }
        onCloseRef.current();
      } finally {
        dangHoi.current = false;
      }
    })();
  }, []);
  dongRef.current = dong;
  return [dangKy, dong];
}

/** Dung trong form: khi `chan` = true, overlay chua form se goi `hoi` truoc khi dong; dong tab / tai lai trang thi trinh duyet hoi. */
export function useChanDong(chan: boolean, hoi: HoiTruocKhiDong, hoiKhiTaiLai = true) {
  const dangKy = useContext(ChanDongContext);
  const hoiRef = useRef(hoi);
  hoiRef.current = hoi;
  useEffect(() => {
    if (!chan || !dangKy) return;
    return dangKy(() => hoiRef.current());
  }, [chan, dangKy]);
  useEffect(() => {
    if (!chan || !hoiKhiTaiLai) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [chan, hoiKhiTaiLai]);
}
