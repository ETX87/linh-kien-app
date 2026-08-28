import { useCallback, useEffect, useRef, useState } from "react";
import { popTopOverlay } from "../lib/overlayStack";

// Nut/vuot "Quay lai" cua he dieu hanh (Android, ke ca khi cai dat PWA standalone) khong duoc SPA nay
// dieu khien (khong dung React Router, khong tung pushState o dau ca - xem App.tsx) nen mac dinh
// thoat thang ung dung ngay lan bam dau tien du dang o man hinh nao - "an nham thoat luon rat bat
// tien" (phan hoi nguoi dung 2026-08-27). Ky thuat "back-button trap" chuan: day san 1 entry lich su
// gia luc mount; nut Quay lai lan dau chi pop ve entry that (khong roi trang - browser TU lui truoc
// khi popstate ban ra, nen luc handler chay la DA DUNG vi tri "that su lui 1 buoc" roi), popstate bat
// duoc de hoi xac nhan thay vi thoat am tham.
//
// FIX (phan hoi 2026-08-28: "popup hỏi thoát app lúc hỏi lúc không, ấn Thoát bị đơ không thoát") -
// BAN CU day lai 1 trap NGAY trong popstate (truoc ca khi biet nguoi dung se chon gi), roi leave() bu
// lai bang go(-2). Loi: go(-2) gia dinh LUON co it nhat 2 entry lich su phia sau (1 trap + 1 "that")
// de lui qua - PWA standalone moi mo (hoac tab moi, chua tung dieu huong) co the CHI CO DUNG 1 entry,
// khien go(-2) vuot qua dau lich su va bi trinh duyet AM THAM BO QUA (khong bao loi) - dialog dong
// nhung app khong thoat, nhin nhu "đơ". Sua: popstate KHONG con day lai trap ngay nua - luc handler
// chay la DA DUNG vi tri "lui 1 buoc that" roi, nen leave() chi can lui THEM DUNG 1 buoc nua (khong
// phai 2) de hoan tat - it hay du lich su den dau cung khong bi vuot qua dau. leavingRef van can giu
// (khac voi 1 ban sua truoc) vi buoc lui nay cua leave() TU no cung ban ra popstate - phai bao handler
// bo qua popstate do, neu khong dialog se hien lai ngay sau khi vua bam "Thoát". Trap CHI duoc day lai
// khi nguoi dung chon "Ở lại" (stay()) - luc do moi can bay tiep cho lan back ke tiep.
export function useExitConfirm(enabled: boolean) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    leavingRef.current = false;
    window.history.pushState({ exitTrap: true }, "");

    function onPopState() {
      if (leavingRef.current) return;
      // Neu co Drawer/Modal dang mo (xem overlayStack.ts), nut Back chi DONG lop do + day lai trap de
      // bay tiep, KHONG hien hop thoai xac nhan thoat (phan hoi 2026-08-28 lan 1).
      if (popTopOverlay()) {
        window.history.pushState({ exitTrap: true }, "");
        return;
      }
      setConfirmOpen(true);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enabled]);

  const stay = useCallback(() => {
    setConfirmOpen(false);
    window.history.pushState({ exitTrap: true }, "");
  }, []);
  const leave = useCallback(() => {
    leavingRef.current = true;
    setConfirmOpen(false);
    window.history.back();
  }, []);

  return { confirmOpen, stay, leave };
}
