import { useCallback, useEffect, useRef, useState } from "react";

// Nut/vuot "Quay lai" cua he dieu hanh (Android, ke ca khi cai dat PWA standalone) khong duoc SPA nay
// dieu khien (khong dung React Router, khong tung pushState o dau ca - xem App.tsx) nen mac dinh
// thoat thang ung dung ngay lan bam dau tien du dang o man hinh nao - "an nham thoat luon rat bat
// tien" (phan hoi nguoi dung 2026-08-27). Ky thuat "back-button trap" chuan: day san 1 entry lich su
// gia luc mount; nut Quay lai lan dau chi pop ve entry that (khong roi trang), popstate bat duoc de
// hoi xac nhan thay vi thoat am tham. Chon "O lai": day lai trap, khong doi gi. Chon "Thoat": bat co
// leavingRef ROI moi go(-2) - popstate ma go() gay ra se bi bo qua (khong hoi lai/day trap tiep) nen
// lan lui nay di qua het ca entry trap lan entry that, thoat/lui thuc su nhu khong co trap.
export function useExitConfirm(enabled: boolean) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    leavingRef.current = false;
    window.history.pushState({ exitTrap: true }, "");

    function onPopState() {
      if (leavingRef.current) return;
      setConfirmOpen(true);
      window.history.pushState({ exitTrap: true }, "");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled]);

  const stay = useCallback(() => setConfirmOpen(false), []);
  const leave = useCallback(() => {
    leavingRef.current = true;
    setConfirmOpen(false);
    window.history.go(-2);
  }, []);

  return { confirmOpen, stay, leave };
}
